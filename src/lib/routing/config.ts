import type { OptimizationMode, TaskType } from "@/lib/planner/types";
import type { RegistryModel } from "@/lib/ai/types";

export type CapabilityAxis = "coding" | "reasoning" | "planning" | "debugging" | "research";

// Local planning settings. They are not a benchmark and can be changed without a schema migration.
export const ROUTING_CONFIG = {
  maxAttempts: 3,
  historyFullWeightAttempts: 20,
  probability: {
    priorBase: 0.35,
    capabilityWeight: 0.5,
    difficultyPenalty: { low: 0, medium: 0.06, high: 0.12 },
    complexityStep: 0.02,
    reliabilityStep: 0.04,
    floor: 0.02,
    ceiling: 0.98,
  },
  minSuccessProbability: { savings: 0.35, balanced: 0.45, quality: 0.7 } satisfies Record<OptimizationMode, number>,
  modeCapabilityAdjust: { savings: -1, balanced: 0, quality: 1 } satisfies Record<OptimizationMode, number>,
  qualityCostMultiple: 2.5,
  verificationFraction: { savings: 0.15, balanced: 0.25, quality: 0.4 } satisfies Record<OptimizationMode, number>,
  balancedSpeedPenalty: 0.05,
  baseMinimum: {
    analysis: 2,
    planning: 2,
    architecture: 3,
    coding: 2,
    refactoring: 2,
    debugging: 2,
    testing: 2,
    documentation: 1,
    security: 3,
    review: 2,
  } satisfies Record<TaskType, number>,
  primaryAxis: {
    analysis: "research",
    planning: "planning",
    architecture: "reasoning",
    coding: "coding",
    refactoring: "coding",
    debugging: "debugging",
    testing: "coding",
    documentation: "research",
    security: "reasoning",
    review: "reasoning",
  } satisfies Record<TaskType, CapabilityAxis>,
  inputTokens: {
    analysis: 2000,
    planning: 2000,
    architecture: 2500,
    coding: 4000,
    refactoring: 5000,
    debugging: 4500,
    testing: 3000,
    documentation: 1500,
    security: 3500,
    review: 2000,
  } satisfies Record<TaskType, number>,
  outputTokens: {
    analysis: 800,
    planning: 800,
    architecture: 1000,
    coding: 1500,
    refactoring: 1800,
    debugging: 1200,
    testing: 1000,
    documentation: 700,
    security: 1000,
    review: 800,
  } satisfies Record<TaskType, number>,
  instructionTokens: 400,
  toolTypes: ["coding", "refactoring", "debugging", "testing", "security"] as const,
} as const;

export const ESTIMATE_NOTE =
  "Success probabilities are estimates from configured capability ratings and observed history. They are not a measured accuracy.";

export function axisScore(model: RegistryModel, axis: CapabilityAxis): number {
  return model[axis];
}
