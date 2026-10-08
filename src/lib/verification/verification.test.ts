import { describe, expect, it } from "vitest";
import type { ProviderId, RegistryModel } from "@/lib/ai/types";
import { runExecution } from "@/lib/execution/run";
import type { ExecutionTask } from "@/lib/execution/types";
import type { ModelCaller } from "@/lib/execution/environment";
import { routeTask } from "@/lib/routing/route";
import { decideEscalation } from "@/lib/verification/decide";
import { commandLine, detectChecks, isAllowedVerificationCommand } from "@/lib/verification/detect";
import { interpretChecks, unknownVerification, unresolvedReport } from "@/lib/verification/interpret";
import { createWorkspaceVerifier } from "@/lib/verification/runner";
import type { TaskVerification, VerificationCheck } from "@/lib/verification/types";

const model = { provider: "openai" as const, modelId: "cheap-coder", displayName: "Cheap coder" };

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
    estimatedCostUsd: "0.010000",
    successProbability: 0.62,
    context: null,
    type: "coding",
    difficulty: "high",
    priority: "high",
    complexity: 4,
    ...overrides,
  };
}

function ok(text: string) {
  return { ok: true as const, modelId: "cheap-coder", text, usage: { inputTokens: 20, outputTokens: 10, cachedInputTokens: 0 } };
}

function check(kind: VerificationCheck["kind"], command: string, exitCode: number, output = "done"): VerificationCheck {
  return {
    kind,
    command,
    output,
    exitCode,
    durationMs: 12,
    errors: exitCode === 0 ? null : output,
    outcome: exitCode === 0 ? "pass" : "fail",
  };
}

function passed(): TaskVerification {
  return interpretChecks([check("test", "npm test", 0, "tests passed")]);
}

function failedTests(): TaskVerification {
  return interpretChecks([check("test", "npm test", 1, "expected login to redirect")]);
}

function failedBuild(): TaskVerification {
  return interpretChecks([check("build", "npm run build", 1, "Type error in src/app/page.tsx")]);
}

describe("project check detection", () => {
  it("uses the package scripts and does not invent extra commands", () => {
    const detected = detectChecks({
      packageJson: {
        scripts: { test: "vitest run", lint: "eslint .", typecheck: "tsc --noEmit", build: "next build", deploy: "bash deploy.sh" },
        devDependencies: { typescript: "5.0.0" },
      },
      hasTsconfig: true,
    });
    expect(detected.ok).toBe(true);
    if (!detected.ok) return;
    expect(detected.checks.map((entry) => commandLine(entry))).toEqual([
      "npm test",
      "npm run lint",
      "npm run typecheck",
      "npm run build",
    ]);
    expect(isAllowedVerificationCommand("npm", ["run", "deploy"])).toBe(false);
    expect(isAllowedVerificationCommand("bash", ["-c", "npm test"])).toBe(false);
  });

  it("reports unknown when the project has no JavaScript checks", () => {
    expect(detectChecks({ packageJson: null, hasTsconfig: false })).toMatchObject({ ok: false });
    expect(detectChecks({ packageJson: { scripts: { deploy: "echo hi" } }, hasTsconfig: false }).ok).toBe(false);
  });
});

describe("verification outcomes", () => {
  it("passes only when every check exits 0", () => {
    expect(passed().outcome).toBe("pass");
  });

  it("fails when tests fail", () => {
    const result = failedTests();
    expect(result.outcome).toBe("fail");
    expect(result.checks[0]).toMatchObject({ command: "npm test", exitCode: 1 });
  });

  it("fails a production build and records a partial result when another check passed", () => {
    expect(failedBuild().outcome).toBe("fail");
    const mixed = interpretChecks([check("lint", "npm run lint", 0), check("build", "npm run build", 1, "build failed")]);
    expect(mixed.outcome).toBe("partial");
    expect(mixed.errors).toContain("build failed");
  });
});

describe("verified execution", () => {
  it("completes when verification passes on the first reply", async () => {
    let calls = 0;
    const caller: ModelCaller = async () => {
      calls += 1;
      return ok("ship the note");
    };
    const report = await runExecution({
      tasks: [task({ id: "a", title: "A" })],
      caller,
      verify: async () => passed(),
      maxAttempts: 1,
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(calls).toBe(1);
    expect(report.tasks[0]).toMatchObject({ state: "completed" });
    expect(report.tasks[0]?.verifications[0]?.outcome).toBe("pass");
    expect(report.tasks[0]?.error).toBeNull();
  });

  it("does not report success when tests fail", async () => {
    const report = await runExecution({
      tasks: [task({ id: "a", title: "A" })],
      caller: async () => ok("I finished the tests"),
      verify: async () => failedTests(),
      maxVerificationAttempts: 1,
      maxAttempts: 1,
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(report.tasks[0]?.state).toBe("failed");
    expect(report.tasks[0]?.error).toContain("npm test");
    expect(report.tasks[0]?.error).toContain("Attempts: 1");
    expect(report.tasks[0]?.error).not.toContain("Verification passed");
  });

  it("does not report success when the build fails", async () => {
    const report = await runExecution({
      tasks: [task({ id: "a", title: "A" })],
      caller: async () => ok("build is fine"),
      verify: async () => failedBuild(),
      maxVerificationAttempts: 1,
      maxAttempts: 1,
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(report.tasks[0]?.state).toBe("failed");
    expect(report.tasks[0]?.verifications[0]?.checks[0]?.command).toBe("npm run build");
    expect(report.tasks[0]?.verifications[0]?.checks[0]?.exitCode).toBe(1);
  });

  it("retries the same model with the verification failure in the prompt", async () => {
    const prompts: string[] = [];
    let checks = 0;
    const caller: ModelCaller = async (call) => {
      prompts.push(call.messages[1]?.content ?? "");
      return ok("revised note");
    };
    const report = await runExecution({
      tasks: [task({ id: "a", title: "A" })],
      caller,
      maxAttempts: 1,
      verify: async () => {
        checks += 1;
        return checks === 1 ? failedTests() : passed();
      },
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("Verification failure to address");
    expect(prompts[1]).toContain("npm test");
    expect(report.tasks[0]?.state).toBe("completed");
    expect(report.tasks[0]?.verifications.map((entry) => entry.outcome)).toEqual(["fail", "pass"]);
  });

  it("asks routing for a stronger model after the corrected retry still fails", async () => {
    const calls: string[] = [];
    let checks = 0;
    const caller: ModelCaller = async (call) => {
      calls.push(call.modelId);
      return ok(`from ${call.modelId}`);
    };
    const report = await runExecution({
      tasks: [task({ id: "a", title: "Refactor authentication", successProbability: 0.4 })],
      caller,
      maxAttempts: 1,
      mode: "quality",
      availableProviders: new Set<ProviderId>(["openai", "anthropic", "gemini"]),
      models: [cheap, strong],
      verify: async () => {
        checks += 1;
        return checks < 3 ? failedTests() : passed();
      },
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(calls[0]).toBe("cheap-coder");
    expect(calls[1]).toBe("cheap-coder");
    expect(calls[2]).toBe("strong-reasoner");
    expect(report.tasks[0]).toMatchObject({ state: "completed", escalated: true, modelId: "strong-reasoner" });
  });

  it("stops at the attempt limit instead of looping", async () => {
    let calls = 0;
    const report = await runExecution({
      tasks: [task({ id: "a", title: "A" })],
      caller: async () => {
        calls += 1;
        return ok("still wrong");
      },
      maxAttempts: 1,
      maxVerificationAttempts: 3,
      verify: async () => failedTests(),
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(calls).toBe(3);
    expect(report.tasks[0]?.state).toBe("failed");
    expect(report.tasks[0]?.error).toContain("Attempts: 3");
    expect(report.tasks[0]?.error).toContain("attempt limit");
    expect(report.tasks[0]?.verificationStopReason).toContain("attempt limit");
  });

  it("stops an unknown verification without another model call", async () => {
    let calls = 0;
    const verification = unknownVerification("No package.json was found, so this is not a detected JavaScript or TypeScript project.");
    const report = await runExecution({
      tasks: [task({ id: "a", title: "A" })],
      caller: async () => {
        calls += 1;
        return ok("claimed success");
      },
      maxAttempts: 1,
      verify: async () => verification,
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(calls).toBe(1);
    expect(report.tasks[0]?.state).toBe("failed");
    expect(report.tasks[0]?.error).toContain("could not be run");
    expect(report.tasks[0]?.error).toContain("Cost incurred");
    expect(unresolvedReport({ verification, attempts: 1, costUsd: "0.01", reason: "the checks could not be run." })).not.toContain("Verification passed");
  });
});

describe("escalation decision", () => {
  it("retries before escalating when the same model is still within budget", () => {
    const decision = decideEscalation({
      outcome: "fail",
      attempt: 1,
      maxAttempts: 3,
      sameModelAttempts: 1,
      maxSameModelRetries: 1,
      spentUsd: "0.01",
      budgetUsd: "2",
      current: { ...model, estimatedCostUsd: "0.02", successProbability: 0.4 },
      routed: routedStrong(),
    });
    expect(decision.action).toBe("retry");
  });

  it("does not escalate when the stronger model is too expensive for the gain", () => {
    const decision = decideEscalation({
      outcome: "fail",
      attempt: 2,
      maxAttempts: 3,
      sameModelAttempts: 2,
      maxSameModelRetries: 1,
      spentUsd: "0.02",
      budgetUsd: null,
      current: { ...model, estimatedCostUsd: "0.01", successProbability: 0.8 },
      routed: routedStrong("40"),
    });
    expect(decision.action).toBe("stop");
  });
});

describe("workspace verifier", () => {
  it("runs allowlisted checks once and reuses them when files are unchanged", async () => {
    const spawned: string[] = [];
    const verify = createWorkspaceVerifier(process.cwd(), async (planned) => {
      spawned.push(commandLine(planned));
      if (planned.kind === "test") return { output: "1 failed", exitCode: 1, durationMs: 8 };
      return { output: "ok", exitCode: 0, durationMs: 3 };
    });
    const first = await verify();
    const second = await verify();
    expect(first.outcome).toBe("partial");
    expect(first.checks.map((entry) => entry.command)).toEqual(["npm test", "npm run lint", "npm run typecheck", "npm run build"]);
    expect(spawned).toEqual(first.checks.map((entry) => entry.command));
    expect(second.checks[0]?.exitCode).toBe(1);
    expect(second.summary).toContain("same result");
    expect(spawned).toHaveLength(4);
  });
});

function registryModel(overrides: Partial<RegistryModel> & Pick<RegistryModel, "provider" | "modelId" | "displayName">): RegistryModel {
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

const cheap = registryModel({
  provider: "openai",
  modelId: "cheap-coder",
  displayName: "Cheap coder",
  coding: 2,
  reasoning: 2,
  reliability: 2,
  pricing: { inputPerMillion: "0.15", outputPerMillion: "0.60", cachedInputPerMillion: null },
});

const strong = registryModel({
  provider: "gemini",
  modelId: "strong-reasoner",
  displayName: "Strong reasoner",
  coding: 5,
  reasoning: 5,
  planning: 5,
  debugging: 5,
  research: 5,
  reliability: 5,
  speed: 3,
  pricing: { inputPerMillion: "1", outputPerMillion: "4", cachedInputPerMillion: null },
});

function routedStrong(outputPerMillion = "4") {
  const selected = registryModel({
    ...strong,
    pricing: { inputPerMillion: "1", outputPerMillion, cachedInputPerMillion: null },
  });
  return routeTask({
    task: { id: "a", title: "Refactor authentication", type: "coding", difficulty: "high", priority: "critical", complexity: 4 },
    mode: "quality",
    models: [cheap, selected],
    availableProviders: new Set<ProviderId>(["openai", "gemini"]),
  });
}
