import type { TaskType } from "@/lib/planner/types";
import type { ProviderId } from "@/lib/ai/types";
import { ROUTING_CONFIG } from "@/lib/routing/config";
import type { HistorySample } from "@/lib/routing/types";

export type PerformanceObservation = {
  provider: ProviderId;
  modelId: string;
  taskType: TaskType;
  succeeded: boolean;
};

export function summarizeHistory(observations: readonly PerformanceObservation[]): HistorySample[] {
  const grouped = new Map<string, HistorySample>();
  for (const observation of observations) {
    const key = `${observation.provider}:${observation.modelId}:${observation.taskType}`;
    const current = grouped.get(key) ?? {
      provider: observation.provider,
      modelId: observation.modelId,
      taskType: observation.taskType,
      attempts: 0,
      successes: 0,
    };
    current.attempts += 1;
    if (observation.succeeded) current.successes += 1;
    grouped.set(key, current);
  }
  return [...grouped.values()];
}

export function findHistory(
  history: readonly HistorySample[],
  provider: ProviderId,
  modelId: string,
  taskType: TaskType,
): HistorySample | null {
  return history.find((sample) => sample.provider === provider && sample.modelId === modelId && sample.taskType === taskType) ?? null;
}

export function blendProbability(prior: number, sample: HistorySample | null): { probability: number; weight: number } {
  const clampedPrior = clampProbability(prior);
  if (!sample || sample.attempts < 1 || sample.successes < 0 || sample.successes > sample.attempts) {
    return { probability: clampedPrior, weight: 0 };
  }
  const weight = Math.min(1, sample.attempts / ROUTING_CONFIG.historyFullWeightAttempts);
  const observed = sample.successes / sample.attempts;
  return { probability: clampProbability((1 - weight) * clampedPrior + weight * observed), weight };
}

function clampProbability(value: number): number {
  return Math.min(ROUTING_CONFIG.probability.ceiling, Math.max(ROUTING_CONFIG.probability.floor, value));
}
