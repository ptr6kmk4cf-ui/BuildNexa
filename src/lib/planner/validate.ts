import { findCycle } from "@/lib/planner/graph";
import {
  TASK_DIFFICULTIES,
  TASK_PRIORITIES,
  TASK_TYPES,
  type ContextRequest,
  type PlannedWork,
  type PlanTask,
} from "@/lib/planner/types";

const TYPES = new Set<string>(TASK_TYPES);
const PRIORITIES = new Set<string>(TASK_PRIORITIES);
const DIFFICULTIES = new Set<string>(TASK_DIFFICULTIES);

export function validatePlan(plan: PlannedWork): { ok: true } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  if (plan.tasks.length === 0) issues.push("A plan needs at least one task.");

  const ids = new Set<string>();
  for (const task of plan.tasks) {
    if (ids.has(task.id)) issues.push(`Task id ${task.id} is duplicated.`);
    ids.add(task.id);
    issues.push(...taskIssues(task));
  }

  for (const task of plan.tasks) {
    const seen = new Set<string>();
    for (const dependencyId of task.dependencies) {
      if (dependencyId === task.id) issues.push(`${task.id} cannot depend on itself.`);
      if (!ids.has(dependencyId)) issues.push(`${task.id} depends on unknown task ${dependencyId}.`);
      if (seen.has(dependencyId)) issues.push(`${task.id} lists ${dependencyId} more than once.`);
      seen.add(dependencyId);
    }
  }

  const cycle = findCycle(plan.tasks);
  if (cycle) issues.push(`Circular dependency: ${cycle.join(" → ")}.`);

  for (const request of plan.contextRequests) {
    if (!ids.has(request.taskId)) issues.push(`Context request ${request.taskId} does not match a task.`);
    if (request.pathHints.length === 0) issues.push(`Context request ${request.taskId} has no path hints.`);
    if (request.pathHints.some((hint) => hint.includes("\n"))) {
      issues.push(`Context request ${request.taskId} includes file contents instead of a path.`);
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

export function readContextRequests(value: unknown): ContextRequest[] {
  if (!Array.isArray(value)) return [];
  const requests: ContextRequest[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.taskId !== "string" || typeof record.reason !== "string") continue;
    if (!Array.isArray(record.pathHints) || record.pathHints.some((hint) => typeof hint !== "string")) continue;
    requests.push({
      taskId: record.taskId,
      repositoryFullName: typeof record.repositoryFullName === "string" ? record.repositoryFullName : null,
      defaultBranch: typeof record.defaultBranch === "string" ? record.defaultBranch : null,
      reason: record.reason,
      pathHints: record.pathHints.filter((hint): hint is string => typeof hint === "string"),
    });
  }
  return requests;
}

function taskIssues(task: PlanTask): string[] {
  const issues: string[] = [];
  if (!TYPES.has(task.type)) issues.push(`${task.id} has an unknown type.`);
  if (!PRIORITIES.has(task.priority)) issues.push(`${task.id} has an unknown priority.`);
  if (!DIFFICULTIES.has(task.difficulty)) issues.push(`${task.id} has an unknown difficulty.`);
  if (!task.description.trim()) issues.push(`${task.id} needs a description.`);
  if (!task.expectedOutput.trim()) issues.push(`${task.id} needs an expected output.`);
  if (!task.verificationCriteria.trim()) issues.push(`${task.id} needs verification criteria.`);
  if (!Number.isInteger(task.complexity) || task.complexity < 1 || task.complexity > 5) {
    issues.push(`${task.id} needs a complexity from 1 to 5.`);
  }
  return issues;
}
