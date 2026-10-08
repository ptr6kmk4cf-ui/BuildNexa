export const COST_KINDS = ["initial", "retry", "debug", "escalation", "verification"] as const;

export type CostKind = (typeof COST_KINDS)[number];

export type CostLine = {
  taskId: string;
  taskTitle: string;
  provider: string;
  modelId: string;
  modelName: string;
  kind: CostKind;
  amountUsd: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  toolCalls: number;
  durationMs: number;
};

export type SpendDecision =
  | { ok: true }
  | { ok: false; reason: "insufficient_budget" | "budget_exhausted"; message: string };

export type SavingsComparison = {
  actualUsd: string;
  estimatedBaselineUsd: string | null;
  projectedSavingsUsd: string | null;
  measuredSavingsUsd: null;
  baselineNote: string;
  measuredNote: string;
};

export type MoneyGroup = {
  key: string;
  label: string;
  amountUsd: string;
};

export type CostSummary = {
  actualUsd: string;
  limitUsd: string | null;
  remainingUsd: string | null;
  alert: string | null;
  initialUsd: string;
  retryUsd: string;
  debugUsd: string;
  escalationUsd: string;
  verificationUsd: string;
  byTask: MoneyGroup[];
  byModel: MoneyGroup[];
  byProvider: MoneyGroup[];
  comparison: SavingsComparison;
};
