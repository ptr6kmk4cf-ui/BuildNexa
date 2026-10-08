import { describe, expect, it } from "vitest";
import { summarizeCosts } from "@/lib/budget/summary";
import type { CostLine } from "@/lib/budget/types";
import { countCompletedProjects, runIsActive, taskMarker } from "@/lib/dashboard/status";
import { planDraftKey, previewPlan, reviewedPlanIsCurrent } from "@/lib/dashboard/preview";
import { githubNotice } from "@/lib/github/messages";

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
    expect(taskMarker("RUNNING", "PENDING", { runActive: false })).toEqual({ symbol: "⚠", label: "Interrupted" });
    expect(taskMarker("RUNNING", "PENDING", { runActive: true }).label).toBe("Running");
  });
});

describe("active runs", () => {
  it("ignores a running row whose heartbeat is older than the execution limit", () => {
    const now = Date.parse("2026-10-08T12:00:45.000Z");
    expect(runIsActive("RUNNING", "2026-10-08T12:00:00.000Z", now, 45_000)).toBe(false);
    expect(runIsActive("RUNNING", "2026-10-08T12:00:01.000Z", now, 45_000)).toBe(true);
    expect(runIsActive("FAILED", "2026-10-08T12:00:44.000Z", now, 45_000)).toBe(false);
  });
});

describe("plan review freshness", () => {
  it("requires another review after the objective changes", () => {
    const reviewed = planDraftKey({ repositoryId: "", goal: "Add login tests to the API.", budget: "25", mode: "balanced" });
    const edited = planDraftKey({ repositoryId: "", goal: "Add login tests and a pull request.", budget: "25", mode: "balanced" });
    expect(reviewedPlanIsCurrent(reviewed, reviewed)).toBe(true);
    expect(reviewedPlanIsCurrent(reviewed, edited)).toBe(false);
    expect(reviewedPlanIsCurrent(null, reviewed)).toBe(false);
  });
});

describe("project notices", () => {
  it("shows a saved-plan notice only for known codes", () => {
    expect(githubNotice("run-failed")).toMatch(/did not finish/);
    expect(githubNotice("route-failed")).toMatch(/Models were not chosen/);
    expect(githubNotice("please-start")).toBeNull();
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
