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
