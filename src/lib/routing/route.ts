import type { RegistryModel } from "@/lib/ai/types";
import type { OptimizationMode } from "@/lib/planner/types";
import { ESTIMATE_NOTE, ROUTING_CONFIG, axisScore } from "@/lib/routing/config";
import {
  expectedCost,
  isImportant,
  isRisky,
  needsTools,
  primaryAxis,
  requiredCapability,
  successEstimate,
  tokenPlan,
} from "@/lib/routing/estimate";
import { findHistory } from "@/lib/routing/history";
import { compareMoney, multiplyMoney } from "@/lib/routing/money";
import type {
  CandidateAssessment,
  DecisionFactor,
  HistorySample,
  RouteTaskInput,
  RoutingDecision,
  RoutingOutcome,
} from "@/lib/routing/types";
import type { ProviderId } from "@/lib/ai/types";

export type RouteRequest = {
  task: RouteTaskInput;
  mode: OptimizationMode;
  models: readonly RegistryModel[];
  availableProviders: ReadonlySet<ProviderId>;
  history?: readonly HistorySample[];
};

type PricedCandidate = CandidateAssessment & { estimatedCostUsd: string; successProbability: number };

export function routeTask(request: RouteRequest): RoutingDecision {
  const history = request.history ?? [];
  const minimum = requiredCapability(
    request.task.type,
    request.task.difficulty,
    request.task.complexity,
    request.task.priority,
    request.mode,
  );
  const tokens = tokenPlan(request.task.type, request.task.complexity);
  const risky = isRisky(request.task.type, request.task.difficulty, request.task.priority);
  const candidates = request.models.map((model) => assess(model, request, history, minimum, tokens.contextTokens, risky));
  const eligible = candidates.filter(isPricedEligible);
  const selected = choose(eligible, request, request.models);
  const outcome = selected ? "selected" : outcomeWhenNone(request, candidates);
  const chosen = selected ? candidates.find((candidate) => candidate.modelId === selected.modelId && candidate.provider === selected.provider) ?? null : null;

  return {
    taskId: request.task.id,
    mode: request.mode,
    outcome,
    selected: selected
      ? { provider: selected.provider, modelId: selected.modelId, displayName: selected.displayName }
      : null,
    estimatedCostUsd: chosen?.estimatedCostUsd ?? null,
    successProbability: chosen?.successProbability ?? null,
    factors: decisionFactors(request, minimum, chosen, eligible, outcome),
    candidates,
    estimateNote: ESTIMATE_NOTE,
  };
}

function assess(
  model: RegistryModel,
  request: RouteRequest,
  history: readonly HistorySample[],
  minimum: number,
  contextTokens: number,
  risky: boolean,
): CandidateAssessment {
  const axis = primaryAxis(request.task.type);
  const score = axisScore(model, axis);
  const sample = findHistory(history, model.provider, model.modelId, request.task.type);
  const estimate = successEstimate(model, request.task.type, request.task.difficulty, request.task.complexity, sample);
  const floor = ROUTING_CONFIG.minSuccessProbability[request.mode];
  const blank = {
    provider: model.provider,
    modelId: model.modelId,
    displayName: model.displayName,
    eligible: false,
    successProbability: estimate.probability,
    estimatedCostUsd: null,
    initialCostUsd: null,
    retryCostUsd: null,
    escalationCostUsd: null,
    contextCostUsd: null,
    verificationCostUsd: null,
    factors: [] as DecisionFactor[],
  };

  if (!request.availableProviders.has(model.provider)) {
    return { ...blank, successProbability: null, rejection: { code: "provider_unavailable", detail: "Provider is turned off or has no API key." } };
  }
  if (needsTools(request.task.type) && !model.toolSupport) {
    return { ...blank, rejection: { code: "tools", detail: "This task needs tool support." } };
  }
  if (contextTokens > model.contextWindow) {
    return {
      ...blank,
      rejection: {
        code: "context_window",
        detail: `Context estimate of ${contextTokens.toLocaleString("en-US")} tokens exceeds the ${model.contextWindow.toLocaleString("en-US")} token window.`,
      },
    };
  }
  if (score < minimum) {
    return {
      ...blank,
      rejection: {
        code: "insufficient_capability",
        detail: `${labelAxis(axis)} rating ${score} is below the minimum of ${minimum}.`,
      },
    };
  }

  const escalation = escalationModel(model, request, axis);
  const parts = expectedCost({
    model,
    escalation,
    type: request.task.type,
    complexity: request.task.complexity,
    mode: request.mode,
    probability: estimate.probability,
    risky,
  });
  if (!parts) {
    return { ...blank, successProbability: null, rejection: { code: "unpriced", detail: "No price is configured, so expected cost cannot be calculated." } };
  }
  if (estimate.probability < floor) {
    return {
      ...blank,
      ...parts,
      rejection: {
        code: "below_success_floor",
        detail: `Success estimate ${percent(estimate.probability)} is below the ${request.mode} floor of ${percent(floor)}.`,
      },
    };
  }

  return {
    ...blank,
    ...parts,
    eligible: true,
    rejection: null,
    factors: candidateFactors(model, request.mode, axis, score, minimum, estimate, sample?.attempts ?? 0, parts),
  };
}

function choose(
  eligible: readonly PricedCandidate[],
  request: RouteRequest,
  models: readonly RegistryModel[],
): PricedCandidate | null {
  if (eligible.length === 0) return null;
  const ranked = [...eligible].sort((left, right) => compareCandidates(left, right, request.mode, models));
  const cheapest = ranked[0];
  if (!cheapest) return null;
  if (request.mode !== "quality" || !isImportant(request.task.difficulty, request.task.priority, request.task.complexity)) {
    return cheapest;
  }
  const cap = multiplyMoney(cheapest.estimatedCostUsd, ROUTING_CONFIG.qualityCostMultiple);
  const band = cap
    ? eligible.filter((candidate) => {
        const order = compareMoney(candidate.estimatedCostUsd, cap);
        return order !== null && order <= 0;
      })
    : eligible;
  return [...band].sort((left, right) => {
    if (right.successProbability !== left.successProbability) return right.successProbability - left.successProbability;
    return compareCandidates(left, right, request.mode, models);
  })[0] ?? cheapest;
}

function compareCandidates(
  left: PricedCandidate,
  right: PricedCandidate,
  mode: OptimizationMode,
  models: readonly RegistryModel[],
): number {
  const cost = compareMoney(scoredCost(left, mode, models), scoredCost(right, mode, models));
  if (cost !== null && cost !== 0) return cost;
  if (right.successProbability !== left.successProbability) return right.successProbability - left.successProbability;
  return left.modelId.localeCompare(right.modelId);
}

function scoredCost(candidate: PricedCandidate, mode: OptimizationMode, models: readonly RegistryModel[]): string {
  const speed = models.find((model) => model.provider === candidate.provider && model.modelId === candidate.modelId)?.speed ?? 3;
  const multiplier = mode === "balanced" && speed < 3 ? 1 + (3 - speed) * ROUTING_CONFIG.balancedSpeedPenalty : 1;
  return multiplyMoney(candidate.estimatedCostUsd, multiplier) ?? candidate.estimatedCostUsd;
}

function escalationModel(model: RegistryModel, request: RouteRequest, axis: ReturnType<typeof primaryAxis>): RegistryModel | null {
  const stronger = request.models.filter(
    (entry) =>
      request.availableProviders.has(entry.provider) &&
      entry.modelId !== model.modelId &&
      axisScore(entry, axis) > axisScore(model, axis) &&
      (!needsTools(request.task.type) || entry.toolSupport),
  );
  if (stronger.length === 0) return null;
  return [...stronger].sort((left, right) => axisScore(right, axis) - axisScore(left, axis) || left.modelId.localeCompare(right.modelId))[0] ?? null;
}

function outcomeWhenNone(request: RouteRequest, candidates: readonly CandidateAssessment[]): RoutingOutcome {
  if (request.models.length === 0 || request.availableProviders.size === 0) return "provider_unavailable";
  const available = candidates.filter((candidate) => candidate.rejection?.code !== "provider_unavailable");
  if (available.length === 0) return "provider_unavailable";
  const capable = available.filter(
    (candidate) => candidate.rejection?.code !== "insufficient_capability" && candidate.rejection?.code !== "tools" && candidate.rejection?.code !== "context_window",
  );
  if (capable.length === 0) return "insufficient_capability";
  if (capable.every((candidate) => candidate.rejection?.code === "unpriced")) return "unpriced";
  return "below_threshold";
}

function decisionFactors(
  request: RouteRequest,
  minimum: number,
  chosen: CandidateAssessment | null,
  eligible: readonly PricedCandidate[],
  outcome: RoutingOutcome,
): DecisionFactor[] {
  const modeDetail =
    request.mode === "savings"
      ? "Savings keeps a minimum quality floor, then picks the lowest expected cost."
      : request.mode === "quality"
        ? "Quality raises the floor and will pay more for a higher success estimate on important tasks."
        : "Balanced picks the lowest expected cost among models that clear the quality floor.";
  const factors: DecisionFactor[] = [{ name: "mode", detail: modeDetail }];
  if (!chosen || outcome !== "selected") {
    factors.push({ name: "result", detail: resultDetail(outcome, minimum) });
    return factors;
  }
  factors.push(...chosen.factors.filter((factor) => factor.name !== "speed"));
  const alternative = eligible.find((candidate) => candidate.modelId !== chosen.modelId);
  if (alternative && request.mode === "quality" && isImportant(request.task.difficulty, request.task.priority, request.task.complexity)) {
    factors.push({
      name: "choice",
      detail: `${chosen.displayName} is selected for a higher success estimate within the quality cost band.`,
    });
  } else if (alternative) {
    factors.push({
      name: "choice",
      detail: `${chosen.displayName} beats ${alternative.displayName} on expected cost for a successful result.`,
    });
  }
  return factors;
}

function resultDetail(outcome: RoutingOutcome, minimum: number): string {
  if (outcome === "provider_unavailable") return "No enabled provider with an API key has a model in this set.";
  if (outcome === "insufficient_capability") return `No available model meets the capability minimum of ${minimum}, including tool support and context size.`;
  if (outcome === "unpriced") return "Capable models are missing prices, so a cost cannot be estimated.";
  return "Models cleared the capability check, but none reached the success-estimate floor.";
}

function candidateFactors(
  model: RegistryModel,
  mode: OptimizationMode,
  axis: ReturnType<typeof primaryAxis>,
  score: number,
  minimum: number,
  estimate: { probability: number; weight: number; attempts: number },
  attempts: number,
  parts: NonNullable<ReturnType<typeof expectedCost>>,
): DecisionFactor[] {
  const historyDetail =
    estimate.weight === 0
      ? `Success estimate ${percent(estimate.probability)} from the capability rating. No history yet.`
      : `Success estimate ${percent(estimate.probability)} blends the capability rating with ${attempts} observed attempts.`;
  const factors: DecisionFactor[] = [
    { name: "capability", detail: `${labelAxis(axis)} rating ${score} meets the minimum of ${minimum}.` },
    { name: "success", detail: historyDetail },
    {
      name: "cost",
      detail: `Expected cost $${parts.estimatedCostUsd} = first run $${parts.initialCostUsd} + retries $${parts.retryCostUsd} + escalation $${parts.escalationCostUsd} + context $${parts.contextCostUsd} + verification $${parts.verificationCostUsd}.`,
    },
  ];
  if (mode === "balanced" && model.speed < 3) {
    factors.push({ name: "speed", detail: `Speed rating ${model.speed} adds a penalty in balanced mode.` });
  }
  return factors;
}

function isPricedEligible(candidate: CandidateAssessment): candidate is PricedCandidate {
  return candidate.eligible && candidate.estimatedCostUsd !== null && candidate.successProbability !== null;
}

function labelAxis(axis: ReturnType<typeof primaryAxis>): string {
  if (axis === "coding") return "Coding";
  if (axis === "debugging") return "Debugging";
  if (axis === "planning") return "Planning";
  if (axis === "research") return "Research";
  return "Reasoning";
}

function percent(probability: number): string {
  return `${Math.round(probability * 100)}%`;
}
