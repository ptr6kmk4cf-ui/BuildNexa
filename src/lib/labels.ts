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
