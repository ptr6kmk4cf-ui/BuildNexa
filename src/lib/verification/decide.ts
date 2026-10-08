import { addMoney, compareMoney, multiplyMoney } from "@/lib/routing/money";
import { VERIFICATION_CONFIG } from "@/lib/verification/config";
import type { EscalationDecision, EscalationInput, EscalationModel } from "@/lib/verification/types";

export function decideEscalation(input: EscalationInput): EscalationDecision {
  if (input.attempt >= input.maxAttempts) {
    return { action: "stop", reason: `the attempt limit of ${input.maxAttempts} was reached.` };
  }
  if (input.outcome === "unknown") {
    return {
      action: "stop",
      reason: "the checks could not be run, so another model call would not show whether the task is complete.",
    };
  }

  const retryCost = input.current.estimatedCostUsd;
  const canRetry =
    input.sameModelAttempts <= input.maxSameModelRetries &&
    retryCost !== null &&
    probabilityAllowsRetry(input.current.successProbability) &&
    fitsBudget(input.spentUsd, retryCost, input.budgetUsd);
  if (canRetry) {
    return {
      action: "retry",
      reason: `Retrying ${input.current.displayName} with the verification failure in the prompt. Estimated added cost $${retryCost}.`,
    };
  }

  const selected = input.routed.selected;
  const chosen = selected
    ? input.routed.candidates.find((candidate) => candidate.provider === selected.provider && candidate.modelId === selected.modelId) ?? null
    : null;
  const different = selected !== null && (selected.provider !== input.current.provider || selected.modelId !== input.current.modelId);
  const nextCost = chosen?.estimatedCostUsd ?? null;
  const nextProbability = chosen?.successProbability ?? null;
  if (
    different &&
    selected &&
    nextCost !== null &&
    nextProbability !== null &&
    fitsBudget(input.spentUsd, nextCost, input.budgetUsd) &&
    worthEscalating(input.current, nextCost, nextProbability)
  ) {
    return {
      action: "escalate",
      model: {
        provider: selected.provider,
        modelId: selected.modelId,
        displayName: selected.displayName,
        estimatedCostUsd: nextCost,
        successProbability: nextProbability,
      },
      reason: `Routing selected ${selected.displayName} after ${input.current.displayName} failed verification. Estimated cost $${nextCost}. Success estimate ${Math.round(nextProbability * 100)}%.`,
    };
  }

  if (input.budgetUsd && retryCost && !fitsBudget(input.spentUsd, retryCost, input.budgetUsd)) {
    return { action: "stop", reason: "another attempt would exceed the project budget." };
  }
  if (!different || !selected) {
    if (
      retryCost !== null &&
      probabilityAllowsRetry(input.current.successProbability) &&
      fitsBudget(input.spentUsd, retryCost, input.budgetUsd)
    ) {
      return {
        action: "retry",
        reason: `Retrying ${input.current.displayName} again because routing did not select a different model. Estimated added cost $${retryCost}.`,
      };
    }
    return { action: "stop", reason: "routing did not select a different model that is worth the extra cost." };
  }
  return { action: "stop", reason: "a stronger model was not economically justified for this failure." };
}

function probabilityAllowsRetry(probability: number | null): boolean {
  if (probability === null) return true;
  return probability >= VERIFICATION_CONFIG.minRetryProbability;
}

function fitsBudget(spentUsd: string, nextUsd: string, budgetUsd: string | null): boolean {
  if (!budgetUsd) return true;
  const total = addMoney([spentUsd, nextUsd]);
  if (!total) return false;
  const comparison = compareMoney(total, budgetUsd);
  return comparison !== null && comparison <= 0;
}

function worthEscalating(current: EscalationModel, nextCost: string, nextProbability: number): boolean {
  const currentProbability = current.successProbability ?? 0;
  const gain = nextProbability - currentProbability;
  if (gain < VERIFICATION_CONFIG.minEscalationGain && current.estimatedCostUsd && compareMoney(nextCost, current.estimatedCostUsd) === 1) {
    return false;
  }
  if (!current.estimatedCostUsd) return gain >= VERIFICATION_CONFIG.minEscalationGain;
  const ceiling = multiplyMoney(current.estimatedCostUsd, VERIFICATION_CONFIG.maxEscalationMultiple);
  if (!ceiling) return false;
  const comparison = compareMoney(nextCost, ceiling);
  return comparison !== null && comparison <= 0;
}
