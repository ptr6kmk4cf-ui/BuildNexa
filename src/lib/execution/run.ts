import type { ProviderId, TokenCounts } from "@/lib/ai/types";
import { findCycle } from "@/lib/planner";
import { EXECUTION_CONFIG } from "@/lib/execution/config";
import { createControlledEnvironment, type ExecutionEnvironment, type ModelCaller } from "@/lib/execution/environment";
import { buildTaskMessages, looksLikeHostCommand } from "@/lib/execution/prompt";
import type {
  ExecutionAttempt,
  ExecutionCost,
  ExecutionLogEntry,
  ExecutionModel,
  ExecutionReport,
  ExecutionState,
  ExecutionTask,
  TaskExecutionResult,
} from "@/lib/execution/types";

const RETRYABLE = new Set(["timeout", "provider_error", "unavailable", "malformed"]);

export type RunExecutionInput = {
  tasks: readonly ExecutionTask[];
  caller: ModelCaller;
  environment?: ExecutionEnvironment;
  signal?: AbortSignal;
  maxAttempts?: number;
  timeoutMs?: number;
  concurrency?: number;
  price?: (provider: ProviderId, modelId: string, usage: TokenCounts) => string | null;
};

type MutableResult = TaskExecutionResult & { title: string };

export async function runExecution(input: RunExecutionInput): Promise<ExecutionReport> {
  const invalid = validateGraph(input.tasks);
  if (invalid) return { ok: false, message: invalid, hostCommands: [] };

  const maxAttempts = clampInt(input.maxAttempts ?? EXECUTION_CONFIG.maxAttempts, 1, 5);
  const timeoutMs = clampInt(input.timeoutMs ?? EXECUTION_CONFIG.timeoutMs, 1, 120_000);
  const concurrency = clampInt(input.concurrency ?? EXECUTION_CONFIG.concurrency, 1, 4);
  const environment = input.environment ?? createControlledEnvironment(input.caller);
  const signal = input.signal ?? new AbortController().signal;
  const records = new Map<string, MutableResult>();
  const logs: ExecutionLogEntry[] = [];
  const costs: ExecutionCost[] = [];

  for (const task of input.tasks) {
    const record = blankResult(task);
    records.set(task.id, record);
    if (task.alreadyCompleted) {
      record.state = "completed";
      record.result = task.priorResult ?? null;
      record.skipped = true;
      pushLog(logs, task.id, "completed", 0, "Already completed on a previous run. The model was not called.");
    } else {
      pushLog(logs, task.id, "queued", 0, "Waiting for dependencies.");
    }
  }

  const inflight = new Map<string, Promise<void>>();
  const children = new Map<string, AbortController>();
  const onAbort = () => {
    for (const child of children.values()) child.abort();
  };
  if (signal.aborted) onAbort();
  else signal.addEventListener("abort", onAbort, { once: true });

  try {
    while (true) {
      cancelUnstartable(input.tasks, records, logs, signal);
      if (inflight.size < concurrency && !signal.aborted) {
        for (const task of readyTasks(input.tasks, records)) {
          if (inflight.size >= concurrency) break;
          const child = new AbortController();
          if (signal.aborted) child.abort();
          else signal.addEventListener("abort", () => child.abort(), { once: true });
          children.set(task.id, child);
          const promise = executeTask({
            task,
            records,
            logs,
            costs,
            environment,
            signal: child.signal,
            maxAttempts,
            timeoutMs,
            price: input.price,
          })
            .catch(() => {
              const record = records.get(task.id);
              if (record && !isTerminal(record.state)) {
                finish(record, logs, "failed", record.attemptCount, "The task stopped because of an internal error.");
              }
            })
            .finally(() => {
              inflight.delete(task.id);
              children.delete(task.id);
            });
          inflight.set(task.id, promise);
        }
      }
      if (inflight.size === 0) break;
      await Promise.race(inflight.values());
    }
    for (const record of records.values()) {
      if (!isTerminal(record.state)) {
        finish(record, logs, "failed", record.attemptCount, "The task stopped before it finished.");
      }
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
  }

  return {
    ok: true,
    tasks: input.tasks.map((task) => publicResult(records.get(task.id) ?? blankResult(task))),
    logs,
    costs,
    hostCommands: [],
  };
}

function validateGraph(tasks: readonly ExecutionTask[]): string | null {
  const ids = new Set<string>();
  for (const task of tasks) {
    if (ids.has(task.id)) return "Two tasks share the same id.";
    ids.add(task.id);
  }
  for (const task of tasks) {
    for (const dependency of task.dependencies) {
      if (!ids.has(dependency)) return "A task depends on a task that is not in this plan.";
    }
  }
  if (findCycle(tasks.map((task) => ({ id: task.id, dependencies: task.dependencies })))) {
    return "The task graph contains a cycle.";
  }
  return null;
}

function readyTasks(tasks: readonly ExecutionTask[], records: ReadonlyMap<string, MutableResult>): ExecutionTask[] {
  return tasks
    .filter((task) => records.get(task.id)?.state === "queued")
    .filter((task) => task.dependencies.every((dependency) => records.get(dependency)?.state === "completed"))
    .sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id));
}

function cancelUnstartable(
  tasks: readonly ExecutionTask[],
  records: Map<string, MutableResult>,
  logs: ExecutionLogEntry[],
  signal: AbortSignal,
): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of tasks) {
      const record = records.get(task.id);
      if (!record || record.state !== "queued") continue;
      const dependencyStates = task.dependencies.map((dependency) => records.get(dependency)?.state);
      const blocked = dependencyStates.some((state) => state === "failed" || state === "cancelled");
      if (signal.aborted) {
        finish(record, logs, "cancelled", record.attemptCount, "Cancelled before it started.");
        changed = true;
      } else if (blocked) {
        finish(record, logs, "cancelled", record.attemptCount, "Cancelled because a dependency did not complete.");
        changed = true;
      }
    }
  }
}

async function executeTask(input: {
  task: ExecutionTask;
  records: Map<string, MutableResult>;
  logs: ExecutionLogEntry[];
  costs: ExecutionCost[];
  environment: ExecutionEnvironment;
  signal: AbortSignal;
  maxAttempts: number;
  timeoutMs: number;
  price?: RunExecutionInput["price"];
}): Promise<void> {
  const record = input.records.get(input.task.id);
  if (!record || record.state !== "queued") return;
  record.state = "running";
  pushLog(input.logs, input.task.id, "running", 0, "Started.");

  if (!input.task.model) {
    finish(record, input.logs, "failed", 0, "No model was selected for this task.");
    return;
  }

  const primary = await attemptModel({
    ...input,
    record,
    model: input.task.model,
    limit: input.maxAttempts,
    escalated: false,
  });
  if (primary === "done") return;

  if (input.task.escalation) {
    record.state = "escalated";
    record.escalated = true;
    pushLog(
      input.logs,
      input.task.id,
      "escalated",
      record.attemptCount,
      `Escalating to ${input.task.escalation.displayName} after the selected model failed.`,
    );
    const escalated = await attemptModel({
      ...input,
      record,
      model: input.task.escalation,
      limit: 1,
      escalated: true,
    });
    if (escalated === "done") return;
  }

  finish(record, input.logs, "failed", record.attemptCount, record.error ?? "The model did not return a result.");
}

async function attemptModel(input: {
  task: ExecutionTask;
  records: Map<string, MutableResult>;
  record: MutableResult;
  logs: ExecutionLogEntry[];
  costs: ExecutionCost[];
  environment: ExecutionEnvironment;
  signal: AbortSignal;
  model: ExecutionModel;
  limit: number;
  timeoutMs: number;
  escalated: boolean;
  price?: RunExecutionInput["price"];
}): Promise<"done" | "failed"> {
  for (let index = 0; index < input.limit; index += 1) {
    if (input.signal.aborted) {
      finish(input.record, input.logs, "cancelled", input.record.attemptCount, "Cancelled while running.");
      return "done";
    }
    input.record.attemptCount += 1;
    const attempt = input.record.attemptCount;
    const dependencyResults = input.task.dependencies.flatMap((dependency) => {
      const prior = input.records.get(dependency);
      if (!prior || prior.state !== "completed" || !prior.result) return [];
      return [{ title: prior.title, result: prior.result }];
    });
    const result = await input.environment.run({
      provider: input.model.provider,
      modelId: input.model.modelId,
      messages: buildTaskMessages(input.task, dependencyResults),
      timeoutMs: input.timeoutMs,
      signal: input.signal,
    });
    input.record.durationMs += result.durationMs;
    input.record.provider = input.model.provider;
    input.record.modelId = input.model.modelId;
    input.record.displayName = input.model.displayName;
    if (input.escalated) input.record.escalated = true;

    if (result.ok) {
      const text = result.text.slice(0, EXECUTION_CONFIG.maxResultChars);
      input.record.result = text;
      input.record.ignoredCommand = looksLikeHostCommand(result.text);
      input.record.inputTokens += result.usage.inputTokens;
      input.record.outputTokens += result.usage.outputTokens;
      const actual = quote(input.price, input.model.provider, input.model.modelId, result.usage);
      input.record.actualCostUsd = actual;
      recordAttempt(input.record, input.model, {
        status: "succeeded",
        error: null,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        durationMs: result.durationMs,
        actualCostUsd: actual,
      });
      if (actual) {
        input.costs.push({
          taskId: input.task.id,
          amount: actual,
          currency: "USD",
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          provider: input.model.provider,
          modelId: input.model.modelId,
        });
      }
      const note = input.record.ignoredCommand
        ? "Stored the model reply. It looked like a shell command and was not run."
        : "Stored the model reply.";
      finish(input.record, input.logs, "completed", attempt, note);
      return "done";
    }

    if (result.error === "cancelled" || input.signal.aborted) {
      recordAttempt(input.record, input.model, {
        status: "cancelled",
        error: "Cancelled while running.",
        inputTokens: 0,
        outputTokens: 0,
        durationMs: result.durationMs,
        actualCostUsd: null,
      });
      finish(input.record, input.logs, "cancelled", attempt, "Cancelled while running.");
      return "done";
    }

    input.record.error = failureMessage(result.error);
    recordAttempt(input.record, input.model, {
      status: "failed",
      error: input.record.error,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: result.durationMs,
      actualCostUsd: null,
    });
    const canRetry = !input.escalated && index < input.limit - 1 && RETRYABLE.has(result.error);
    if (!canRetry) return "failed";
    pushLog(input.logs, input.task.id, "running", attempt, `${input.record.error} Retrying.`);
  }
  return "failed";
}

function finish(record: MutableResult, logs: ExecutionLogEntry[], state: ExecutionState, attempt: number, message: string): void {
  record.state = state;
  record.error = state === "completed" ? null : message;
  pushLog(logs, record.taskId, state, attempt, message);
}

function pushLog(logs: ExecutionLogEntry[], taskId: string, state: ExecutionState, attempt: number, message: string): void {
  logs.push({ taskId, state, attempt, message: message.replace(/\s+/g, " ").trim().slice(0, 240) });
}

function failureMessage(error: string): string {
  if (error === "timeout") return "The model call timed out.";
  if (error === "provider_error") return "The provider returned an error.";
  if (error === "not_configured") return "The provider has no API key.";
  if (error === "unknown_model") return "The selected model is not in the registry.";
  if (error === "malformed") return "The provider response could not be read.";
  if (error === "unavailable") return "The provider could not be reached.";
  return "The model call failed.";
}

function publicResult(record: MutableResult): TaskExecutionResult {
  return {
    taskId: record.taskId,
    state: record.state,
    attemptCount: record.attemptCount,
    provider: record.provider,
    modelId: record.modelId,
    displayName: record.displayName,
    result: record.result,
    error: record.error,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    durationMs: record.durationMs,
    estimatedCostUsd: record.estimatedCostUsd,
    actualCostUsd: record.actualCostUsd,
    escalated: record.escalated,
    ignoredCommand: record.ignoredCommand,
    skipped: record.skipped,
    attempts: record.attempts.map((entry) => ({ ...entry })),
  };
}

function blankResult(task: ExecutionTask): MutableResult {
  return {
    taskId: task.id,
    title: task.title,
    state: "queued",
    attemptCount: 0,
    provider: null,
    modelId: null,
    displayName: null,
    result: null,
    error: null,
    inputTokens: 0,
    outputTokens: 0,
    durationMs: 0,
    estimatedCostUsd: task.estimatedCostUsd,
    actualCostUsd: null,
    escalated: false,
    ignoredCommand: false,
    skipped: false,
    attempts: [],
  };
}

function recordAttempt(
  record: MutableResult,
  model: ExecutionModel,
  attempt: Omit<ExecutionAttempt, "provider" | "modelId" | "displayName">,
): void {
  record.attempts.push({
    provider: model.provider,
    modelId: model.modelId,
    displayName: model.displayName,
    status: attempt.status,
    error: attempt.error,
    inputTokens: attempt.inputTokens,
    outputTokens: attempt.outputTokens,
    durationMs: attempt.durationMs,
    actualCostUsd: attempt.actualCostUsd,
  });
}

function quote(
  price: RunExecutionInput["price"],
  provider: ProviderId,
  modelId: string,
  usage: TokenCounts,
): string | null {
  if (!price) return null;
  try {
    return price(provider, modelId, usage);
  } catch {
    return null;
  }
}

function isTerminal(state: ExecutionState): boolean {
  return state === "completed" || state === "failed" || state === "cancelled";
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
