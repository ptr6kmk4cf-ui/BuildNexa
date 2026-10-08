"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { InputValidationError } from "@/lib/errors";
import { projectLinkFromRepository } from "@/lib/github/types";
import { logger } from "@/lib/logger";
import { createPlan, projectNameFromGoal } from "@/lib/planner";
import {
  type PlanProjectFieldErrors,
  type PlanProjectFormState,
  type PlanProjectValues,
} from "@/lib/project-form";
import { parseInput, planProjectInputSchema } from "@/lib/validation";
import { selectCurrentUsersRepository } from "@/server/github";
import { savePlannedProject } from "@/server/plan";
import { routeStoredProject } from "@/server/routing";

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

function valuesFromForm(formData: FormData): PlanProjectValues {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const mode = text("optimizationMode");
  return {
    goal: text("goal"),
    budget: text("budget"),
    optimizationMode: mode === "savings" || mode === "quality" || mode === "balanced" ? mode : "balanced",
    repositoryId: text("repositoryId"),
  };
}

function planError(
  message: string | null,
  fieldErrors: PlanProjectFieldErrors,
  values: PlanProjectValues,
): PlanProjectFormState {
  return { status: "error", message, fieldErrors, values };
}

export async function planProject(
  _previous: PlanProjectFormState,
  formData: FormData,
): Promise<PlanProjectFormState> {
  const values = valuesFromForm(formData);
  try {
    const input = parseInput(planProjectInputSchema, {
      goal: formData.get("goal"),
      budget: formData.get("budget"),
      optimizationMode: formData.get("optimizationMode"),
      repositoryId: formData.get("repositoryId"),
    });
    const link = input.repositoryId ? await selectCurrentUsersRepository(input.repositoryId) : null;
    if (link && !link.ok) {
      return planError(link.message, {}, values);
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
      return planError(null, { goal: [planned.message] }, values);
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
    if (!saved.ok) return planError(saved.message, {}, values);
    await routeStoredProject(saved.id);
    redirect(`/projects/${saved.id}`);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof InputValidationError) {
      return planError("Check the highlighted fields.", fieldErrorsFromDetails(error.details), values);
    }
    logger.error("Could not plan project", { error });
    return planError("The plan could not be saved.", {}, values);
  }
}
