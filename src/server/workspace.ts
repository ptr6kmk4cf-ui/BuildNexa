import "server-only";
import { io } from "next/cache";
import type { PrismaClient } from "@/generated/prisma/client";
import { AppError, uniqueRecordMessage } from "@/lib/errors";
import { LOCAL_OPERATOR_EMAIL, LOCAL_OPERATOR_NAME } from "@/lib/constants";
import { anonymousMayUseLocalOperator } from "@/lib/security/viewer";
import { getPrisma, initializeDatabase } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { databaseCheck } from "@/lib/health";
import { logger } from "@/lib/logger";
import type { ProjectRepositoryLink } from "@/lib/github/types";
import { describePermissions, readPermissions } from "@/lib/github/permissions";
import { readContextRequests } from "@/lib/planner";
import type { ContextRequest } from "@/lib/planner";
import { slugify } from "@/lib/slug";
import { idSchema, paginationSchema, parseInput, type CreateProjectInput } from "@/lib/validation";
import { highestTokenPrice, summarizeCosts, type CostKind, type CostLine, type CostSummary } from "@/lib/budget";
import { listRegistryModels } from "@/lib/ai/registry";
import { addMoney } from "@/lib/routing/money";
import { countCompletedProjects, runIsActive } from "@/lib/dashboard/status";
import { EXECUTION_CONFIG } from "@/lib/execution/config";
import { readScopedWorkspace, readWorkspace, type LoadState } from "@/server/load";

export type ProjectSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  objective: string | null;
  status: string;
  updatedAt: string;
  repositoryCount: number;
  taskCount: number;
};

export type DashboardData = {
  projectCount: number;
  activeExecutions: number;
  completedProjects: number;
  recordedSpendUsd: string;
  budgetUsd: string | null;
  savings: {
    projectedUsd: string | null;
    measuredUsd: null;
    estimatedNote: string;
    measuredNote: string;
  };
  recentProjects: Array<{
    id: string;
    name: string;
    status: string;
    updatedAt: string;
  }>;
  recentActivity: ActivityEntry[];
};

export type ActivityEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
  projectName: string | null;
  actorName: string | null;
};

export type ProviderCatalog = {
  id: string;
  name: string;
  slug: string;
  enabled: boolean;
  models: Array<{
    id: string;
    name: string;
    slug: string;
    enabled: boolean;
    contextWindow: number | null;
    inputPricePerMillion: string | null;
    outputPricePerMillion: string | null;
  }>;
};

export type CostOverview = {
  totalUsd: string;
  recordCount: number;
  budgets: Array<{
    id: string;
    projectId: string;
    projectName: string;
    limitAmount: string;
    currency: string;
    period: string;
  }>;
  recent: Array<{
    id: string;
    projectName: string;
    amount: string;
    currency: string;
    createdAt: string;
    kind: string;
  }>;
  projects: Array<CostSummary & { projectId: string; projectName: string }>;
};

export type ProjectDetail = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  objective: string | null;
  status: string;
  optimizationMode: string;
  createdAt: string;
  updatedAt: string;
  plan: {
    id: string;
    summary: string;
    optimizationMode: string;
    contextRequests: ContextRequest[];
  } | null;
  repositories: Array<{
    id: string;
    name: string;
    url: string | null;
    defaultBranch: string;
    ownerLogin: string | null;
    githubRepoId: string | null;
    private: boolean;
    permission: string;
  }>;
  tasks: Array<{
    id: string;
    planKey: string | null;
    title: string;
    description: string | null;
    type: string;
    status: string;
    priority: string;
    difficulty: string;
    complexity: number;
    expectedOutput: string;
    verificationCriteria: string;
    sequence: number;
    dependsOn: string[];
    routing: {
      outcome: string;
      provider: string | null;
      modelName: string | null;
      modelSlug: string | null;
      estimatedCostUsd: string | null;
    } | null;
    execution: {
      state: string;
      provider: string | null;
      modelName: string | null;
      modelSlug: string | null;
      attemptCount: number;
      durationMs: number;
      escalated: boolean;
      actualCostUsd: string | null;
    } | null;
  }>;
  budgets: Array<{
    id: string;
    limitAmount: string;
    currency: string;
    period: string;
  }>;
  pullRequests: Array<{
    id: string;
    title: string;
    status: string;
    url: string | null;
    externalNumber: number | null;
  }>;
  runs: Array<{
    id: string;
    status: string;
    cancelRequested: boolean;
    active: boolean;
    createdAt: string;
    finishedAt: string | null;
  }>;
  logs: Array<{
    id: string;
    taskId: string;
    taskTitle: string;
    state: string;
    attempt: number;
    message: string;
    createdAt: string;
  }>;
  spend: CostSummary;
};

export type SettingsSnapshot = {
  database: "ok" | "unconfigured" | "unavailable";
  logLevel: string;
  nodeEnv: string;
  operatorEmail: string;
};

function money(value: { toString(): string } | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value.toString();
}

function decimalString(value: { toString(): string } | null | undefined): string {
  return money(value) ?? "0";
}

async function uniqueSlug(
  tx: Pick<PrismaClient, "project">,
  userId: string,
  name: string,
): Promise<string> {
  const base = slugify(name);
  const existing = await tx.project.findMany({
    where: {
      userId,
      OR: [{ slug: base }, { slug: { startsWith: `${base}-` } }],
    },
    select: { slug: true },
  });
  const taken = new Set(existing.map((row) => row.slug));
  if (!taken.has(base)) return base;

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!taken.has(candidate)) return candidate;
  }

  throw new AppError("A unique project address could not be created.", {
    code: "slug_exhausted",
    status: 409,
  });
}

export async function getDashboard(): Promise<LoadState<DashboardData>> {
  return readScopedWorkspace(async (prisma, viewerId) => {
    const owned = { userId: viewerId };
    const [projectCount, activeExecutions, taskProjects, spend, budgets, records, recentProjects, recentActivity] =
      await Promise.all([
        prisma.project.count({ where: owned }),
        prisma.executionRun.count({
          where: {
            status: "RUNNING",
            heartbeatAt: { gt: new Date(Date.now() - EXECUTION_CONFIG.staleRunMs) },
            project: owned,
          },
        }),
        prisma.project.findMany({
          where: owned,
          select: {
            tasks: {
              select: {
                executions: {
                  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                  take: 1,
                  select: { state: true },
                },
              },
            },
          },
        }),
        prisma.costRecord.aggregate({
          where: { currency: "USD", project: owned },
          _sum: { amount: true },
        }),
        prisma.budget.findMany({
          where: { currency: "USD", project: owned },
          orderBy: { createdAt: "desc" },
          select: { projectId: true, limitAmount: true },
        }),
        prisma.costRecord.findMany({
          where: { currency: "USD", project: owned },
          orderBy: { createdAt: "desc" },
          include: costRecordInclude,
        }),
        prisma.project.findMany({
          where: owned,
          orderBy: { updatedAt: "desc" },
          take: 6,
          select: { id: true, name: true, status: true, updatedAt: true },
        }),
        prisma.auditLog.findMany({
          where: { OR: [{ userId: viewerId }, { project: owned }] },
          orderBy: { createdAt: "desc" },
          take: 8,
          include: {
            project: { select: { name: true } },
            user: { select: { name: true } },
          },
        }),
      ]);

    const seenBudgets = new Set<string>();
    const budgetAmounts: string[] = [];
    for (const budget of budgets) {
      if (seenBudgets.has(budget.projectId)) continue;
      seenBudgets.add(budget.projectId);
      budgetAmounts.push(budget.limitAmount.toString());
    }
    const budgetUsd = budgetAmounts.length > 0 ? addMoney(budgetAmounts) : null;
    const comparison = summarizeCosts(records.map(toCostLine), budgetUsd, premiumPricing()).comparison;

    return {
      projectCount,
      activeExecutions,
      completedProjects: countCompletedProjects(taskProjects.map((project) => ({
        taskStates: project.tasks.map((task) => task.executions[0]?.state ?? null),
      }))),
      recordedSpendUsd: decimalString(spend._sum.amount),
      budgetUsd,
      savings: {
        projectedUsd: comparison.projectedSavingsUsd,
        measuredUsd: null,
        estimatedNote: comparison.baselineNote,
        measuredNote: comparison.measuredNote,
      },
      recentProjects: recentProjects.map((project) => ({
        id: project.id,
        name: project.name,
        status: project.status,
        updatedAt: project.updatedAt.toISOString(),
      })),
      recentActivity: recentActivity.map((entry) => ({
        id: entry.id,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        createdAt: entry.createdAt.toISOString(),
        projectName: entry.project?.name ?? null,
        actorName: entry.user?.name ?? null,
      })),
    };
  });
}

export async function listProjects(): Promise<LoadState<ProjectSummary[]>> {
  return readScopedWorkspace(async (prisma, viewerId) => {
    const projects = await prisma.project.findMany({
      where: { userId: viewerId },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        _count: { select: { repositories: true, tasks: true } },
      },
    });

    return projects.map((project) => ({
      id: project.id,
      name: project.name,
      slug: project.slug,
      description: project.description,
      objective: project.objective,
      status: project.status,
      updatedAt: project.updatedAt.toISOString(),
      repositoryCount: project._count.repositories,
      taskCount: project._count.tasks,
    }));
  });
}

export async function getProject(projectId: string): Promise<LoadState<ProjectDetail | null>> {
  const parsed = idSchema.safeParse(projectId);
  if (!parsed.success) {
    await io();
    return { status: "ready", data: null };
  }

  return readScopedWorkspace(async (prisma, viewerId) => {
    const project = await prisma.project.findFirst({
      where: { id: parsed.data, userId: viewerId },
      include: {
        repositories: { orderBy: { name: "asc" }, take: 50 },
        plans: { orderBy: { createdAt: "desc" }, take: 1 },
        tasks: {
          orderBy: { sequence: "asc" },
          take: 100,
          include: {
            dependencies: { select: { dependsOnTaskId: true } },
            decisions: {
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: 1,
              include: { model: { select: { name: true, slug: true, provider: { select: { slug: true } } } } },
            },
            executions: {
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: 1,
              include: { model: { select: { name: true, slug: true, provider: { select: { slug: true } } } } },
            },
          },
        },
        budgets: { orderBy: { createdAt: "desc" }, take: 20 },
        pullRequests: { orderBy: { updatedAt: "desc" }, take: 20 },
        costRecords: {
          where: { currency: "USD" },
          orderBy: { createdAt: "desc" },
          include: costRecordInclude,
        },
      },
    });
    if (!project) return null;
    const [runs, logs] = await Promise.all([
      prisma.executionRun.findMany({
        where: { projectId: project.id },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.executionLog.findMany({
        where: { execution: { task: { projectId: project.id } } },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { execution: { select: { task: { select: { id: true, title: true } } } } },
      }),
    ]);

    return {
      id: project.id,
      name: project.name,
      slug: project.slug,
      description: project.description,
      objective: project.objective,
      status: project.status,
      optimizationMode: project.optimizationMode,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      plan: project.plans[0]
        ? {
            id: project.plans[0].id,
            summary: project.plans[0].summary,
            optimizationMode: project.plans[0].optimizationMode,
            contextRequests: readContextRequests(project.plans[0].contextRequests),
          }
        : null,
      repositories: project.repositories.map((repository) => ({
        id: repository.id,
        name: repository.name,
        url: repository.url,
        defaultBranch: repository.defaultBranch,
        ownerLogin: repository.ownerLogin,
        githubRepoId: repository.githubRepoId,
        private: repository.private,
        permission: describePermissions(readPermissions(repository.permissions)),
      })),
      tasks: project.tasks.map((task) => ({
        id: task.id,
        planKey: task.planKey,
        title: task.title,
        description: task.description,
        type: task.type,
        status: task.status,
        priority: task.priority,
        difficulty: task.difficulty,
        complexity: task.complexity,
        expectedOutput: task.expectedOutput,
        verificationCriteria: task.verificationCriteria,
        sequence: task.sequence,
        dependsOn: task.dependencies.map((dependency) => dependency.dependsOnTaskId),
        routing: task.decisions[0]
          ? {
              outcome: task.decisions[0].outcome,
              provider: task.decisions[0].provider ?? task.decisions[0].model?.provider.slug ?? null,
              modelName: task.decisions[0].model?.name ?? null,
              modelSlug: task.decisions[0].modelSlug ?? task.decisions[0].model?.slug ?? null,
              estimatedCostUsd: task.decisions[0].estimatedCost?.toString() ?? null,
            }
          : null,
        execution: task.executions[0]
          ? {
              state: task.executions[0].state,
              provider: task.executions[0].provider ?? task.executions[0].model?.provider.slug ?? null,
              modelName: task.executions[0].model?.name ?? null,
              modelSlug: task.executions[0].modelSlug ?? task.executions[0].model?.slug ?? null,
              attemptCount: task.executions[0].attemptCount,
              durationMs: task.executions[0].durationMs,
              escalated: task.executions[0].escalated,
              actualCostUsd: task.executions[0].actualCost?.toString() ?? null,
            }
          : null,
      })),
      budgets: project.budgets.map((budget) => ({
        id: budget.id,
        limitAmount: budget.limitAmount.toString(),
        currency: budget.currency,
        period: budget.period,
      })),
      pullRequests: project.pullRequests.map((pullRequest) => ({
        id: pullRequest.id,
        title: pullRequest.title,
        status: pullRequest.status,
        url: pullRequest.url,
        externalNumber: pullRequest.externalNumber,
      })),
      runs: runs.map((run) => ({
        id: run.id,
        status: run.status,
        cancelRequested: run.cancelRequested,
        active: runIsActive(run.status, run.heartbeatAt.toISOString(), Date.now(), EXECUTION_CONFIG.staleRunMs),
        createdAt: run.createdAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString() ?? null,
      })),
      logs: logs.map((entry) => ({
        id: entry.id,
        taskId: entry.execution.task.id,
        taskTitle: entry.execution.task.title,
        state: entry.state,
        attempt: entry.attempt,
        message: entry.message,
        createdAt: entry.createdAt.toISOString(),
      })),
      spend: summarizeCosts(
        project.costRecords.map(toCostLine),
        project.budgets[0]?.currency === "USD" ? project.budgets[0].limitAmount.toString() : null,
        premiumPricing(),
      ),
    };
  });
}

export async function listModelCatalog(): Promise<LoadState<ProviderCatalog[]>> {
  return readWorkspace(async (prisma) => {
    const providers = await prisma.provider.findMany({
      orderBy: { name: "asc" },
      include: {
        models: { orderBy: { name: "asc" } },
      },
    });

    return providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      slug: provider.slug,
      enabled: provider.enabled,
      models: provider.models.map((model) => ({
        id: model.id,
        name: model.name,
        slug: model.slug,
        enabled: model.enabled,
        contextWindow: model.contextWindow,
        inputPricePerMillion: money(model.inputPricePerMillion),
        outputPricePerMillion: money(model.outputPricePerMillion),
      })),
    }));
  });
}

export type RecordedPullRequest = {
  id: string;
  title: string;
  status: string;
  url: string | null;
  externalNumber: number | null;
  projectId: string;
  projectName: string;
};

export async function listRecordedPullRequests(): Promise<LoadState<RecordedPullRequest[]>> {
  return readScopedWorkspace(async (prisma, viewerId) => {
    const rows = await prisma.pullRequest.findMany({
      where: { project: { userId: viewerId } },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: { project: { select: { id: true, name: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      url: row.url,
      externalNumber: row.externalNumber,
      projectId: row.project.id,
      projectName: row.project.name,
    }));
  });
}

export async function getCosts(): Promise<LoadState<CostOverview>> {
  return readScopedWorkspace(async (prisma, viewerId) => {
    const owned = { project: { userId: viewerId } };
    const [spend, recordCount, budgets, recent, records] = await Promise.all([
      prisma.costRecord.aggregate({
        where: { currency: "USD", ...owned },
        _sum: { amount: true },
      }),
      prisma.costRecord.count({ where: owned }),
      prisma.budget.findMany({
        where: owned,
        orderBy: { updatedAt: "desc" },
        take: 20,
        include: { project: { select: { id: true, name: true } } },
      }),
      prisma.costRecord.findMany({
        where: owned,
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { project: { select: { name: true } } },
      }),
      prisma.costRecord.findMany({
        where: { currency: "USD", ...owned },
        orderBy: { createdAt: "desc" },
        include: {
          ...costRecordInclude,
          project: {
            select: {
              name: true,
              budgets: { where: { currency: "USD" }, orderBy: { createdAt: "desc" }, take: 1 },
            },
          },
        },
      }),
    ]);
    const premium = premiumPricing();
    const linesByProject = new Map<string, { name: string; limitUsd: string | null; lines: CostLine[] }>();
    for (const record of records) {
      const current = linesByProject.get(record.projectId) ?? {
        name: record.project.name,
        limitUsd: record.project.budgets[0]?.limitAmount.toString() ?? null,
        lines: [],
      };
      current.lines.push(toCostLine(record));
      linesByProject.set(record.projectId, current);
    }
    const projects = [...linesByProject.entries()].map(([projectId, project]) => ({
      projectId,
      projectName: project.name,
      ...summarizeCosts(project.lines, project.limitUsd, premium),
    }));

    return {
      totalUsd: decimalString(spend._sum.amount),
      recordCount,
      budgets: budgets.map((budget) => ({
        id: budget.id,
        projectId: budget.project.id,
        projectName: budget.project.name,
        limitAmount: budget.limitAmount.toString(),
        currency: budget.currency,
        period: budget.period,
      })),
      recent: recent.map((record) => ({
        id: record.id,
        projectName: record.project.name,
        amount: record.amount.toString(),
        currency: record.currency,
        kind: record.kind,
        createdAt: record.createdAt.toISOString(),
      })),
      projects,
    };
  });
}

const costRecordInclude = {
  task: { select: { title: true } },
  model: { select: { name: true, slug: true, provider: { select: { slug: true } } } },
} as const;

function premiumPricing() {
  return highestTokenPrice(listRegistryModels(getServerEnv().MODEL_PRICING).models);
}

function toCostLine(record: {
  id: string;
  taskId: string | null;
  kind: string;
  amount: { toString(): string };
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  toolCalls: number;
  durationMs: number;
  task: { title: string } | null;
  model: { name: string; slug: string; provider: { slug: string } } | null;
}): CostLine {
  const kind = record.kind.toLowerCase();
  return {
    taskId: record.taskId ?? record.id,
    taskTitle: record.task?.title ?? "Untied charge",
    provider: record.model?.provider.slug ?? "unknown",
    modelId: record.model?.slug ?? "unknown",
    modelName: record.model?.name ?? "Unknown model",
    kind: isCostKind(kind) ? kind : "initial",
    amountUsd: record.amount.toString(),
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    cachedInputTokens: record.cachedInputTokens,
    toolCalls: record.toolCalls,
    durationMs: record.durationMs,
  };
}

function isCostKind(value: string): value is CostKind {
  return value === "initial" || value === "retry" || value === "debug" || value === "escalation" || value === "verification";
}

export async function getActivity(input: unknown = { limit: 50 }): Promise<LoadState<ActivityEntry[]>> {
  const { limit } = parseInput(paginationSchema, input);
  return readScopedWorkspace(async (prisma, viewerId) => {
    const rows = await prisma.auditLog.findMany({
      where: { OR: [{ userId: viewerId }, { project: { userId: viewerId } }] },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        project: { select: { name: true } },
        user: { select: { name: true } },
      },
    });

    return rows.map((entry) => ({
      id: entry.id,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      createdAt: entry.createdAt.toISOString(),
      projectName: entry.project?.name ?? null,
      actorName: entry.user?.name ?? null,
    }));
  });
}

export async function getSettings(): Promise<SettingsSnapshot> {
  await io();
  const env = getServerEnv();
  const database = databaseCheck(await initializeDatabase());
  return {
    database,
    logLevel: env.LOG_LEVEL,
    nodeEnv: env.NODE_ENV,
    operatorEmail: LOCAL_OPERATOR_EMAIL,
  };
}

export async function createProjectRecord(
  input: CreateProjectInput,
  link?: { userId?: string; repository?: ProjectRepositoryLink },
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  await io();
  const prisma = getPrisma();
  if (!prisma) {
    return {
      ok: false,
      message: "Connect PostgreSQL before creating a project. Set DATABASE_URL and apply the migration.",
    };
  }
  if (!link?.userId && !anonymousMayUseLocalOperator(getServerEnv().NODE_ENV)) {
    return { ok: false, message: "Connect GitHub before creating a project." };
  }

  try {
    const project = await prisma.$transaction(async (tx) => {
      const user = link?.userId
        ? await tx.user.findUnique({ where: { id: link.userId } })
        : await tx.user.upsert({
            where: { email: LOCAL_OPERATOR_EMAIL },
            update: {},
            create: {
              email: LOCAL_OPERATOR_EMAIL,
              name: LOCAL_OPERATOR_NAME,
            },
          });
      if (!user) {
        throw new AppError("The signed-in account is not on record.", {
          code: "missing_user",
          status: 401,
        });
      }
      const slug = await uniqueSlug(tx, user.id, input.name);
      const created = await tx.project.create({
        data: {
          userId: user.id,
          name: input.name,
          slug,
          description: input.description,
          objective: input.objective,
          status: "DRAFT",
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          projectId: created.id,
          action: "CREATE",
          entityType: "Project",
          entityId: created.id,
          metadata: { name: created.name, slug: created.slug },
        },
      });
      if (link?.repository) {
        const repository = link.repository;
        const savedRepository = await tx.repository.create({
          data: {
            projectId: created.id,
            name: repository.fullName,
            url: repository.htmlUrl,
            defaultBranch: repository.defaultBranch,
            ownerLogin: repository.ownerLogin,
            githubRepoId: repository.githubRepoId,
            private: repository.private,
            permissions: repository.permissions,
            connectedRepositoryId: repository.connectedRepositoryId,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            projectId: created.id,
            action: "CREATE",
            entityType: "Repository",
            entityId: savedRepository.id,
            metadata: {
              fullName: repository.fullName,
              defaultBranch: repository.defaultBranch,
              githubRepoId: repository.githubRepoId,
            },
          },
        });
      }
      return created;
    });

    logger.info("Project created", { projectId: project.id });
    return { ok: true, id: project.id };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, message: error.message };
    }
    const conflict = uniqueRecordMessage(error);
    if (conflict) return { ok: false, message: conflict };
    logger.error("Could not save project", { error });
    return {
      ok: false,
      message: "The project could not be saved. Check the database connection and migration.",
    };
  }
}

export async function attachRepositoryRecord(input: {
  projectId: string;
  userId: string;
  repository: ProjectRepositoryLink;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  await io();
  const prisma = getPrisma();
  if (!prisma) {
    return { ok: false, message: "Connect PostgreSQL before attaching a repository." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: { id: input.projectId, userId: input.userId },
        select: { id: true },
      });
      if (!project) {
        throw new AppError("That project is not on record.", { code: "missing_project", status: 404 });
      }
      const saved = await tx.repository.create({
        data: {
          projectId: project.id,
          name: input.repository.fullName,
          url: input.repository.htmlUrl,
          defaultBranch: input.repository.defaultBranch,
          ownerLogin: input.repository.ownerLogin,
          githubRepoId: input.repository.githubRepoId,
          private: input.repository.private,
          permissions: input.repository.permissions,
          connectedRepositoryId: input.repository.connectedRepositoryId,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: input.userId,
          projectId: project.id,
          action: "CREATE",
          entityType: "Repository",
          entityId: saved.id,
          metadata: {
            fullName: input.repository.fullName,
            defaultBranch: input.repository.defaultBranch,
            githubRepoId: input.repository.githubRepoId,
          },
        },
      });
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    const conflict = uniqueRecordMessage(error);
    if (conflict) return { ok: false, message: conflict };
    logger.error("Could not attach repository", { error });
    return { ok: false, message: "The repository could not be attached." };
  }
}

