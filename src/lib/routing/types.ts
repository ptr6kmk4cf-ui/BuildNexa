import type { OptimizationMode, TaskDifficulty, TaskPriority, TaskType } from "@/lib/planner/types";
import type { ProviderId } from "@/lib/ai/types";

export const ROUTING_OUTCOMES = [
  "selected",
  "provider_unavailable",
  "insufficient_capability",
  "unpriced",
  "below_threshold",
] as const;

export type RoutingOutcome = (typeof ROUTING_OUTCOMES)[number];

export const REJECTION_CODES = [
  "provider_unavailable",
  "insufficient_capability",
  "unpriced",
  "context_window",
  "tools",
  "below_success_floor",
] as const;

export type RejectionCode = (typeof REJECTION_CODES)[number];

export type RouteTaskInput = {
  id: string;
  title: string;
  type: TaskType;
  difficulty: TaskDifficulty;
  priority: TaskPriority;
  complexity: number;
};

// Observed attempts for one model and task type, counted from TaskAttempt rows.
export type HistorySample = {
  provider: ProviderId;
  modelId: string;
  taskType: TaskType;
  attempts: number;
  successes: number;
};

export type DecisionFactor = {
  name: string;
  detail: string;
};

export type CandidateRejection = {
  code: RejectionCode;
  detail: string;
};

export type CandidateAssessment = {
  provider: ProviderId;
  modelId: string;
  displayName: string;
  eligible: boolean;
  rejection: CandidateRejection | null;
  successProbability: number | null;
  estimatedCostUsd: string | null;
  initialCostUsd: string | null;
  retryCostUsd: string | null;
  escalationCostUsd: string | null;
  contextCostUsd: string | null;
  verificationCostUsd: string | null;
  factors: DecisionFactor[];
};

export type RoutingDecision = {
  taskId: string;
  mode: OptimizationMode;
  outcome: RoutingOutcome;
  selected: { provider: ProviderId; modelId: string; displayName: string } | null;
  estimatedCostUsd: string | null;
  successProbability: number | null;
  factors: DecisionFactor[];
  candidates: CandidateAssessment[];
  estimateNote: string;
};
