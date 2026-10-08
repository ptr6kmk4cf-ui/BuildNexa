"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { InputValidationError } from "@/lib/errors";
import { projectLinkFromRepository } from "@/lib/github/types";
import { logger } from "@/lib/logger";
import { createPlan, projectNameFromGoal } from "@/lib/planner";
import {
  initialPlanProjectFormState,
  type PlanProjectFieldErrors,
  type PlanProjectFormState,
} from "@/lib/project-form";
import { parseInput, planProjectInputSchema } from "@/lib/validation";
import { selectCurrentUsersRepository } from "@/server/github";
import { savePlannedProject } from "@/server/plan";

function fieldErrorsFromDetails(details: unknown): PlanProjectFieldErrors {
  if (typeof details !== "object" || details === null || !("fieldErrors" in details)) return {};
  const fieldErrors = details.fieldErrors;
  if (typeof fieldErrors !== "object" || fieldErrors === null) return {};
  const record = fieldErrors as Record<string, unknown>;
  const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item) => typeof item === "string") : []);
  return {
    ...(strings(record.goal).length > 0 ? { goal: strings(record.goal) } : {}),
    ...(strings(record.budget).length > 0 ? { budget: strings(record.budget) } : {}),
    ...(strings(record.optimizationMode).length > 0 ? { optimizationMode: strings(record.optimizationMode) } : {}),
    ...(strings(record.repositoryId).length > 0 ? { repositoryId: strings(record.repositoryId) } : {}),
  };
}

export async function planProject(
  _previous: PlanProjectFormState,
  formData: FormData,
): Promise<PlanProjectFormState> {
  try {
    const input = parseInput(planProjectInputSchema, {
      goal: formData.get("goal"),
      budget: formData.get("budget"),
      optimizationMode: formData.get("optimizationMode"),
      repositoryId: formData.get("repositoryId"),
    });
    const link = input.repositoryId ? await selectCurrentUsersRepository(input.repositoryId) : null;
    if (link && !link.ok) {
      return { ...initialPlanProjectFormState, status: "error", message: link.message };
    }
    const planned = createPlan({
      goal: input.goal,
      optimizationMode: input.optimizationMode,
      budgetUsd: input.budget,
      repository: link?.ok
        ? {
            fullName: link.repository.fullName,
            description: link.repository.description,
            defaultBranch: link.repository.defaultBranch,
            private: link.repository.private,
          }
        : null,
    });
    if (!planned.ok) {
      return {
        status: "error",
        message: null,
        fieldErrors: { goal: [planned.message] },
      };
    }
    const saved = await savePlannedProject({
      name: projectNameFromGoal(input.goal),
      goal: input.goal,
      budgetUsd: input.budget,
      optimizationMode: input.optimizationMode,
      plan: planned.plan,
      ...(link?.ok
        ? { link: { userId: link.userId, repository: projectLinkFromRepository(link.repository) } }
        : {}),
    });
    if (!saved.ok) return { ...initialPlanProjectFormState, status: "error", message: saved.message };
    redirect(`/projects/${saved.id}`);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof InputValidationError) {
      return {
        status: "error",
        message: "Check the highlighted fields.",
        fieldErrors: fieldErrorsFromDetails(error.details),
      };
    }
    logger.error("Could not plan project", { error });
    return { ...initialPlanProjectFormState, status: "error", message: "The plan could not be saved." };
  }
}
