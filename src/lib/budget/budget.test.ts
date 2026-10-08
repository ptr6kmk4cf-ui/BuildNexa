import { describe, expect, it } from "vitest";
import { calculateCost } from "@/lib/ai/cost";
import { approveSpend, commitSpend, createBudgetLedger, ledgerSpentUsd, poolRemainingUsd } from "@/lib/budget/ledger";
import { chooseLowestCostPerSuccess } from "@/lib/budget/select";
import { budgetAlert, estimatePremiumBaseline, savingsComparison, summarizeCosts } from "@/lib/budget/summary";
import type { CostLine } from "@/lib/budget/types";
import type { ModelCaller } from "@/lib/execution/environment";
import { runExecution } from "@/lib/execution/run";
import type { ExecutionTask } from "@/lib/execution/types";

const model = { provider: "openai" as const, modelId: "cheap", displayName: "Cheap" };

function task(overrides: Partial<ExecutionTask> & Pick<ExecutionTask, "id">): ExecutionTask {
  return {
    title: overrides.id,
    description: "Write the result.",
    expectedOutput: "A short note.",
    verificationCriteria: "The note answers the task.",
    dependencies: [],
    sequence: 0,
    model,
    escalation: null,
    estimatedCostUsd: "0.200000",
    successProbability: 0.6,
    context: null,
    type: "coding",
    difficulty: "low",
    priority: "low",
    complexity: 1,
    ...overrides,
  };
}

function ok(text: string) {
  return {
    ok: true as const,
    modelId: "cheap",
    text,
    usage: { inputTokens: 100, outputTokens: 40, cachedInputTokens: 0 },
  };
}

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
    durationMs: 10,
    ...overrides,
  };
}

describe("budget enforcement", () => {
  it("keeps the first call out of the reserved shares", () => {
    const ledger = createBudgetLedger("1");
    expect(ledger).not.toBeNull();
    if (!ledger) return;
    const decision = approveSpend(ledger, "initial", "0.800000");
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.reason).toBe("insufficient_budget");
    expect(decision.message).toContain("reserved");
    expect(poolRemainingUsd(ledger, "retry")).toBe("0.15");
  });

  it("allows an explicit authorization to use more than the initial share", () => {
    const ledger = createBudgetLedger("1", true);
    expect(ledger).not.toBeNull();
    if (!ledger) return;
    expect(approveSpend(ledger, "initial", "0.800000").ok).toBe(true);
  });

  it("stops a later call when the remaining share is too small", () => {
    const ledger = createBudgetLedger("1");
    expect(ledger).not.toBeNull();
    if (!ledger) return;
    expect(approveSpend(ledger, "initial", "0.400000").ok).toBe(true);
    commitSpend(ledger, "initial", "0.400000", "0.400000");
    const decision = approveSpend(ledger, "initial", "0.400000");
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.reason).toBe("budget_exhausted");
    expect(ledgerSpentUsd(ledger)).toBe("0.4");
  });
});

describe("cost aggregation", () => {
  it("splits provider, model, task, retry, and escalation totals", () => {
    const summary = summarizeCosts([
      line({ taskId: "write", taskTitle: "Write", kind: "initial", amountUsd: "1.000000", provider: "openai", modelId: "cheap", modelName: "Cheap" }),
      line({ taskId: "write", taskTitle: "Write", kind: "retry", amountUsd: "0.250000", provider: "openai", modelId: "cheap", modelName: "Cheap" }),
      line({ taskId: "fix", taskTitle: "Fix", kind: "escalation", amountUsd: "2.000000", provider: "anthropic", modelId: "strong", modelName: "Strong" }),
    ], "10");
    expect(summary.actualUsd).toBe("3.25");
    expect(summary.remainingUsd).toBe("6.75");
    expect(summary.retryUsd).toBe("0.25");
    expect(summary.escalationUsd).toBe("2");
    expect(summary.byTask.map((row) => row.label)).toEqual(["Fix", "Write"]);
    expect(summary.byProvider.map((row) => row.key)).toEqual(["anthropic", "openai"]);
    expect(summary.byModel.map((row) => row.label)).toEqual(["Strong", "Cheap"]);
  });

  it("alerts when 80 percent of the budget is used", () => {
    expect(budgetAlert("8", "10")).toBe("80% of your project budget has been used.");
    expect(budgetAlert("10", "10")).toBe("The project budget has been used.");
    expect(budgetAlert("1", "10")).toBeNull();
  });
});

describe("savings labels", () => {
  it("keeps the premium replay as an estimate and does not invent measured savings", () => {
    const pricing = { inputPerMillion: "3", outputPerMillion: "15", cachedInputPerMillion: "1" };
    const lines = [
      line({
        taskId: "write",
        kind: "initial",
        amountUsd: "0.010000",
        inputTokens: 1000,
        outputTokens: 500,
        cachedInputTokens: 100,
      }),
    ];
    const baseline = estimatePremiumBaseline(lines, pricing);
    const comparison = savingsComparison("0.010000", baseline);
    expect(baseline).not.toBeNull();
    expect(comparison.estimatedBaselineUsd).toBe(baseline);
    expect(comparison.projectedSavingsUsd).not.toBeNull();
    expect(comparison.measuredSavingsUsd).toBeNull();
    expect(comparison.baselineNote).toContain("Estimated");
    expect(comparison.measuredNote).toContain("Not measured");
    expect(comparison.measuredNote).not.toContain(comparison.projectedSavingsUsd ?? "saved");
  });

  it("does not invent a baseline when token counts were not recorded", () => {
    const comparison = savingsComparison("7.420000", null);
    expect(comparison.estimatedBaselineUsd).toBeNull();
    expect(comparison.projectedSavingsUsd).toBeNull();
    expect(comparison.measuredSavingsUsd).toBeNull();
    expect(comparison.baselineNote).toContain("Not available");
  });
});

describe("cost per successful result", () => {
  it("prefers a higher token price when that model costs less per success", () => {
    const choice = chooseLowestCostPerSuccess([
      { id: "cheap-tokens", expectedCostUsd: "1", successProbability: 0.2, tokenPriceUsd: "0.10" },
      { id: "premium-tokens", expectedCostUsd: "2", successProbability: 0.9, tokenPriceUsd: "5" },
    ]);
    expect(choice?.choice.id).toBe("premium-tokens");
    expect(choice?.choice.tokenPriceUsd).toBe("5");
  });
});

describe("budgeted execution", () => {
  it("does not call a model when the budget cannot cover the first call", async () => {
    let calls = 0;
    const report = await runExecution({
      tasks: [task({ id: "a", estimatedCostUsd: "0.800000" })],
      caller: async () => {
        calls += 1;
        return ok("should not run");
      },
      budgetUsd: "1",
      price: () => "0.800000",
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(calls).toBe(0);
    expect(report.tasks[0]?.state).toBe("cancelled");
    expect(report.tasks[0]?.error).toContain("reserved");
    expect(report.costs).toEqual([]);
  });

  it("cancels the next task when the budget is exhausted", async () => {
    let calls = 0;
    const report = await runExecution({
      tasks: [
        task({ id: "a", sequence: 0, estimatedCostUsd: "0.400000" }),
        task({ id: "b", sequence: 1, estimatedCostUsd: "0.400000" }),
      ],
      caller: async () => {
        calls += 1;
        return ok("shipped");
      },
      budgetUsd: "1",
      price: () => "0.400000",
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(calls).toBe(1);
    expect(report.tasks.find((entry) => entry.taskId === "a")?.state).toBe("completed");
    expect(report.tasks.find((entry) => entry.taskId === "b")?.state).toBe("cancelled");
    expect(report.tasks.find((entry) => entry.taskId === "b")?.error).toContain("remaining budget");
  });

  it("records retry cost separately from the first call", async () => {
    let checks = 0;
    const report = await runExecution({
      tasks: [task({ id: "a", estimatedCostUsd: "0.200000" })],
      caller: async () => ok("revised"),
      budgetUsd: "10",
      price: () => "0.200000",
      maxAttempts: 1,
      verify: async () => {
        checks += 1;
        return checks === 1
          ? { outcome: "fail", checks: [{ kind: "test", command: "npm test", output: "failed", exitCode: 1, durationMs: 5, errors: "failed", outcome: "fail" }], durationMs: 5, errors: "failed", summary: "npm test exited 1", costUsd: null }
          : { outcome: "pass", checks: [{ kind: "test", command: "npm test", output: "ok", exitCode: 0, durationMs: 4, errors: null, outcome: "pass" }], durationMs: 4, errors: null, summary: "npm test exited 0", costUsd: null };
      },
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(report.tasks[0]?.state).toBe("completed");
    expect(report.costs.filter((cost) => cost.kind !== "verification").map((cost) => cost.kind)).toEqual(["initial", "retry"]);
    expect(report.costs.filter((cost) => cost.kind === "retry").reduce((sum, cost) => sum + Number(cost.amount), 0)).toBeCloseTo(0.2);
  });

  it("records escalation cost on the stronger model", async () => {
    const calls: string[] = [];
    const caller: ModelCaller = async (call) => {
      calls.push(call.modelId);
      if (call.modelId === "cheap") return { ok: false, error: "provider_error" };
      return ok("from the stronger model");
    };
    const report = await runExecution({
      tasks: [task({
        id: "a",
        estimatedCostUsd: "0.200000",
        escalation: { provider: "anthropic", modelId: "strong", displayName: "Strong" },
      })],
      caller,
      maxAttempts: 1,
      budgetUsd: "10",
      price: () => "0.500000",
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(calls).toEqual(["cheap", "strong"]);
    expect(report.tasks[0]).toMatchObject({ state: "completed", escalated: true, modelId: "strong" });
    expect(report.costs.map((cost) => cost.kind)).toEqual(["escalation"]);
    expect(report.costs[0]?.amount).toBe("0.500000");
  });

  it("still runs a cheaper task when another estimate does not fit the initial share", async () => {
    let calls = 0;
    const report = await runExecution({
      tasks: [
        task({ id: "big", sequence: 0, estimatedCostUsd: "0.800000" }),
        task({ id: "small", sequence: 1, estimatedCostUsd: "0.200000" }),
      ],
      caller: async () => {
        calls += 1;
        return ok("shipped");
      },
      budgetUsd: "1",
      price: () => "0.200000",
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(calls).toBe(1);
    expect(report.tasks.find((entry) => entry.taskId === "big")).toMatchObject({
      state: "cancelled",
    });
    expect(report.tasks.find((entry) => entry.taskId === "big")?.error).toContain("reserved");
    expect(report.tasks.find((entry) => entry.taskId === "small")?.state).toBe("completed");
  });

  it("charges a debugging task's first call to the initial share", async () => {
    let calls = 0;
    const report = await runExecution({
      tasks: [task({ id: "a", type: "debugging", estimatedCostUsd: "0.400000" })],
      caller: async () => {
        calls += 1;
        return ok("found it");
      },
      budgetUsd: "1",
      price: () => "0.400000",
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(calls).toBe(1);
    expect(report.tasks[0]?.state).toBe("completed");
    expect(report.costs.map((cost) => cost.kind)).toEqual(["initial"]);
  });

  it("stops after a failed check when the retry share cannot cover another call", async () => {
    let calls = 0;
    const report = await runExecution({
      tasks: [task({ id: "a", estimatedCostUsd: "0.200000" })],
      caller: async () => {
        calls += 1;
        return ok("revised");
      },
      budgetUsd: "1",
      price: () => "0.200000",
      verify: async () => ({
        outcome: "fail",
        checks: [{ kind: "test", command: "npm test", output: "failed", exitCode: 1, durationMs: 5, errors: "failed", outcome: "fail" }],
        durationMs: 5,
        errors: "failed",
        summary: "npm test exited 1",
        costUsd: null,
      }),
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(calls).toBe(1);
    expect(report.tasks[0]?.state).toBe("failed");
    expect(report.tasks[0]?.error).toContain("Verification did not pass");
    expect(report.tasks[0]?.error).toContain("share");
    expect(report.tasks[0]?.error).toContain("Cost incurred");
  });

  it("prices cached tokens from the provider rates", async () => {
    const usage = { inputTokens: 1000, outputTokens: 500, cachedInputTokens: 200 };
    const pricing = { inputPerMillion: "2", outputPerMillion: "8", cachedInputPerMillion: "0.5" };
    const quote = calculateCost(pricing, usage);
    const report = await runExecution({
      tasks: [task({ id: "a", estimatedCostUsd: "0.020000" })],
      caller: async () => ({ ok: true as const, modelId: "cheap", text: "priced", usage }),
      price: () => (quote.priced ? quote.amount : null),
    });
    expect(quote.priced).toBe(true);
    expect(report.ok).toBe(true);
    if (!report.ok || !quote.priced) return;
    expect(report.costs[0]).toMatchObject({
      amount: quote.amount,
      cachedInputTokens: 200,
      inputTokens: 1000,
      outputTokens: 500,
      kind: "initial",
      provider: "openai",
    });
  });
});
