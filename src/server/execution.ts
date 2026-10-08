import "server-only";
import { io } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { calculateCost } from "@/lib/ai/cost";
import { listRegistryModels } from "@/lib/ai/registry";
import { isProviderId, providerLabel, type ProviderId } from "@/lib/ai/types";
import { getPrisma } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { runExecution, type ExecutionReport, type ExecutionTask, type TaskExecutionResult } from "@/lib/execution";
import { logger } from "@/lib/logger";
import { readContextRequests } from "@/lib/planner";
import { idSchema } from "@/lib/validation";
import { providerFor } from "@/server/ai";

const EXECUTION_STATE = {
  queued: "QUEUED",
  running: "RUNNING",
  completed: "COMPLETED",
  failed: "FAILED",
  escalated: "ESCALATED",
  cancelled: "CANCELLED",
} as const;

const TASK_STATUS = {
  completed: "COMPLETED",
  failed: "FAILED",
  cancelled: "CANCELLED",
} as const;

export async function executeStoredProject(
  projectId: string,
): Promise<{ ok: true; taskCount: number; completedCount: number } | { ok: false; message: string }> {
  await io();
  if (!idSchema.safeParse(projectId).success) return { ok: false, message: "That project could not be found." };
  const prisma = getPrisma();
  if (!prisma) return { ok: false, message: "Connect PostgreSQL before running tasks." };

  let runId: string | null = null;
  try {
    const active = await prisma.executionRun.findFirst({
      where: { projectId, status: "RUNNING" },
      select: { id: true },
    });
    if (active) return { ok: false, message: "A task run is already in progress." };

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        plans: { orderBy: { createdAt: "desc" }, take: 1 },
        tasks: {
          orderBy: { sequence: "asc" },
          take: 100,
          include: {
            dependencies: { select: { dependsOnTaskId: true } },
            decisions: {
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: 1,
              include: { model: { select: { name: true } } },
            },
          },
        },
      },
    });
    if (!project) return { ok: false, message: "That project could not be found." };
    if (project.tasks.length === 0) return { ok: false, message: "This project has no tasks to run." };

    const env = getServerEnv();
    const registry = listRegistryModels(env.MODEL_PRICING).models;
    const context = readContextRequests(project.plans[0]?.contextRequests);
    const tasks = project.tasks.flatMap((task): ExecutionTask[] => {
      const decision = task.decisions[0];
      const selected =
        decision?.provider && decision.modelSlug && isProviderId(decision.provider)
          ? {
              provider: decision.provider,
              modelId: decision.modelSlug,
              displayName: decision.model?.name ?? decision.modelSlug,
            }
          : null;
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
        },
      ];
    });

    const run = await prisma.executionRun.create({
      data: { projectId: project.id, status: "RUNNING" },
      select: { id: true },
    });
    runId = run.id;
    const controller = new AbortController();
    const timer = setInterval(() => {
      void prisma.executionRun
        .findUnique({ where: { id: run.id }, select: { cancelRequested: true } })
        .then((row) => {
          if (row?.cancelRequested) controller.abort();
        })
        .catch(() => undefined);
    }, 400);

    let report: ExecutionReport;
    try {
      report = await runExecution({
        tasks,
        signal: controller.signal,
        caller: async (call) => {
          if (!isProviderId(call.provider)) return { ok: false, error: "unknown_model" };
          return providerFor(call.provider, { timeoutMs: call.timeoutMs }).execute({
            modelId: call.modelId,
            messages: call.messages,
            signal: call.signal,
          });
        },
        price: (provider, modelId, usage) => {
          const match = registry.find((entry) => entry.provider === provider && entry.modelId === modelId);
          if (!match) return null;
          const quote = calculateCost(match.pricing, usage);
          return quote.priced ? quote.amount : null;
        },
      });
    } finally {
      clearInterval(timer);
    }

    if (!report.ok) {
      await prisma.executionRun.update({
        where: { id: run.id },
        data: { status: "FAILED", finishedAt: new Date() },
      });
      return { ok: false, message: report.message };
    }

    const byId = new Map(report.tasks.map((task) => [task.taskId, task]));
    await prisma.$transaction(async (tx) => {
      for (const task of tasks) {
        const result = byId.get(task.id);
        if (!result) continue;
        const modelId = result.provider && result.modelId
          ? await ensureModel(tx, result.provider, result.modelId, result.displayName ?? result.modelId, registry)
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
          await tx.executionLog.createMany({
            data: taskLogs.map((entry) => ({
              executionId: execution.id,
              taskId: task.id,
              state: EXECUTION_STATE[entry.state],
              attempt: entry.attempt,
              message: entry.message,
            })),
          });
        }
        const attempt = await tx.taskAttempt.create({
          data: {
            taskId: task.id,
            modelId,
            status: attemptStatus(result),
            startedAt: result.attemptCount > 0 ? new Date(Date.now() - result.durationMs) : null,
            finishedAt: new Date(),
            errorMessage: result.error,
          },
        });
        if (modelId && result.state === "completed") {
          await tx.tokenUsage.create({
            data: {
              taskAttemptId: attempt.id,
              modelId,
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
            },
          });
        }
        if (modelId && result.actualCostUsd) {
          await tx.costRecord.create({
            data: {
              projectId: project.id,
              taskAttemptId: attempt.id,
              modelId,
              amount: result.actualCostUsd,
              currency: "USD",
            },
          });
        }
        await tx.task.update({
          where: { id: task.id },
          data: { status: TASK_STATUS[result.state as keyof typeof TASK_STATUS] ?? "FAILED" },
        });
      }
      await tx.executionRun.update({
        where: { id: run.id },
        data: {
          status: controller.signal.aborted ? "CANCELLED" : report.tasks.some((task) => task.state === "failed") ? "FAILED" : "COMPLETED",
          finishedAt: new Date(),
        },
      });
      await tx.project.update({ where: { id: project.id }, data: { status: "ACTIVE" } });
      await tx.auditLog.create({
        data: {
          userId: project.userId,
          projectId: project.id,
          action: "SYSTEM",
          entityType: "TaskExecution",
          entityId: run.id,
          metadata: {
            taskCount: report.tasks.length,
            completedCount: report.tasks.filter((task) => task.state === "completed").length,
            failedCount: report.tasks.filter((task) => task.state === "failed").length,
            cancelledCount: report.tasks.filter((task) => task.state === "cancelled").length,
          },
        },
      });
    });

    const completedCount = report.tasks.filter((task) => task.state === "completed").length;
    logger.info("Task execution recorded", { projectId: project.id, taskCount: report.tasks.length, completedCount });
    return { ok: true, taskCount: report.tasks.length, completedCount };
  } catch (error) {
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
): Promise<{ ok: true } | { ok: false; message: string }> {
  await io();
  if (!idSchema.safeParse(projectId).success) return { ok: false, message: "That project could not be found." };
  const prisma = getPrisma();
  if (!prisma) return { ok: false, message: "Connect PostgreSQL before running tasks." };
  try {
    const run = await prisma.executionRun.findFirst({
      where: { projectId, status: "RUNNING" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!run) return { ok: false, message: "No task run is in progress." };
    await prisma.executionRun.update({ where: { id: run.id }, data: { cancelRequested: true } });
    return { ok: true };
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

function attemptStatus(result: TaskExecutionResult): "SUCCEEDED" | "FAILED" | "CANCELLED" {
  if (result.state === "completed") return "SUCCEEDED";
  if (result.state === "cancelled") return "CANCELLED";
  return "FAILED";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
