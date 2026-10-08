import type { ProviderId } from "@/lib/ai/types";
import type { RoutingDecision } from "@/lib/routing/types";

export const VERIFICATION_OUTCOMES = ["pass", "fail", "partial", "unknown"] as const;
export type VerificationOutcome = (typeof VERIFICATION_OUTCOMES)[number];

export const CHECK_KINDS = ["test", "lint", "typecheck", "build"] as const;
export type CheckKind = (typeof CHECK_KINDS)[number];

export type PlannedCheck = {
  kind: CheckKind;
  command: string;
  args: readonly string[];
};

export type VerificationCheck = {
  kind: CheckKind;
  command: string;
  output: string;
  exitCode: number | null;
  durationMs: number;
  errors: string | null;
  outcome: "pass" | "fail" | "unknown";
};

export type TaskVerification = {
  outcome: VerificationOutcome;
  checks: VerificationCheck[];
  durationMs: number;
  errors: string | null;
  summary: string;
  costUsd: string | null;
};

export type EscalationModel = {
  provider: ProviderId;
  modelId: string;
  displayName: string;
  estimatedCostUsd: string | null;
  successProbability: number | null;
};

export type EscalationDecision =
  | { action: "retry"; reason: string }
  | { action: "escalate"; model: EscalationModel; reason: string }
  | { action: "stop"; reason: string };

export type EscalationInput = {
  outcome: Exclude<VerificationOutcome, "pass">;
  attempt: number;
  maxAttempts: number;
  sameModelAttempts: number;
  maxSameModelRetries: number;
  spentUsd: string;
  budgetUsd: string | null;
  current: EscalationModel;
  routed: RoutingDecision;
  canAfford?: (kind: "retry" | "escalation", amountUsd: string) => boolean;
};
