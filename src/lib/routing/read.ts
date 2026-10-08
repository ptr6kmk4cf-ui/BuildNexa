import type { DecisionFactor } from "@/lib/routing/types";

export type DecisionCandidateView = {
  displayName: string;
  modelId: string;
  eligible: boolean;
  detail: string | null;
  estimatedCostUsd: string | null;
  successProbability: number | null;
};

export function readFactors(value: unknown): DecisionFactor[] {
  if (!Array.isArray(value)) return [];
  const factors: DecisionFactor[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.name !== "string" || typeof entry.detail !== "string") continue;
    factors.push({ name: entry.name, detail: entry.detail });
  }
  return factors;
}

export function readCandidateViews(value: unknown): DecisionCandidateView[] {
  if (!Array.isArray(value)) return [];
  const candidates: DecisionCandidateView[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.modelId !== "string" || typeof entry.displayName !== "string") continue;
    const rejection = isRecord(entry.rejection) && typeof entry.rejection.detail === "string" ? entry.rejection.detail : null;
    candidates.push({
      displayName: entry.displayName,
      modelId: entry.modelId,
      eligible: entry.eligible === true,
      detail: rejection,
      estimatedCostUsd: typeof entry.estimatedCostUsd === "string" ? entry.estimatedCostUsd : null,
      successProbability: typeof entry.successProbability === "number" ? entry.successProbability : null,
    });
  }
  return candidates;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
