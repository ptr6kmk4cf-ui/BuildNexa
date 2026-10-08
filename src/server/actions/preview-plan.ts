"use server";

import { InputValidationError } from "@/lib/errors";
import { previewPlan, type PlanPreview } from "@/lib/dashboard/preview";
import { parseInput, planProjectInputSchema } from "@/lib/validation";
import { selectCurrentUsersRepository } from "@/server/github";

export async function previewProjectPlan(formData: FormData): Promise<PlanPreview> {
  try {
    const input = parseInput(planProjectInputSchema, {
      goal: formData.get("goal"),
      budget: formData.get("budget"),
      optimizationMode: formData.get("optimizationMode"),
      repositoryId: formData.get("repositoryId"),
    });
    const link = input.repositoryId ? await selectCurrentUsersRepository(input.repositoryId) : null;
    if (link && !link.ok) return { ok: false, message: link.message };
    return previewPlan({
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
  } catch (error) {
    if (error instanceof InputValidationError) {
      return { ok: false, message: "Check the objective, budget, and mode before reviewing the plan." };
    }
    return { ok: false, message: "The plan could not be reviewed." };
  }
}
