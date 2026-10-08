export type TaskMarker = {
  symbol: "✓" | "●" | "○" | "⚠" | "↗";
  label: "Completed" | "Running" | "Queued" | "Failed" | "Cancelled" | "Escalated";
};

export function taskMarker(executionState: string | null, taskStatus: string): TaskMarker {
  const state = executionState?.toUpperCase() ?? "";
  const status = taskStatus.toUpperCase();
  if (state === "ESCALATED") return { symbol: "↗", label: "Escalated" };
  if (state === "COMPLETED" || (!state && status === "COMPLETED")) return { symbol: "✓", label: "Completed" };
  if (state === "RUNNING" || (!state && status === "IN_PROGRESS")) return { symbol: "●", label: "Running" };
  if (state === "FAILED" || (!state && status === "FAILED")) return { symbol: "⚠", label: "Failed" };
  if (state === "CANCELLED" || (!state && status === "CANCELLED")) return { symbol: "⚠", label: "Cancelled" };
  return { symbol: "○", label: "Queued" };
}

export function countCompletedProjects(projects: readonly { taskStates: readonly (string | null)[] }[]): number {
  return projects.filter((project) => project.taskStates.length > 0 && project.taskStates.every((state) => state === "COMPLETED")).length;
}
