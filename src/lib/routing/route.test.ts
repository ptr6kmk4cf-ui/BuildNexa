import { describe, expect, it } from "vitest";
import type { ProviderId, RegistryModel } from "@/lib/ai/types";
import type { OptimizationMode, TaskDifficulty, TaskType } from "@/lib/planner/types";
import { ESTIMATE_NOTE } from "@/lib/routing/config";
import { summarizeHistory } from "@/lib/routing/history";
import { routeTask } from "@/lib/routing/route";
import type { HistorySample, RouteTaskInput } from "@/lib/routing/types";

const PROVIDERS = new Set<ProviderId>(["openai", "anthropic", "gemini"]);

function model(overrides: Partial<RegistryModel> & Pick<RegistryModel, "provider" | "modelId" | "displayName">): RegistryModel {
  return {
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
    pricing: { inputPerMillion: "1", outputPerMillion: "4", cachedInputPerMillion: null },
    ...overrides,
  };
}

const cheap = model({
  provider: "openai",
  modelId: "cheap-coder",
  displayName: "Cheap coder",
  coding: 2,
  reasoning: 2,
  planning: 2,
  debugging: 2,
  research: 2,
  speed: 5,
  reliability: 2,
  pricing: { inputPerMillion: "0.15", outputPerMillion: "0.60", cachedInputPerMillion: null },
});

const mid = model({
  provider: "anthropic",
  modelId: "mid-coder",
  displayName: "Mid coder",
  coding: 4,
  reasoning: 4,
  planning: 4,
  debugging: 4,
  research: 3,
  speed: 4,
  reliability: 4,
  pricing: { inputPerMillion: "3", outputPerMillion: "15", cachedInputPerMillion: null },
});

const strong = model({
  provider: "gemini",
  modelId: "strong-reasoner",
  displayName: "Strong reasoner",
  coding: 5,
  reasoning: 5,
  planning: 5,
  debugging: 5,
  research: 5,
  speed: 2,
  reliability: 5,
  pricing: { inputPerMillion: "15", outputPerMillion: "75", cachedInputPerMillion: null },
});

const catalog = [cheap, mid, strong];

function task(overrides: Partial<RouteTaskInput> & Pick<RouteTaskInput, "type" | "difficulty">): RouteTaskInput {
  return {
    id: "task-1",
    title: "Sample task",
    priority: "medium",
    complexity: 2,
    ...overrides,
  };
}

function route(input: {
  type: TaskType;
  difficulty: TaskDifficulty;
  mode?: OptimizationMode;
  complexity?: number;
  priority?: RouteTaskInput["priority"];
  models?: RegistryModel[];
  available?: ReadonlySet<ProviderId>;
  history?: HistorySample[];
  title?: string;
}) {
  return routeTask({
    task: task({
      type: input.type,
      difficulty: input.difficulty,
      complexity: input.complexity,
      priority: input.priority,
      title: input.title ?? "Sample task",
    }),
    mode: input.mode ?? "balanced",
    models: input.models ?? catalog,
    availableProviders: input.available ?? PROVIDERS,
    history: input.history,
  });
}

describe("model routing", () => {
  it("picks a cheap model for a simple coding task", () => {
    const decision = route({ type: "coding", difficulty: "low", complexity: 2, title: "Fix a label" });
    expect(decision.outcome).toBe("selected");
    expect(decision.selected?.modelId).toBe("cheap-coder");
    expect(decision.estimateNote).toBe(ESTIMATE_NOTE);
    expect(decision.factors.every((factor) => factor.detail.length < 240 && !factor.detail.includes("\n"))).toBe(true);
    expect(JSON.stringify(decision)).not.toMatch(/chain of thought|step by step/i);
  });

  it("does not pick the cheapest model for a complex coding task", () => {
    const decision = route({
      type: "coding",
      difficulty: "high",
      complexity: 3,
      title: "Refactor complex authentication",
    });
    expect(decision.outcome).toBe("selected");
    expect(decision.selected?.modelId).toBe("mid-coder");
    const cheapCandidate = decision.candidates.find((candidate) => candidate.modelId === "cheap-coder");
    expect(cheapCandidate?.rejection?.code).toBe("insufficient_capability");
    const midCost = decision.candidates.find((candidate) => candidate.modelId === "mid-coder")?.estimatedCostUsd;
    const strongCost = decision.candidates.find((candidate) => candidate.modelId === "strong-reasoner")?.estimatedCostUsd;
    expect(midCost).toBeTruthy();
    expect(strongCost).toBeTruthy();
    expect(Number(midCost)).toBeLessThan(Number(strongCost));
  });

  it("uses a cheaper model for documentation", () => {
    const decision = route({ type: "documentation", difficulty: "low", complexity: 2, title: "Update the README" });
    expect(decision.selected?.modelId).toBe("cheap-coder");
  });

  it("routes a testing task to the mid model", () => {
    const decision = route({ type: "testing", difficulty: "medium", complexity: 3, title: "Add regression tests" });
    expect(decision.selected?.modelId).toBe("mid-coder");
  });

  it("routes a hard debugging task to the mid model in balanced mode", () => {
    const decision = route({ type: "debugging", difficulty: "high", complexity: 3, title: "Find the auth failure" });
    expect(decision.selected?.modelId).toBe("mid-coder");
  });

  it("changes the model when the optimization mode changes", () => {
    const input = { type: "coding" as const, difficulty: "high" as const, complexity: 3, title: "Refactor complex authentication" };
    expect(route({ ...input, mode: "savings" }).selected?.modelId).toBe("mid-coder");
    expect(route({ ...input, mode: "balanced" }).selected?.modelId).toBe("mid-coder");
    expect(route({ ...input, mode: "quality" }).selected?.modelId).toBe("strong-reasoner");
  });

  it("reports provider unavailable when no provider can be called", () => {
    const decision = route({
      type: "coding",
      difficulty: "low",
      available: new Set(),
    });
    expect(decision.outcome).toBe("provider_unavailable");
    expect(decision.selected).toBeNull();
    expect(decision.candidates.every((candidate) => candidate.rejection?.code === "provider_unavailable")).toBe(true);
  });

  it("reports insufficient capability when every available model is too weak", () => {
    const weak = model({
      provider: "openai",
      modelId: "weak-coder",
      displayName: "Weak coder",
      coding: 1,
      debugging: 1,
      reasoning: 1,
      toolSupport: false,
    });
    const decision = route({
      type: "coding",
      difficulty: "high",
      complexity: 3,
      models: [weak],
      available: new Set<ProviderId>(["openai"]),
    });
    expect(decision.outcome).toBe("insufficient_capability");
    expect(decision.selected).toBeNull();
    expect(decision.estimatedCostUsd).toBeNull();
  });

  it("lets observed failures move a cheap model under the floor", () => {
    const history = summarizeHistory(
      Array.from({ length: 20 }, () => ({
        provider: "openai" as const,
        modelId: "cheap-coder",
        taskType: "coding" as const,
        succeeded: false,
      })),
    );
    const decision = route({ type: "coding", difficulty: "low", complexity: 2, history });
    expect(decision.selected?.modelId).toBe("mid-coder");
    const cheapCandidate = decision.candidates.find((candidate) => candidate.modelId === "cheap-coder");
    expect(cheapCandidate?.rejection?.code).toBe("below_success_floor");
  });

  it("refuses to invent a price when capable models are unpriced", () => {
    const unpriced = model({
      provider: "openai",
      modelId: "unpriced-coder",
      displayName: "Unpriced coder",
      coding: 5,
      pricing: { inputPerMillion: null, outputPerMillion: null, cachedInputPerMillion: null },
    });
    const decision = route({
      type: "coding",
      difficulty: "low",
      models: [unpriced],
      available: new Set<ProviderId>(["openai"]),
    });
    expect(decision.outcome).toBe("unpriced");
    expect(decision.selected).toBeNull();
    expect(decision.estimatedCostUsd).toBeNull();
  });
});
