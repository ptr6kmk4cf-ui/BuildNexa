import "server-only";
import { io } from "next/cache";
import type { PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import { LOCAL_OPERATOR_EMAIL, LOCAL_OPERATOR_NAME } from "@/lib/constants";
import { getPrisma, initializeDatabase } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { databaseCheck } from "@/lib/health";
import { logger } from "@/lib/logger";
import { slugify } from "@/lib/slug";
import { idSchema, paginationSchema, parseInput, type CreateProjectInput } from "@/lib/validation";
import { readWorkspace, type LoadState } from "@/server/load";

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
  taskCount: number;
  enabledModelCount: number;
  recordedSpendUsd: string;
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
  }>;
};

export type ProjectDetail = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  objective: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  repositories: Array<{
    id: string;
    name: string;
    url: string | null;
    defaultBranch: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
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
  }>;
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
  return readWorkspace(async (prisma) => {
    const [projectCount, taskCount, enabledModelCount, spend, recentProjects, recentActivity] =
      await Promise.all([
        prisma.project.count(),
        prisma.task.count(),
        prisma.model.count({ where: { enabled: true } }),
        prisma.costRecord.aggregate({
          where: { currency: "USD" },
          _sum: { amount: true },
        }),
        prisma.project.findMany({
          orderBy: { updatedAt: "desc" },
          take: 5,
          select: { id: true, name: true, status: true, updatedAt: true },
        }),
        prisma.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 8,
          include: {
            project: { select: { name: true } },
            user: { select: { name: true } },
          },
        }),
      ]);

    return {
      projectCount,
      taskCount,
      enabledModelCount,
      recordedSpendUsd: decimalString(spend._sum.amount),
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
  return readWorkspace(async (prisma) => {
    const projects = await prisma.project.findMany({
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

  return readWorkspace(async (prisma) => {
    const project = await prisma.project.findUnique({
      where: { id: parsed.data },
      include: {
        repositories: { orderBy: { name: "asc" }, take: 50 },
        tasks: { orderBy: { updatedAt: "desc" }, take: 50 },
        budgets: { orderBy: { createdAt: "desc" }, take: 20 },
        pullRequests: { orderBy: { updatedAt: "desc" }, take: 20 },
      },
    });
    if (!project) return null;

    return {
      id: project.id,
      name: project.name,
      slug: project.slug,
      description: project.description,
      objective: project.objective,
      status: project.status,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      repositories: project.repositories.map((repository) => ({
        id: repository.id,
        name: repository.name,
        url: repository.url,
        defaultBranch: repository.defaultBranch,
      })),
      tasks: project.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
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
      })),
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

export async function getCosts(): Promise<LoadState<CostOverview>> {
  return readWorkspace(async (prisma) => {
    const [spend, recordCount, budgets, recent] = await Promise.all([
      prisma.costRecord.aggregate({
        where: { currency: "USD" },
        _sum: { amount: true },
      }),
      prisma.costRecord.count(),
      prisma.budget.findMany({
        orderBy: { updatedAt: "desc" },
        take: 20,
        include: { project: { select: { id: true, name: true } } },
      }),
      prisma.costRecord.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { project: { select: { name: true } } },
      }),
    ]);

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
        createdAt: record.createdAt.toISOString(),
      })),
    };
  });
}

export async function getActivity(input: unknown = { limit: 50 }): Promise<LoadState<ActivityEntry[]>> {
  const { limit } = parseInput(paginationSchema, input);
  return readWorkspace(async (prisma) => {
    const rows = await prisma.auditLog.findMany({
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
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  await io();
  const prisma = getPrisma();
  if (!prisma) {
    return {
      ok: false,
      message: "Connect PostgreSQL before creating a project. Set DATABASE_URL and apply the migration.",
    };
  }

  try {
    const project = await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email: LOCAL_OPERATOR_EMAIL },
        update: {},
        create: {
          email: LOCAL_OPERATOR_EMAIL,
          name: LOCAL_OPERATOR_NAME,
        },
      });
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
      return created;
    });

    logger.info("Project created", { projectId: project.id });
    return { ok: true, id: project.id };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, message: error.message };
    }
    logger.error("Could not save project", { error });
    return {
      ok: false,
      message: "The project could not be saved. Check the database connection and migration.",
    };
  }
}
