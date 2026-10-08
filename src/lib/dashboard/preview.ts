import { createPlan, projectNameFromGoal, type PlanRequest } from "@/lib/planner";

export type PlanPreviewTask = {
  id: string;
  title: string;
  description: string;
  type: string;
  dependencies: string[];
};

export type PlanPreview =
  | { ok: true; name: string; summary: string; tasks: PlanPreviewTask[] }
  | { ok: false; message: string };

export function planDraftKey(input: { repositoryId: string; goal: string; budget: string; mode: string }): string {
  return [input.repositoryId, input.goal.trim(), input.budget, input.mode].join("\u0000");
}

export function reviewedPlanIsCurrent(reviewedKey: string | null, draftKey: string): boolean {
  return reviewedKey !== null && reviewedKey === draftKey;
}

export function previewPlan(input: PlanRequest): PlanPreview {
  const planned = createPlan(input);
  if (!planned.ok) return { ok: false, message: planned.message };
  return {
    ok: true,
    name: projectNameFromGoal(input.goal),
    summary: planned.plan.summary,
    tasks: planned.plan.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      type: task.type,
      dependencies: [...task.dependencies],
    })),
  };
}
