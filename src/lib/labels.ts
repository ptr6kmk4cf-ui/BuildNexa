const projectStatusLabel = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  PAUSED: "Paused",
  ARCHIVED: "Archived",
} as const;

const taskStatusLabel = {
  PENDING: "Pending",
  READY: "Ready",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
} as const;

const taskPriorityLabel = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
} as const;

const pullRequestStatusLabel = {
  DRAFT: "Draft",
  OPEN: "Open",
  MERGED: "Merged",
  CLOSED: "Closed",
} as const;

const budgetPeriodLabel = {
  NONE: "No period",
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  PROJECT: "Whole project",
} as const;

const auditActionLabel = {
  CREATE: "Created",
  UPDATE: "Updated",
  DELETE: "Deleted",
  SYSTEM: "System",
} as const;

function labelFrom(map: Record<string, string>, value: string): string {
  return map[value] ?? value;
}

export function labelProjectStatus(status: string): string {
  return labelFrom(projectStatusLabel, status);
}

export function labelTaskStatus(status: string): string {
  return labelFrom(taskStatusLabel, status);
}

export function labelTaskPriority(priority: string): string {
  return labelFrom(taskPriorityLabel, priority);
}

export function labelPullRequestStatus(status: string): string {
  return labelFrom(pullRequestStatusLabel, status);
}

export function labelBudgetPeriod(period: string): string {
  return labelFrom(budgetPeriodLabel, period);
}

export function labelAuditAction(action: string): string {
  return labelFrom(auditActionLabel, action);
}

const taskTypeLabel: Record<string, string> = {
  analysis: "Analysis",
  planning: "Planning",
  architecture: "Architecture",
  coding: "Coding",
  refactoring: "Refactoring",
  debugging: "Debugging",
  testing: "Testing",
  documentation: "Documentation",
  security: "Security",
  review: "Review",
};

const taskDifficultyLabel: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const optimizationModeLabel: Record<string, string> = {
  savings: "Savings",
  balanced: "Balanced",
  quality: "Quality",
};

export function labelTaskType(type: string): string {
  return taskTypeLabel[type.toLowerCase()] ?? type;
}

export function labelTaskDifficulty(difficulty: string): string {
  return taskDifficultyLabel[difficulty.toLowerCase()] ?? difficulty;
}

export function labelOptimizationMode(mode: string): string {
  return optimizationModeLabel[mode.toLowerCase()] ?? mode;
}

const routingOutcomeLabel: Record<string, string> = {
  selected: "Selected",
  provider_unavailable: "Provider unavailable",
  insufficient_capability: "Insufficient capability",
  unpriced: "Price not configured",
  below_threshold: "Below the quality floor",
};

export function labelRoutingOutcome(outcome: string): string {
  return routingOutcomeLabel[outcome] ?? outcome;
}

const executionStateLabel: Record<string, string> = {
  QUEUED: "Queued",
  RUNNING: "Running",
  COMPLETED: "Completed",
  FAILED: "Failed",
  ESCALATED: "Escalated",
  CANCELLED: "Cancelled",
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  escalated: "Escalated",
  cancelled: "Cancelled",
};

export function labelExecutionState(state: string): string {
  return executionStateLabel[state] ?? state;
}
