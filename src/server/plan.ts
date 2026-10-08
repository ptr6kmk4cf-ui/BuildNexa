import "server-only";
import { io } from "next/cache";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { AppError } from "@/lib/errors";
import type { ProjectRepositoryLink } from "@/lib/github/types";
import { LOCAL_OPERATOR_EMAIL, LOCAL_OPERATOR_NAME } from "@/lib/constants";
import { getPrisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { readContextRequests, validatePlan } from "@/lib/planner";
import type { OptimizationMode, PlannedWork } from "@/lib/planner";
import { slugify } from "@/lib/slug";
import { idSchema } from "@/lib/validation";
import { readWorkspace, type LoadState } from "@/server/load";

const MODE = {
  savings: "SAVINGS",
  balanced: "BALANCED",
  quality: "QUALITY",
} as const;

const PRIORITY = {
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
  critical: "CRITICAL",
} as const;

const DIFFICULTY = {
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
} as const;

const TASK_TYPE = {
  analysis: "ANALYSIS",
  planning: "PLANNING",
  architecture: "ARCHITECTURE",
  coding: "CODING",
  refactoring: "REFACTORING",
  debugging: "DEBUGGING",
  testing: "TESTING",
  documentation: "DOCUMENTATION",
  security: "SECURITY",
  review: "REVIEW",
} as const;

export type PlannedTaskDetail = {
  projectId: string;
  projectName: string;
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
  dependencies: Array<{ id: string; title: string; planKey: string | null }>;
  context: {
    repositoryFullName: string | null;
    defaultBranch: string | null;
    reason: string;
    pathHints: string[];
  } | null;
};

export async function savePlannedProject(input: {
  name: string;
  goal: string;
  budgetUsd: string;
  optimizationMode: OptimizationMode;
  plan: PlannedWork;
  link?: { userId?: string; repository?: ProjectRepositoryLink };
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  await io();
  const prisma = getPrisma();
  if (!prisma) {
    return {
      ok: false,
      message: "Connect PostgreSQL before planning a project. Set DATABASE_URL and apply the migration.",
    };
  }
  const validated = validatePlan(input.plan);
  if (!validated.ok) return { ok: false, message: "The plan could not be saved." };

  try {
    const project = await prisma.$transaction(async (tx) => {
      const user = input.link?.userId
        ? await tx.user.findUnique({ where: { id: input.link.userId } })
        : await tx.user.upsert({
            where: { email: LOCAL_OPERATOR_EMAIL },
            update: {},
            create: { email: LOCAL_OPERATOR_EMAIL, name: LOCAL_OPERATOR_NAME },
          });
      if (!user) {
        throw new AppError("The signed-in account is not on record.", { code: "missing_user", status: 401 });
      }

      const slug = await uniqueSlug(tx, user.id, input.name);
      const created = await tx.project.create({
        data: {
          userId: user.id,
          name: input.name,
          slug,
          objective: input.goal,
          status: "DRAFT",
          optimizationMode: MODE[input.optimizationMode],
        },
      });
      const plan = await tx.projectPlan.create({
        data: {
          projectId: created.id,
          userId: user.id,
          goal: input.goal,
          optimizationMode: MODE[input.optimizationMode],
          summary: input.plan.summary,
          contextRequests: input.plan.contextRequests as Prisma.InputJsonValue,
        },
      });
      await tx.budget.create({
        data: {
          projectId: created.id,
          limitAmount: input.budgetUsd,
          currency: "USD",
          period: "PROJECT",
        },
      });

      const ids = new Map<string, string>();
      for (const [index, task] of input.plan.tasks.entries()) {
        const saved = await tx.task.create({
          data: {
            projectId: created.id,
            planId: plan.id,
            planKey: task.id,
            title: task.title,
            description: task.description,
            status: "PENDING",
            priority: PRIORITY[task.priority],
            type: TASK_TYPE[task.type],
            difficulty: DIFFICULTY[task.difficulty],
            complexity: task.complexity,
            expectedOutput: task.expectedOutput,
            verificationCriteria: task.verificationCriteria,
            sequence: index,
          },
        });
        ids.set(task.id, saved.id);
      }

      for (const task of input.plan.tasks) {
        const taskId = ids.get(task.id);
        if (!taskId) throw new AppError("A planned task was not stored.", { code: "plan_incomplete", status: 500 });
        for (const dependencyKey of task.dependencies) {
          const dependsOnTaskId = ids.get(dependencyKey);
          if (!dependsOnTaskId) {
            throw new AppError("A task dependency was not stored.", { code: "plan_incomplete", status: 500 });
          }
          await tx.taskDependency.create({ data: { taskId, dependsOnTaskId } });
        }
      }

      if (input.link?.repository) {
        const repository = input.link.repository;
        await tx.repository.create({
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
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          projectId: created.id,
          action: "CREATE",
          entityType: "ProjectPlan",
          entityId: plan.id,
          metadata: {
            name: created.name,
            optimizationMode: input.optimizationMode,
            taskCount: input.plan.tasks.length,
            budgetUsd: input.budgetUsd,
          },
        },
      });
      return created;
    });

    logger.info("Project plan created", { projectId: project.id, taskCount: input.plan.tasks.length });
    return { ok: true, id: project.id };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    if (isUniqueConflict(error)) {
      return { ok: false, message: "That repository is already attached to a project." };
    }
    logger.error("Could not save project plan", { error });
    return { ok: false, message: "The plan could not be saved. Check the database connection and migration." };
  }
}

export async function getPlannedTask(
  projectId: string,
  taskId: string,
): Promise<LoadState<PlannedTaskDetail | null>> {
  if (!idSchema.safeParse(projectId).success || !idSchema.safeParse(taskId).success) {
    await io();
    return { status: "ready", data: null };
  }

  return readWorkspace(async (prisma) => {
    const task = await prisma.task.findFirst({
      where: { id: taskId, projectId },
      include: {
        project: { select: { id: true, name: true } },
        plan: { select: { contextRequests: true } },
        dependencies: {
          include: { dependsOn: { select: { id: true, title: true, planKey: true } } },
        },
      },
    });
    if (!task) return null;

    const context =
      readContextRequests(task.plan?.contextRequests).find((request) => request.taskId === task.planKey) ?? null;
    return {
      projectId: task.project.id,
      projectName: task.project.name,
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
      dependencies: task.dependencies.map((dependency) => dependency.dependsOn),
      context,
    };
  });
}

async function uniqueSlug(tx: Pick<PrismaClient, "project">, userId: string, name: string): Promise<string> {
  const base = slugify(name);
  const existing = await tx.project.findMany({
    where: { userId, OR: [{ slug: base }, { slug: { startsWith: `${base}-` } }] },
    select: { slug: true },
  });
  const taken = new Set(existing.map((row) => row.slug));
  if (!taken.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new AppError("A unique project address could not be created.", { code: "slug_exhausted", status: 409 });
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
