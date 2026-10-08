export const TASK_TYPES = [
  "analysis",
  "planning",
  "architecture",
  "coding",
  "refactoring",
  "debugging",
  "testing",
  "documentation",
  "security",
  "review",
] as const;

export const OPTIMIZATION_MODES = ["savings", "balanced", "quality"] as const;

export const TASK_PRIORITIES = ["low", "medium", "high", "critical"] as const;

export const TASK_DIFFICULTIES = ["low", "medium", "high"] as const;

export type TaskType = (typeof TASK_TYPES)[number];
export type OptimizationMode = (typeof OPTIMIZATION_MODES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type TaskDifficulty = (typeof TASK_DIFFICULTIES)[number];
export type Complexity = 1 | 2 | 3 | 4 | 5;

export type PlanTask = {
  id: string;
  title: string;
  description: string;
  type: TaskType;
  priority: TaskPriority;
  difficulty: TaskDifficulty;
  dependencies: string[];
  expectedOutput: string;
  verificationCriteria: string;
  complexity: Complexity;
};

// A future context manager can open these paths. The planner never reads file contents.
export type ContextRequest = {
  taskId: string;
  repositoryFullName: string | null;
  defaultBranch: string | null;
  reason: string;
  pathHints: string[];
};

export type RepositoryContext = {
  fullName: string;
  description: string | null;
  defaultBranch: string;
  private: boolean;
};

export type PlannedWork = {
  summary: string;
  optimizationMode: OptimizationMode;
  budgetUsd: string;
  tasks: PlanTask[];
  contextRequests: ContextRequest[];
};

export type PlanRequest = {
  goal: string;
  optimizationMode: OptimizationMode;
  budgetUsd: string;
  repository?: RepositoryContext | null;
};
