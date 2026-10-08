import "server-only";
import { io } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { calculateCost } from "@/lib/ai/cost";
import { listRegistryModels } from "@/lib/ai/registry";
import { isProviderId, PROVIDER_IDS, providerLabel, type ProviderId } from "@/lib/ai/types";
import { getPrisma } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { EXECUTION_CONFIG, runExecution, type ExecutionReport, type ExecutionTask, type TaskExecutionResult } from "@/lib/execution";
import { logger } from "@/lib/logger";
import { readContextRequests, TASK_DIFFICULTIES, TASK_PRIORITIES, TASK_TYPES } from "@/lib/planner";
import { executeLimiter, cancelLimiter } from "@/lib/security/limits";
import { idSchema } from "@/lib/validation";
import { runSandboxModel } from "@/lib/sandbox/agent";
import { createWorkspaceVerifier } from "@/lib/verification";
import { readEnabledProviderIds, providerFor } from "@/server/ai";
import { openProjectSandbox } from "@/server/repository-workspace";
import type { RepositoryWorkspace } from "@/lib/sandbox/workflow";
import { loadHistory } from "@/server/routing";
import { authorizeOwnedProject } from "@/server/viewer";

const MODE = { SAVINGS: "savings", BALANCED: "balanced", QUALITY: "quality" } as const;

const EXECUTION_STATE = {
  queued: "QUEUED",
  running: "RUNNING",
  completed: "COMPLETED",
  failed: "FAILED",
  escalated: "ESCALATED",
  cancelled: "CANCELLED",
} as const;

export async function executeStoredProject(
  projectId: string,
  options?: { authorizeOverBudget?: boolean },
): Promise<{ ok: true; taskCount: number; completedCount: number } | { ok: false; message: string }> {
  await io();
  if (!idSchema.safeParse(projectId).success) return { ok: false, message: "That project could not be found." };
  const prisma = getPrisma();
  if (!prisma) return { ok: false, message: "Connect PostgreSQL before running tasks." };
  const access = await authorizeOwnedProject(prisma, projectId, executeLimiter);
  if (!access.ok) return access;

  let runId: string | null = null;
  try {
    const active = await prisma.executionRun.findFirst({
      where: { projectId, status: "RUNNING" },
      orderBy: { createdAt: "desc" },
      select: { id: true, heartbeatAt: true },
    });
    if (active && Date.now() - active.heartbeatAt.getTime() < EXECUTION_CONFIG.staleRunMs) {
      return { ok: false, message: "A task run is already in progress." };
    }
    if (active) {
      await prisma.executionRun.updateMany({
        where: { id: active.id, status: "RUNNING" },
        data: { status: "FAILED", finishedAt: new Date() },
      });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        plans: { orderBy: { createdAt: "desc" }, take: 1 },
        budgets: { orderBy: { createdAt: "desc" }, take: 1 },
        repositories: { orderBy: { createdAt: "asc" }, take: 1, select: { url: true, defaultBranch: true } },
        tasks: {
          orderBy: { sequence: "asc" },
          take: 201,
          include: {
            dependencies: { select: { dependsOnTaskId: true } },
            decisions: {
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: 1,
              include: { model: { select: { name: true } } },
            },
            executions: {
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: 1,
              select: { state: true, result: true },
            },
          },
        },
      },
    });
    if (!project) return { ok: false, message: "That project could not be found." };
    if (project.tasks.length === 0) return { ok: false, message: "This project has no tasks to run." };
    if (project.tasks.length > 200) return { ok: false, message: "This plan has too many tasks to run in one pass." };

    const env = getServerEnv();
    const registry = listRegistryModels(env.MODEL_PRICING).models;
    const context = readContextRequests(project.plans[0]?.contextRequests);
    const tasks = project.tasks.flatMap((task): ExecutionTask[] => {
      const decision = task.decisions[0];
      const selected =
        decision?.outcome === "selected" && decision.provider && decision.modelSlug && isProviderId(decision.provider)
          ? {
              provider: decision.provider,
              modelId: decision.modelSlug,
              displayName: decision.model?.name ?? decision.modelSlug,
            }
          : null;
      const previous = task.executions[0];
      const alreadyCompleted = previous?.state === "COMPLETED";
      const hint = context.find((request) => request.taskId === task.planKey) ?? null;
      return [
        {
          id: task.id,
          title: task.title,
          description: task.description ?? "",
          expectedOutput: task.expectedOutput,
          verificationCriteria: task.verificationCriteria,
          dependencies: task.dependencies.map((dependency) => dependency.dependsOnTaskId),
          sequence: task.sequence,
          model: selected,
          escalation: escalationModel(decision?.candidates, selected),
          estimatedCostUsd: decision?.estimatedCost?.toString() ?? null,
          context: hint
            ? { pathHints: hint.pathHints, reason: hint.reason, repositoryFullName: hint.repositoryFullName }
            : null,
          alreadyCompleted,
          priorResult: alreadyCompleted ? previous?.result ?? null : null,
          type: asMember(TASK_TYPES, task.type.toLowerCase()) ?? undefined,
          difficulty: asMember(TASK_DIFFICULTIES, task.difficulty.toLowerCase()) ?? undefined,
          priority: asMember(TASK_PRIORITIES, task.priority.toLowerCase()) ?? undefined,
          complexity: task.complexity,
          successProbability: readProbability(decision?.successProbability),
        },
      ];
    });
    if (tasks.every((task) => task.alreadyCompleted)) {
      return { ok: true, taskCount: 0, completedCount: 0 };
    }

    const run = await prisma.executionRun
      .create({
        data: {
          projectId: project.id,
          status: "RUNNING",
          heartbeatAt: new Date(),
          authorizeOverBudget: options?.authorizeOverBudget ?? false,
        },
        select: { id: true },
      })
      .catch((error: unknown) => {
        if (isRunningConflict(error)) return null;
        throw error;
      });
    if (!run) return { ok: false, message: "A task run is already in progress." };
    runId = run.id;
    const enabled = await readEnabledProviderIds(prisma);
    const availableProviders = new Set<ProviderId>();
    for (const providerId of PROVIDER_IDS) {
      const key = env[providerKey(providerId)];
      if (enabled.has(providerId) && key?.trim()) availableProviders.add(providerId);
    }
    const history = await loadHistory(prisma);
    const budgetUsd = project.budgets[0]?.limitAmount.toString() ?? null;
    const controller = new AbortController();
    const timer = setInterval(() => {
      void prisma.executionRun
        .update({
          where: { id: run.id },
          data: { heartbeatAt: new Date() },
          select: { cancelRequested: true, status: true },
        })
        .then((row) => {
          if (row.cancelRequested || row.status !== "RUNNING") controller.abort();
        })
        .catch(() => undefined);
    }, 400);

    const repository = project.repositories[0];
    let workspace: RepositoryWorkspace | null = null;
    if (repository?.url) {
      const opened = await openProjectSandbox({
        projectId: project.id,
        userId: project.userId,
        url: repository.url,
        defaultBranch: repository.defaultBranch,
      });
      if (!opened.ok) {
        clearInterval(timer);
        await prisma.executionRun.update({
          where: { id: run.id },
          data: { status: "FAILED", finishedAt: new Date() },
        });
        return { ok: false, message: opened.message };
      }
      workspace = opened.workspace;
    }
    const caller = async (call: {
      provider: string;
      modelId: string;
      messages: { role: "system" | "user" | "assistant"; content: string }[];
      timeoutMs: number;
      signal: AbortSignal;
    }) => {
      if (!isProviderId(call.provider)) return { ok: false as const, error: "unknown_model" as const };
      return providerFor(call.provider, { timeoutMs: call.timeoutMs }).execute({
        modelId: call.modelId,
        messages: call.messages,
        maxOutputTokens: EXECUTION_CONFIG.outputTokens,
        signal: call.signal,
      });
    };
    const verify = workspace ? (signal: AbortSignal) => workspace.verify(signal) : createWorkspaceVerifier(process.cwd());

    let report: ExecutionReport;
    try {
      report = await runExecution({
        tasks,
        signal: controller.signal,
        caller,
        ...(workspace
          ? {
              environment: {
                kind: "controlled" as const,
                run: (call: Parameters<typeof runSandboxModel>[0]["call"]) => runSandboxModel({ workspace, call, callModel: caller }),
              },
            }
          : {}),
        price: (provider, modelId, usage) => {
          const match = registry.find((entry) => entry.provider === provider && entry.modelId === modelId);
          if (!match) return null;
          const quote = calculateCost(match.pricing, usage);
          return quote.priced ? quote.amount : null;
        },
        verify,
        budgetUsd,
        authorizeOverBudget: options?.authorizeOverBudget ?? false,
        mode: MODE[project.optimizationMode],
        models: registry,
        availableProviders,
        history,
      });
    } catch (error) {
      clearInterval(timer);
      throw error;
    } finally {
      await workspace?.close();
    }

    const aborted = controller.signal.aborted;
    if (!report.ok) {
      clearInterval(timer);
      await prisma.executionRun.update({
        where: { id: run.id },
        data: { status: "FAILED", finishedAt: new Date() },
      });
      return { ok: false, message: report.message };
    }

    const ran = report.tasks.filter((task) => !task.skipped);
    const byId = new Map(report.tasks.map((task) => [task.taskId, task]));
    try {
      await prisma.$transaction(async (tx) => {
        const current = await tx.executionRun.findUnique({ where: { id: run.id }, select: { status: true } });
        if (current?.status !== "RUNNING") throw new Error("run-taken-over");
        const modelIds = new Map<string, string>();
        const rememberModel = async (provider: ProviderId, modelSlug: string, displayName: string) => {
          const key = `${provider}:${modelSlug}`;
          const saved = modelIds.get(key);
          if (saved) return saved;
          const id = await ensureModel(tx, provider, modelSlug, displayName, registry);
          modelIds.set(key, id);
          return id;
        };
        for (const task of tasks) {
          const result = byId.get(task.id);
          if (!result || result.skipped) continue;
          const modelId = result.provider && result.modelId
            ? await rememberModel(result.provider, result.modelId, result.displayName ?? result.modelId)
            : null;
          const execution = await tx.taskExecution.create({
            data: {
              taskId: task.id,
              runId: run.id,
              state: EXECUTION_STATE[result.state],
              attemptCount: result.attemptCount,
              provider: result.provider,
              modelSlug: result.modelId,
              modelId,
              result: result.result,
              errorMessage: result.error,
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              cachedInputTokens: result.cachedInputTokens,
              toolCalls: result.toolCalls,
              durationMs: result.durationMs,
              estimatedCost: result.estimatedCostUsd,
              actualCost: result.actualCostUsd,
              escalated: result.escalated,
              ignoredCommand: result.ignoredCommand,
              startedAt: result.attemptCount > 0 ? new Date(Date.now() - result.durationMs) : null,
              finishedAt: new Date(),
            },
          });
          const taskLogs = report.logs.filter((entry) => entry.taskId === task.id);
          if (taskLogs.length > 0) {
            const loggedAt = Date.now();
            await tx.executionLog.createMany({
              data: taskLogs.map((entry, index) => ({
                executionId: execution.id,
                taskId: task.id,
                state: EXECUTION_STATE[entry.state],
                attempt: entry.attempt,
                message: entry.message,
                createdAt: new Date(loggedAt + index),
              })),
            });
          }
          const savedAt = Date.now();
          for (const [index, call] of result.attempts.entries()) {
            const attemptModelId = await rememberModel(call.provider, call.modelId, call.displayName);
            const attempt = await tx.taskAttempt.create({
              data: {
                taskId: task.id,
                modelId: attemptModelId,
                status: storedAttemptStatus(call.status),
                startedAt: new Date(savedAt - call.durationMs),
                finishedAt: new Date(savedAt),
                errorMessage: call.error,
                createdAt: new Date(savedAt + index),
              },
            });
            if (call.status === "succeeded") {
              await tx.tokenUsage.create({
                data: {
                  taskAttemptId: attempt.id,
                  modelId: attemptModelId,
                  inputTokens: call.inputTokens,
                  outputTokens: call.outputTokens,
                  cachedInputTokens: call.cachedInputTokens,
                  toolCalls: call.toolCalls,
                },
              });
            }
            if (call.actualCostUsd) {
              await tx.costRecord.create({
                data: {
                  projectId: project.id,
                  taskId: task.id,
                  taskAttemptId: attempt.id,
                  modelId: attemptModelId,
                  kind: storedCostKind(call.kind),
                  amount: call.actualCostUsd,
                  currency: "USD",
                  inputTokens: call.inputTokens,
                  outputTokens: call.outputTokens,
                  cachedInputTokens: call.cachedInputTokens,
                  toolCalls: call.toolCalls,
                  durationMs: call.durationMs,
                },
              });
            }
          }
          for (const line of result.verifications.length > 0 ? report.costs.filter((cost) => cost.taskId === task.id && cost.kind === "verification") : []) {
            const lineModelId = result.provider && result.modelId
              ? await rememberModel(result.provider, result.modelId, result.displayName ?? result.modelId)
              : null;
            await tx.costRecord.create({
              data: {
                projectId: project.id,
                taskId: task.id,
                modelId: lineModelId,
                kind: "VERIFICATION",
                amount: line.amount,
                currency: "USD",
                inputTokens: line.inputTokens,
                outputTokens: line.outputTokens,
                cachedInputTokens: line.cachedInputTokens,
                toolCalls: line.toolCalls,
                durationMs: line.durationMs,
              },
            });
          }
          const recordedAt = Date.now();
          for (const [index, verification] of result.verifications.entries()) {
            const failedCheck = verification.checks.find((check) => check.outcome === "fail");
            const saved = await tx.verification.create({
              data: {
                taskId: task.id,
                status: legacyVerificationStatus(verification.outcome),
                outcome: verification.outcome.toUpperCase() as "PASS" | "FAIL" | "PARTIAL" | "UNKNOWN",
                notes: verification.summary,
                stopReason: index === result.verifications.length - 1 ? result.verificationStopReason : null,
                command: verification.checks.map((check) => check.command).join("\n") || null,
                output: clipText(verification.checks.map((check) => check.output).join("\n\n")),
                exitCode: failedCheck?.exitCode ?? verification.checks[0]?.exitCode ?? null,
                durationMs: verification.durationMs,
                errors: verification.errors,
                costUsd: verification.costUsd,
                createdAt: new Date(recordedAt + index),
              },
            });
            if (verification.checks.length > 0) {
              await tx.verificationCheck.createMany({
                data: verification.checks.map((check, checkIndex) => ({
                  verificationId: saved.id,
                  taskId: task.id,
                  kind: check.kind.toUpperCase() as "TEST" | "LINT" | "TYPECHECK" | "BUILD",
                  command: check.command,
                  output: check.output,
                  exitCode: check.exitCode,
                  durationMs: check.durationMs,
                  errors: check.errors,
                  outcome: check.outcome.toUpperCase() as "PASS" | "FAIL" | "UNKNOWN",
                  createdAt: new Date(recordedAt + index * 10 + checkIndex),
                })),
              });
            }
          }
          await tx.task.update({
            where: { id: task.id },
            data: { status: taskStatus(result.state) },
          });
        }
        const nextStatus = aborted ? "CANCELLED" : ran.some((task) => task.state === "failed") ? "FAILED" : "COMPLETED";
        const finished = await tx.executionRun.updateMany({
          where: { id: run.id, status: "RUNNING" },
          data: { status: nextStatus, finishedAt: new Date() },
        });
        if (finished.count !== 1) throw new Error("run-taken-over");
        await tx.project.update({ where: { id: project.id }, data: { status: "ACTIVE" } });
        await tx.auditLog.create({
          data: {
            userId: project.userId,
            projectId: project.id,
            action: "SYSTEM",
            entityType: "TaskExecution",
            entityId: run.id,
            metadata: {
              taskCount: ran.length,
              completedCount: ran.filter((task) => task.state === "completed").length,
              failedCount: ran.filter((task) => task.state === "failed").length,
              cancelledCount: ran.filter((task) => task.state === "cancelled").length,
            },
          },
        });
      }, { maxWait: 5_000, timeout: EXECUTION_CONFIG.saveTimeoutMs });
    } finally {
      clearInterval(timer);
    }

    const completedCount = ran.filter((task) => task.state === "completed").length;
    logger.info("Task execution recorded", { projectId: project.id, taskCount: ran.length, completedCount });
    return { ok: true, taskCount: ran.length, completedCount };
  } catch (error) {
    if (isTakenOver(error)) {
      return { ok: false, message: "The task run was interrupted." };
    }
    logger.error("Could not execute project tasks", { error, projectId });
    if (runId) {
      await prisma.executionRun
        .update({ where: { id: runId }, data: { status: "FAILED", finishedAt: new Date() } })
        .catch(() => undefined);
    }
    return { ok: false, message: "The task run could not be saved." };
  }
}

export async function requestExecutionCancel(
  projectId: string,
): Promise<{ ok: true; stopped: boolean } | { ok: false; message: string }> {
  await io();
  if (!idSchema.safeParse(projectId).success) return { ok: false, message: "That project could not be found." };
  const prisma = getPrisma();
  if (!prisma) return { ok: false, message: "Connect PostgreSQL before running tasks." };
  const access = await authorizeOwnedProject(prisma, projectId, cancelLimiter);
  if (!access.ok) return access;
  try {
    const run = await prisma.executionRun.findFirst({
      where: { projectId, status: "RUNNING" },
      orderBy: { createdAt: "desc" },
      select: { id: true, heartbeatAt: true },
    });
    if (!run) return { ok: false, message: "No task run is in progress." };
    const now = Date.now();
    if (now - run.heartbeatAt.getTime() >= EXECUTION_CONFIG.staleRunMs) {
      const stopped = await prisma.executionRun.updateMany({
        where: { id: run.id, status: "RUNNING", heartbeatAt: { lt: new Date(now - EXECUTION_CONFIG.staleRunMs) } },
        data: { status: "CANCELLED", cancelRequested: true, finishedAt: new Date() },
      });
      if (stopped.count > 0) return { ok: true, stopped: true };
    }
    const flagged = await prisma.executionRun.updateMany({
      where: { id: run.id, status: "RUNNING" },
      data: { cancelRequested: true },
    });
    if (flagged.count === 0) return { ok: false, message: "No task run is in progress." };
    return { ok: true, stopped: false };
  } catch (error) {
    logger.error("Could not cancel task execution", { error, projectId });
    return { ok: false, message: "The task run could not be cancelled." };
  }
}

function escalationModel(value: unknown, selected: ExecutionTask["model"]): ExecutionTask["escalation"] {
  if (!selected || !Array.isArray(value)) return null;
  const eligible: Array<{ provider: ProviderId; modelId: string; displayName: string; probability: number }> = [];
  for (const entry of value) {
    if (!isRecord(entry) || entry.eligible !== true) continue;
    if (typeof entry.provider !== "string" || !isProviderId(entry.provider)) continue;
    if (typeof entry.modelId !== "string" || typeof entry.displayName !== "string") continue;
    if (entry.provider === selected.provider && entry.modelId === selected.modelId) continue;
    eligible.push({
      provider: entry.provider,
      modelId: entry.modelId,
      displayName: entry.displayName,
      probability: typeof entry.successProbability === "number" ? entry.successProbability : 0,
    });
  }
  eligible.sort((left, right) => right.probability - left.probability || left.modelId.localeCompare(right.modelId));
  const chosen = eligible[0];
  if (!chosen) return null;
  return { provider: chosen.provider, modelId: chosen.modelId, displayName: chosen.displayName };
}

async function ensureModel(
  tx: Prisma.TransactionClient,
  providerId: ProviderId,
  modelId: string,
  displayName: string,
  models: ReturnType<typeof listRegistryModels>["models"],
): Promise<string> {
  const provider = await tx.provider.upsert({
    where: { slug: providerId },
    create: { slug: providerId, name: providerLabel(providerId) },
    update: {},
  });
  const registry = models.find((model) => model.provider === providerId && model.modelId === modelId);
  const row = await tx.model.upsert({
    where: { providerId_slug: { providerId: provider.id, slug: modelId } },
    create: {
      providerId: provider.id,
      slug: modelId,
      name: displayName,
      contextWindow: registry?.contextWindow,
      inputPricePerMillion: registry?.pricing.inputPerMillion,
      outputPricePerMillion: registry?.pricing.outputPerMillion,
      enabled: true,
    },
    update: {
      name: displayName,
      contextWindow: registry?.contextWindow,
      inputPricePerMillion: registry?.pricing.inputPerMillion,
      outputPricePerMillion: registry?.pricing.outputPerMillion,
    },
  });
  return row.id;
}

function taskStatus(state: TaskExecutionResult["state"]): "COMPLETED" | "FAILED" | "CANCELLED" {
  if (state === "completed") return "COMPLETED";
  if (state === "cancelled") return "CANCELLED";
  return "FAILED";
}

function isRunningConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "P2002") return false;
  const meta = "meta" in error ? error.meta : null;
  const target = meta && typeof meta === "object" && meta !== null && "target" in meta ? meta.target : null;
  const fields = Array.isArray(target) ? target.map(String).join(" ") : typeof target === "string" ? target : "";
  return fields.length === 0 || /projectId|one_running/i.test(fields);
}

function storedAttemptStatus(status: "succeeded" | "failed" | "cancelled"): "SUCCEEDED" | "FAILED" | "CANCELLED" {
  if (status === "succeeded") return "SUCCEEDED";
  if (status === "cancelled") return "CANCELLED";
  return "FAILED";
}

function isTakenOver(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current !== null && current !== undefined && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if ("message" in current && typeof current.message === "string" && current.message.includes("run-taken-over")) return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asMember<T extends string>(values: readonly T[], value: string): T | null {
  return values.find((entry) => entry === value) ?? null;
}

function readProbability(value: { toString(): string } | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

function providerKey(provider: ProviderId): "OPENAI_API_KEY" | "ANTHROPIC_API_KEY" | "GEMINI_API_KEY" {
  if (provider === "openai") return "OPENAI_API_KEY";
  if (provider === "anthropic") return "ANTHROPIC_API_KEY";
  return "GEMINI_API_KEY";
}

function storedCostKind(kind: string): "INITIAL" | "RETRY" | "DEBUG" | "ESCALATION" | "VERIFICATION" {
  if (kind === "retry") return "RETRY";
  if (kind === "debug") return "DEBUG";
  if (kind === "escalation") return "ESCALATION";
  if (kind === "verification") return "VERIFICATION";
  return "INITIAL";
}

function legacyVerificationStatus(outcome: string): "PASSED" | "FAILED" | "SKIPPED" {
  if (outcome === "pass") return "PASSED";
  if (outcome === "unknown") return "SKIPPED";
  return "FAILED";
}

function clipText(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > 8_000 ? `${trimmed.slice(0, 7_999)}…` : trimmed;
}
