import "server-only";
import { io } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { listRegistryModels } from "@/lib/ai/registry";
import { isProviderId, PROVIDER_IDS, providerLabel, type ProviderId } from "@/lib/ai/types";
import { getPrisma } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { TASK_DIFFICULTIES, TASK_PRIORITIES, TASK_TYPES } from "@/lib/planner/types";
import { summarizeHistory, type PerformanceObservation } from "@/lib/routing/history";
import { routeTask } from "@/lib/routing/route";
import type { RoutingDecision } from "@/lib/routing/types";
import { idSchema } from "@/lib/validation";
import { readEnabledProviderIds } from "@/server/ai";

const MODE = { SAVINGS: "savings", BALANCED: "balanced", QUALITY: "quality" } as const;

export async function routeStoredProject(
  projectId: string,
): Promise<{ ok: true; taskCount: number; selectedCount: number } | { ok: false; message: string }> {
  await io();
  if (!idSchema.safeParse(projectId).success) return { ok: false, message: "That project could not be found." };
  const prisma = getPrisma();
  if (!prisma) return { ok: false, message: "Connect PostgreSQL before choosing models." };

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        tasks: { orderBy: { sequence: "asc" }, take: 100 },
      },
    });
    if (!project) return { ok: false, message: "That project could not be found." };

    const env = getServerEnv();
    const enabled = await readEnabledProviderIds(prisma);
    const available = availableProviders(enabled, {
      openai: env.OPENAI_API_KEY,
      anthropic: env.ANTHROPIC_API_KEY,
      gemini: env.GEMINI_API_KEY,
    });
    const models = listRegistryModels(env.MODEL_PRICING).models;
    const history = summarizeHistory(await loadObservations(prisma));
    const mode = MODE[project.optimizationMode];
    const decisions: RoutingDecision[] = [];

    for (const task of project.tasks) {
      const type = asMember(TASK_TYPES, task.type.toLowerCase());
      const difficulty = asMember(TASK_DIFFICULTIES, task.difficulty.toLowerCase());
      const priority = asMember(TASK_PRIORITIES, task.priority.toLowerCase());
      if (!type || !difficulty || !priority) continue;
      decisions.push(
        routeTask({
          task: {
            id: task.id,
            title: task.title,
            type,
            difficulty,
            priority,
            complexity: task.complexity,
          },
          mode,
          models,
          availableProviders: available,
          history,
        }),
      );
    }

    await prisma.$transaction(async (tx) => {
      for (const decision of decisions) {
        const selected = decision.selected
          ? await ensureModel(tx, decision.selected.provider, decision.selected.modelId, decision.selected.displayName, models)
          : null;
        await tx.modelDecision.create({
          data: {
            taskId: decision.taskId,
            modelId: selected,
            provider: decision.selected?.provider ?? null,
            modelSlug: decision.selected?.modelId ?? null,
            optimizationMode: project.optimizationMode,
            estimatedCost: decision.estimatedCostUsd,
            successProbability: decision.successProbability === null ? null : decision.successProbability.toFixed(4),
            outcome: decision.outcome,
            reason: summary(decision),
            factors: decision.factors as Prisma.InputJsonValue,
            candidates: decision.candidates as Prisma.InputJsonValue,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          projectId: project.id,
          action: "SYSTEM",
          entityType: "ModelDecision",
          entityId: project.id,
          metadata: {
            taskCount: decisions.length,
            selectedCount: decisions.filter((decision) => decision.selected).length,
            optimizationMode: mode,
          },
        },
      });
    });

    logger.info("Model routing recorded", { projectId: project.id, taskCount: decisions.length });
    return {
      ok: true,
      taskCount: decisions.length,
      selectedCount: decisions.filter((decision) => decision.selected).length,
    };
  } catch (error) {
    logger.error("Could not record model routing", { error, projectId });
    return { ok: false, message: "The model choice could not be saved." };
  }
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

async function loadObservations(prisma: NonNullable<ReturnType<typeof getPrisma>>): Promise<PerformanceObservation[]> {
  const attempts = await prisma.taskAttempt.findMany({
    where: { status: { in: ["SUCCEEDED", "FAILED"] }, modelId: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      model: { include: { provider: { select: { slug: true } } } },
      task: { select: { type: true } },
    },
  });
  const observations: PerformanceObservation[] = [];
  for (const attempt of attempts) {
    const provider = attempt.model?.provider.slug;
    const taskType = asMember(TASK_TYPES, attempt.task.type.toLowerCase());
    if (!provider || !isProviderId(provider) || !attempt.model || !taskType) continue;
    observations.push({
      provider,
      modelId: attempt.model.slug,
      taskType,
      succeeded: attempt.status === "SUCCEEDED",
    });
  }
  return observations;
}

function availableProviders(
  enabled: ReadonlySet<ProviderId>,
  keys: Record<ProviderId, string | undefined>,
): Set<ProviderId> {
  const available = new Set<ProviderId>();
  for (const provider of PROVIDER_IDS) {
    if (enabled.has(provider) && keys[provider]?.trim()) available.add(provider);
  }
  return available;
}

function summary(decision: RoutingDecision): string {
  if (!decision.selected) {
    return decision.factors.find((factor) => factor.name === "result")?.detail ?? "No model was selected.";
  }
  const cost = decision.estimatedCostUsd ? ` Estimated cost $${decision.estimatedCostUsd}.` : "";
  const chance = decision.successProbability === null ? "" : ` Success estimate ${Math.round(decision.successProbability * 100)}%.`;
  return `Selected ${decision.selected.displayName}.${cost}${chance} ${decision.estimateNote}`;
}

function asMember<T extends string>(values: readonly T[], value: string): T | null {
  return values.find((entry) => entry === value) ?? null;
}
