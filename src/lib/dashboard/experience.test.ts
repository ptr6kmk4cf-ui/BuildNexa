import { describe, expect, it } from "vitest";
import { summarizeCosts } from "@/lib/budget/summary";
import type { CostLine } from "@/lib/budget/types";
import { countCompletedProjects, taskMarker } from "@/lib/dashboard/status";
import { previewPlan } from "@/lib/dashboard/preview";

const goal = "Add Google and Apple authentication to my application, update the database, create the API endpoints, build the login interface, add tests and prepare a pull request.";

function line(overrides: Partial<CostLine> & Pick<CostLine, "taskId" | "kind" | "amountUsd">): CostLine {
  return {
    taskTitle: overrides.taskId,
    provider: "openai",
    modelId: "cheap",
    modelName: "Cheap",
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    toolCalls: 0,
    durationMs: 4,
    ...overrides,
  };
}

describe("task markers", () => {
  it("maps execution states to the live symbols", () => {
    expect(taskMarker("COMPLETED", "PENDING")).toEqual({ symbol: "✓", label: "Completed" });
    expect(taskMarker("RUNNING", "PENDING")).toEqual({ symbol: "●", label: "Running" });
    expect(taskMarker(null, "PENDING")).toEqual({ symbol: "○", label: "Queued" });
    expect(taskMarker("FAILED", "PENDING")).toEqual({ symbol: "⚠", label: "Failed" });
    expect(taskMarker("ESCALATED", "IN_PROGRESS")).toEqual({ symbol: "↗", label: "Escalated" });
    expect(taskMarker("CANCELLED", "PENDING").label).toBe("Cancelled");
  });
});

describe("completed projects", () => {
  it("counts a project only when every task execution completed", () => {
    expect(countCompletedProjects([
      { taskStates: ["COMPLETED", "COMPLETED"] },
      { taskStates: ["COMPLETED", "FAILED"] },
      { taskStates: [] },
      { taskStates: ["COMPLETED"] },
    ])).toBe(2);
  });
});

describe("project creation preview", () => {
  it("reviews a real plan before anything is saved", () => {
    const preview = previewPlan({
      goal,
      optimizationMode: "balanced",
      budgetUsd: "25",
      repository: null,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.tasks.map((task) => task.id)).toContain("backend");
    const backend = preview.tasks.find((task) => task.id === "backend");
    expect(backend?.dependencies).toEqual(["database"]);
    expect(preview.summary.length).toBeGreaterThan(20);
  });

  it("rejects an objective that is too short to plan", () => {
    const preview = previewPlan({
      goal: "fix it",
      optimizationMode: "savings",
      budgetUsd: "5",
      repository: null,
    });
    expect(preview.ok).toBe(false);
  });
});

describe("dashboard savings from recorded charges", () => {
  it("labels the premium replay as an estimate", () => {
    const summary = summarizeCosts([
      line({
        taskId: "write",
        taskTitle: "Write",
        kind: "initial",
        amountUsd: "1.000000",
        inputTokens: 1000,
        outputTokens: 200,
        provider: "openai",
        modelId: "cheap",
        modelName: "Cheap",
      }),
      line({
        taskId: "write",
        taskTitle: "Write",
        kind: "retry",
        amountUsd: "0.250000",
        provider: "openai",
        modelId: "cheap",
        modelName: "Cheap",
      }),
    ], "25", { inputPerMillion: "3", outputPerMillion: "15", cachedInputPerMillion: "0.3" });
    expect(summary.actualUsd).toBe("1.25");
    expect(summary.remainingUsd).toBe("23.75");
    expect(summary.retryUsd).toBe("0.25");
    expect(summary.comparison.measuredSavingsUsd).toBeNull();
    expect(summary.comparison.baselineNote).toContain("Estimated");
    expect(summary.comparison.projectedSavingsUsd).not.toBeNull();
  });
});
