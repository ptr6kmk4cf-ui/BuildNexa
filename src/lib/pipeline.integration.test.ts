import { describe, expect, it } from "vitest";
import { approveSpend, commitSpend, createBudgetLedger, ledgerSpentUsd } from "@/lib/budget/ledger";
import { createPlan } from "@/lib/planner";
import { routeTask } from "@/lib/routing/route";
import type { RegistryModel } from "@/lib/ai/types";

const GOAL = "Add a logout button to the settings page and cover it with a component test.";

const model: RegistryModel = {
  provider: "openai",
  modelId: "cheap-coder",
  displayName: "Cheap coder",
  contextWindow: 200_000,
  coding: 3,
  reasoning: 3,
  planning: 3,
  debugging: 3,
  research: 3,
  speed: 4,
  reliability: 3,
  toolSupport: true,
  streaming: true,
  pricing: { inputPerMillion: "0.15", outputPerMillion: "0.60", cachedInputPerMillion: null },
};

describe("local plan, route, and budget pipeline", () => {
  it("plans a real task, selects a priced model, records cost, and blocks an over-budget call", () => {
    const planned = createPlan({ goal: GOAL, optimizationMode: "balanced", budgetUsd: "10.00" });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.tasks.length).toBeGreaterThan(0);
    expect(planned.plan.summary).toContain("not spent");

    const first = planned.plan.tasks[0];
    if (!first) throw new Error("missing task");
    const decision = routeTask({
      task: {
        id: first.id,
        title: first.title,
        type: first.type,
        difficulty: first.difficulty,
        priority: first.priority,
        complexity: first.complexity,
      },
      mode: "balanced",
      models: [model],
      availableProviders: new Set(["openai"]),
    });
    expect(decision.outcome).toBe("selected");
    expect(decision.selected?.modelId).toBe("cheap-coder");
    expect(decision.estimatedCostUsd).toBeTruthy();

    const ledger = createBudgetLedger("10.00");
    expect(ledger).not.toBeNull();
    if (!ledger) return;
    const estimate = decision.estimatedCostUsd ?? "0.010000";
    const approved = approveSpend(ledger, "initial", estimate);
    expect(approved.ok).toBe(true);
    commitSpend(ledger, "initial", estimate, estimate);
    expect(ledgerSpentUsd(ledger, "initial")).toBe(estimate);

    const blocked = approveSpend(ledger, "initial", "9.000000");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(["insufficient_budget", "budget_exhausted"]).toContain(blocked.reason);
  });
});
