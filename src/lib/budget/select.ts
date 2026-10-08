import { compareMoney, multiplyMoney } from "@/lib/routing/money";

export type SuccessCandidate = {
  id: string;
  expectedCostUsd: string;
  successProbability: number;
  tokenPriceUsd: string;
};

export function costPerSuccessfulResult(expectedCostUsd: string, successProbability: number): string | null {
  if (!Number.isFinite(successProbability) || successProbability <= 0 || successProbability > 1) return null;
  const factor = 1 / Math.max(successProbability, 0.02);
  if (factor > 1000) return null;
  return multiplyMoney(expectedCostUsd, factor);
}

export function chooseLowestCostPerSuccess<T extends SuccessCandidate>(candidates: readonly T[]): { choice: T; costPerSuccessUsd: string } | null {
  const ranked = candidates.flatMap((candidate) => {
    const costPerSuccessUsd = costPerSuccessfulResult(candidate.expectedCostUsd, candidate.successProbability);
    if (!costPerSuccessUsd) return [];
    return [{ candidate, costPerSuccessUsd }];
  });
  ranked.sort((left, right) => {
    const order = compareMoney(left.costPerSuccessUsd, right.costPerSuccessUsd) ?? 0;
    if (order !== 0) return order;
    return left.candidate.id.localeCompare(right.candidate.id);
  });
  const winner = ranked[0];
  if (!winner) return null;
  return { choice: winner.candidate, costPerSuccessUsd: winner.costPerSuccessUsd };
}
