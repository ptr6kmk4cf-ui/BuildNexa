import { addMoney, compareMoney } from "@/lib/routing/money";
import { calculateCost } from "@/lib/ai/cost";
import type { ModelPricing } from "@/lib/ai/types";
import { BUDGET_ALERTS } from "@/lib/budget/config";
import { formatScaled, scaleMoney, subtractMoney } from "@/lib/budget/money";
import type { CostKind, CostLine, CostSummary, MoneyGroup, SavingsComparison } from "@/lib/budget/types";

const MEASURED_NOTE = "Not measured. A premium-priced run was not executed, so this is not a measured saving.";
const BASELINE_NOTE = "Estimated by replaying this run's token counts against the highest priced model in the registry. It is not a second execution.";
const BASELINE_MISSING = "Not available. This run has no priced token counts to replay, or no premium price is configured.";

export function budgetAlert(spentUsd: string, limitUsd: string): string | null {
  const spent = scaleMoney(spentUsd);
  const limit = scaleMoney(limitUsd);
  if (spent === null || limit === null || limit <= BigInt(0)) return null;
  const ratio = Number(spent) / Number(limit);
  const matched = BUDGET_ALERTS.find((entry) => ratio >= entry.fraction);
  return matched?.message ?? null;
}

export function estimatePremiumBaseline(
  lines: readonly Pick<CostLine, "kind" | "inputTokens" | "outputTokens" | "cachedInputTokens">[],
  pricing: ModelPricing | null,
): string | null {
  if (!pricing?.inputPerMillion || !pricing.outputPerMillion) return null;
  const billable = lines.filter((line) => line.kind !== "verification" && (line.inputTokens > 0 || line.outputTokens > 0));
  if (billable.length === 0) return null;
  const amounts: string[] = [];
  for (const line of billable) {
    const quote = calculateCost(pricing, {
      inputTokens: line.inputTokens,
      outputTokens: line.outputTokens,
      cachedInputTokens: line.cachedInputTokens,
    });
    if (!quote.priced || quote.amount === null) return null;
    amounts.push(quote.amount);
  }
  return addMoney(amounts);
}

export function savingsComparison(actualUsd: string, estimatedBaselineUsd: string | null): SavingsComparison {
  const projected = estimatedBaselineUsd ? subtractMoney(estimatedBaselineUsd, actualUsd) : null;
  return {
    actualUsd,
    estimatedBaselineUsd,
    projectedSavingsUsd: projected,
    measuredSavingsUsd: null,
    baselineNote: estimatedBaselineUsd ? BASELINE_NOTE : BASELINE_MISSING,
    measuredNote: MEASURED_NOTE,
  };
}

export function summarizeCosts(lines: readonly CostLine[], limitUsd: string | null, premium: ModelPricing | null = null): CostSummary {
  const actualUsd = addMoney(lines.map((line) => line.amountUsd)) ?? "0";
  const remainingUsd = limitUsd ? subtractMoney(limitUsd, actualUsd) : null;
  return {
    actualUsd,
    limitUsd,
    remainingUsd,
    alert: limitUsd ? budgetAlert(actualUsd, limitUsd) : null,
    initialUsd: sumKind(lines, "initial"),
    retryUsd: sumKind(lines, "retry"),
    debugUsd: sumKind(lines, "debug"),
    escalationUsd: sumKind(lines, "escalation"),
    verificationUsd: sumKind(lines, "verification"),
    byTask: group(lines, (line) => line.taskId, (line) => line.taskTitle || line.taskId),
    byModel: group(lines, (line) => `${line.provider}:${line.modelId}`, (line) => line.modelName || line.modelId),
    byProvider: group(lines, (line) => line.provider, (line) => line.provider),
    comparison: savingsComparison(actualUsd, estimatePremiumBaseline(lines, premium)),
  };
}

export function fractionUsed(spentUsd: string, limitUsd: string): number | null {
  const spent = scaleMoney(spentUsd);
  const limit = scaleMoney(limitUsd);
  if (spent === null || limit === null || limit <= BigInt(0)) return null;
  return Number(spent) / Number(limit);
}

export function highestTokenPrice(models: readonly { pricing: ModelPricing }[]): ModelPricing | null {
  const priced = models.filter((model) => model.pricing.inputPerMillion && model.pricing.outputPerMillion);
  if (priced.length === 0) return null;
  const ranked = [...priced].sort((left, right) => {
    const leftSum = addMoney([left.pricing.inputPerMillion ?? "0", left.pricing.outputPerMillion ?? "0"]);
    const rightSum = addMoney([right.pricing.inputPerMillion ?? "0", right.pricing.outputPerMillion ?? "0"]);
    if (!leftSum || !rightSum) return 0;
    return compareMoney(rightSum, leftSum) ?? 0;
  });
  return ranked[0]?.pricing ?? null;
}

function sumKind(lines: readonly CostLine[], kind: CostKind): string {
  const amounts = lines.filter((line) => line.kind === kind).map((line) => line.amountUsd);
  if (amounts.length === 0) return "0";
  return addMoney(amounts) ?? "0";
}

function group(lines: readonly CostLine[], keyFor: (line: CostLine) => string, labelFor: (line: CostLine) => string): MoneyGroup[] {
  const grouped = new Map<string, { label: string; amounts: string[] }>();
  for (const line of lines) {
    const key = keyFor(line);
    const current = grouped.get(key) ?? { label: labelFor(line), amounts: [] };
    current.amounts.push(line.amountUsd);
    grouped.set(key, current);
  }
  return [...grouped.entries()]
    .map(([key, value]) => ({ key, label: value.label, amountUsd: addMoney(value.amounts) ?? "0" }))
    .sort((left, right) => (compareMoney(right.amountUsd, left.amountUsd) ?? 0) || left.label.localeCompare(right.label));
}

export function zeroAmount(): string {
  return formatScaled(BigInt(0));
}
