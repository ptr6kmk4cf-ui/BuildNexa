import type { ProviderFailure, ProviderId, TokenCounts } from "@/lib/ai/types";
import type { CostKind } from "@/lib/budget/types";
import type { TaskDifficulty, TaskPriority, TaskType } from "@/lib/planner/types";
import type { TaskVerification } from "@/lib/verification/types";

export const EXECUTION_STATES = ["queued", "running", "completed", "failed", "escalated", "cancelled"] as const;

export type ExecutionState = (typeof EXECUTION_STATES)[number];

export type ExecutionModel = {
  provider: ProviderId;
  modelId: string;
  displayName: string;
};

export type ExecutionContext = {
  pathHints: string[];
  reason: string;
  repositoryFullName: string | null;
};

export type ExecutionTask = {
  id: string;
  title: string;
  description: string;
  expectedOutput: string;
  verificationCriteria: string;
  dependencies: string[];
  sequence: number;
  model: ExecutionModel | null;
  escalation: ExecutionModel | null;
  estimatedCostUsd: string | null;
  context: ExecutionContext | null;
  alreadyCompleted?: boolean;
  priorResult?: string | null;
  type?: TaskType;
  difficulty?: TaskDifficulty;
  priority?: TaskPriority;
  complexity?: number;
  successProbability?: number | null;
};

export type ExecutionLogEntry = {
  taskId: string;
  state: ExecutionState;
  attempt: number;
  message: string;
};

export type ExecutionAttempt = {
  provider: ProviderId;
  modelId: string;
  displayName: string;
  status: "succeeded" | "failed" | "cancelled";
  error: string | null;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  toolCalls: number;
  durationMs: number;
  actualCostUsd: string | null;
  kind: CostKind;
};

export type TaskExecutionResult = {
  taskId: string;
  state: ExecutionState;
  attemptCount: number;
  provider: ProviderId | null;
  modelId: string | null;
  displayName: string | null;
  result: string | null;
  error: string | null;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  toolCalls: number;
  durationMs: number;
  estimatedCostUsd: string | null;
  actualCostUsd: string | null;
  escalated: boolean;
  ignoredCommand: boolean;
  skipped: boolean;
  attempts: ExecutionAttempt[];
  verifications: TaskVerification[];
  verificationStopReason: string | null;
};

export type ExecutionCost = {
  taskId: string;
  amount: string;
  currency: "USD";
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  toolCalls: number;
  durationMs: number;
  provider: ProviderId;
  modelId: string;
  kind: CostKind;
};

export type ExecutionReport =
  | {
      ok: true;
      tasks: TaskExecutionResult[];
      logs: ExecutionLogEntry[];
      costs: ExecutionCost[];
      hostCommands: [];
    }
  | { ok: false; message: string; hostCommands: [] };

export type ModelCallUsage = TokenCounts;

export type EnvironmentFailure = ProviderFailure | "cancelled";

export type EnvironmentResult =
  | { ok: true; text: string; usage: ModelCallUsage; durationMs: number }
  | { ok: false; error: EnvironmentFailure; durationMs: number };
