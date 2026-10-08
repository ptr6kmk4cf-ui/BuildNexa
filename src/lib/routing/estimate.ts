import { calculateCost } from "@/lib/ai/cost";
import type { RegistryModel } from "@/lib/ai/types";
import type { OptimizationMode, TaskDifficulty, TaskType } from "@/lib/planner/types";
import { ROUTING_CONFIG, axisScore, type CapabilityAxis } from "@/lib/routing/config";
import { blendProbability } from "@/lib/routing/history";
import { addMoney, multiplyMoney } from "@/lib/routing/money";
import type { HistorySample } from "@/lib/routing/types";

export type CostParts = {
  initialCostUsd: string;
  retryCostUsd: string;
  escalationCostUsd: string;
  contextCostUsd: string;
  verificationCostUsd: string;
  estimatedCostUsd: string;
};

export function requiredCapability(type: TaskType, difficulty: TaskDifficulty, complexity: number, priority: string, mode: OptimizationMode): number {
  const complexityBump = complexity >= 4 ? 1 : 0;
  const priorityBump = priority === "critical" ? 1 : 0;
  const difficultyBump = difficulty === "high" ? 2 : difficulty === "medium" ? 1 : 0;
  const raw =
    ROUTING_CONFIG.baseMinimum[type] +
    difficultyBump +
    complexityBump +
    priorityBump +
    ROUTING_CONFIG.modeCapabilityAdjust[mode];
  return Math.min(5, Math.max(1, raw));
}

export function priorSuccess(model: RegistryModel, type: TaskType, difficulty: TaskDifficulty, complexity: number): number {
  const fit = axisScore(model, ROUTING_CONFIG.primaryAxis[type]) / 5;
  const settings = ROUTING_CONFIG.probability;
  const value =
    settings.priorBase +
    fit * settings.capabilityWeight -
    settings.difficultyPenalty[difficulty] -
    Math.max(0, complexity - 1) * settings.complexityStep +
    (model.reliability - 3) * settings.reliabilityStep;
  return Math.min(settings.ceiling, Math.max(settings.floor, value));
}

export function successEstimate(
  model: RegistryModel,
  type: TaskType,
  difficulty: TaskDifficulty,
  complexity: number,
  history: HistorySample | null,
): { probability: number; weight: number; attempts: number } {
  const blended = blendProbability(priorSuccess(model, type, difficulty, complexity), history);
  return {
    probability: round4(blended.probability),
    weight: blended.weight,
    attempts: history?.attempts ?? 0,
  };
}

export function tokenPlan(type: TaskType, complexity: number): { contextTokens: number; instructionTokens: number; outputTokens: number } {
  const factor = 0.7 + complexity * 0.15;
  return {
    contextTokens: scale(ROUTING_CONFIG.inputTokens[type], factor),
    instructionTokens: ROUTING_CONFIG.instructionTokens,
    outputTokens: scale(ROUTING_CONFIG.outputTokens[type], factor),
  };
}

export function quoteTokens(model: RegistryModel, inputTokens: number, outputTokens: number): string | null {
  const quote = calculateCost(model.pricing, { inputTokens, outputTokens, cachedInputTokens: 0 });
  if (!quote.priced || quote.amount === null) return null;
  return quote.amount;
}

export function expectedCost(input: {
  model: RegistryModel;
  escalation: RegistryModel | null;
  type: TaskType;
  complexity: number;
  mode: OptimizationMode;
  probability: number;
  risky: boolean;
}): CostParts | null {
  const tokens = tokenPlan(input.type, input.complexity);
  const contextCostUsd = quoteTokens(input.model, tokens.contextTokens, 0);
  const initialCostUsd = quoteTokens(input.model, tokens.instructionTokens, tokens.outputTokens);
  if (contextCostUsd === null || initialCostUsd === null) return null;

  const attemptCost = addMoney([contextCostUsd, initialCostUsd]);
  if (attemptCost === null) return null;
  const expectedRetries = Math.max(0, Math.min(ROUTING_CONFIG.maxAttempts, 1 / input.probability) - 1);
  const retryCostUsd = multiplyMoney(attemptCost, expectedRetries);
  const verificationShare = ROUTING_CONFIG.verificationFraction[input.mode] + (input.risky ? 0.1 : 0);
  const verificationCostUsd = multiplyMoney(initialCostUsd, verificationShare);
  const failureProbability = (1 - input.probability) ** ROUTING_CONFIG.maxAttempts;
  const escalationModel = input.escalation ?? input.model;
  const escalationAttempt =
    quoteTokens(escalationModel, tokens.contextTokens + tokens.instructionTokens, tokens.outputTokens) ?? attemptCost;
  const escalationCostUsd = multiplyMoney(escalationAttempt, failureProbability);
  if (retryCostUsd === null || verificationCostUsd === null || escalationCostUsd === null) return null;
  const estimatedCostUsd = addMoney([initialCostUsd, retryCostUsd, escalationCostUsd, contextCostUsd, verificationCostUsd]);
  if (estimatedCostUsd === null) return null;
  return { initialCostUsd, retryCostUsd, escalationCostUsd, contextCostUsd, verificationCostUsd, estimatedCostUsd };
}

export function needsTools(type: TaskType): boolean {
  return (ROUTING_CONFIG.toolTypes as readonly string[]).includes(type);
}

export function isRisky(type: TaskType, difficulty: TaskDifficulty, priority: string): boolean {
  return type === "security" || priority === "critical" || (type === "refactoring" && difficulty === "high");
}

export function isImportant(difficulty: TaskDifficulty, priority: string, complexity: number): boolean {
  return difficulty === "high" || priority === "high" || priority === "critical" || complexity >= 4;
}

export function primaryAxis(type: TaskType): CapabilityAxis {
  return ROUTING_CONFIG.primaryAxis[type];
}

function scale(base: number, factor: number): number {
  return Math.max(1, Math.round(base * factor));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
