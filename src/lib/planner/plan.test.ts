import { describe, expect, it } from "vitest";
import { canDependOn, createPlan, findCycle, projectNameFromGoal, validatePlan } from "@/lib/planner";
import type { PlanTask, PlannedWork } from "@/lib/planner";

const COMPLEX =
  "Add Google and Apple authentication to my application, update the database, create the API endpoints, build the login interface, add tests and prepare a pull request.";

const SIMPLE = "Fix the login button label.";

function task(plan: PlannedWork, id: string): PlanTask {
  const found = plan.tasks.find((entry) => entry.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

function sampleTask(overrides: Partial<PlanTask> & Pick<PlanTask, "id">): PlanTask {
  return {
    title: overrides.id,
    description: "Describe the work.",
    type: "coding",
    priority: "medium",
    difficulty: "medium",
    dependencies: [],
    expectedOutput: "A written result.",
    verificationCriteria: "The result matches the objective.",
    complexity: 2,
    ...overrides,
  };
}

describe("project planner", () => {
  it("plans a small interface fix without the full delivery chain", () => {
    const result = createPlan({ goal: SIMPLE, optimizationMode: "balanced", budgetUsd: "15" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.tasks.map((entry) => entry.title)).toEqual([
      "Repository analysis",
      "Frontend",
      "Tests",
      "Final verification",
    ]);
    expect(task(result.plan, "frontend").dependencies).toEqual(["repository-analysis"]);
    expect(task(result.plan, "tests").dependencies).toEqual(["frontend"]);
    expect(task(result.plan, "final-verification").dependencies).toEqual(["tests"]);
    expect(validatePlan(result.plan)).toEqual({ ok: true });
    expect(findCycle(result.plan.tasks)).toBeNull();
    expect(JSON.stringify(result.plan)).not.toMatch(/gpt-|claude-|gemini-|modelId/);
  });

  it("turns a multi-part authentication request into the delivery graph", () => {
    const result = createPlan({
      goal: COMPLEX,
      optimizationMode: "balanced",
      budgetUsd: "40",
      repository: {
        fullName: "acme/web",
        description: "Next.js storefront",
        defaultBranch: "main",
        private: true,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.tasks.map((entry) => entry.title)).toEqual([
      "Repository analysis",
      "Architecture",
      "Database",
      "Backend",
      "Frontend",
      "Tests",
      "Security review",
      "Final verification",
    ]);
    expect(task(result.plan, "architecture").dependencies).toEqual(["repository-analysis"]);
    expect(task(result.plan, "database").dependencies).toEqual(["architecture"]);
    expect(task(result.plan, "backend").dependencies).toEqual(["database"]);
    expect(task(result.plan, "frontend").dependencies).toEqual(["backend"]);
    expect(task(result.plan, "tests").dependencies).toEqual(["frontend"]);
    expect(task(result.plan, "security-review").dependencies).toEqual(["tests"]);
    expect(task(result.plan, "final-verification").dependencies).toEqual(["security-review"]);
    expect(task(result.plan, "repository-analysis").description).toContain("acme/web");
    expect(task(result.plan, "repository-analysis").description).toContain("main");
    expect(task(result.plan, "repository-analysis").description).toContain("Next.js storefront");
    expect(task(result.plan, "repository-analysis").description).toContain("private");
    expect(task(result.plan, "final-verification").expectedOutput).toContain("pull request");
    expect(task(result.plan, "final-verification").expectedOutput).toContain("unopened");
    const databaseContext = result.plan.contextRequests.find((request) => request.taskId === "database");
    expect(databaseContext).toMatchObject({
      repositoryFullName: "acme/web",
      defaultBranch: "main",
      pathHints: ["prisma/schema.prisma", "prisma/migrations"],
    });
    expect(JSON.stringify(result.plan.contextRequests)).not.toMatch(/fileContents|export function/);
    expect(result.plan.summary).toContain("$40.00");
    expect(result.plan.summary).toContain("not spent");
    expect(validatePlan(result.plan)).toEqual({ ok: true });
    expect(projectNameFromGoal(COMPLEX)).toBe("Add Google and Apple authentication to my application");
  });

  it("adds planning and documentation in quality mode and drops them for savings", () => {
    const quality = createPlan({ goal: COMPLEX, optimizationMode: "quality", budgetUsd: "80" });
    const savings = createPlan({ goal: COMPLEX, optimizationMode: "savings", budgetUsd: "10" });
    expect(quality.ok && savings.ok).toBe(true);
    if (!quality.ok || !savings.ok) return;
    expect(quality.plan.tasks.map((entry) => entry.id)).toContain("planning");
    expect(quality.plan.tasks.map((entry) => entry.id)).toContain("documentation");
    expect(task(quality.plan, "security-review").dependencies).toEqual(["tests", "documentation"]);
    expect(savings.plan.tasks.map((entry) => entry.id)).not.toContain("planning");
    expect(savings.plan.tasks.map((entry) => entry.id)).not.toContain("documentation");
    expect(savings.plan.tasks.map((entry) => entry.id)).not.toContain("architecture");
    expect(task(savings.plan, "database").dependencies).toEqual(["repository-analysis"]);
    expect(task(savings.plan, "database").complexity).toBeLessThan(task(quality.plan, "database").complexity);
  });

  it("rejects a request that is not a software change", () => {
    expect(createPlan({ goal: "", optimizationMode: "balanced", budgetUsd: "10" })).toEqual({
      ok: false,
      message: "Describe a software change, such as the feature, bug, or tests to add.",
    });
    expect(createPlan({ goal: "buy milk and eggs", optimizationMode: "balanced", budgetUsd: "10" }).ok).toBe(false);
    expect(createPlan({ goal: "Add milk to the shopping list", optimizationMode: "savings", budgetUsd: "5" }).ok).toBe(
      false,
    );
    expect(createPlan({ goal: "Fix it", optimizationMode: "quality", budgetUsd: "5" }).ok).toBe(false);
    expect(createPlan({ goal: "Change my zip code today", optimizationMode: "balanced", budgetUsd: "5" }).ok).toBe(
      false,
    );
    expect(createPlan({ goal: "Tip the server after dinner", optimizationMode: "balanced", budgetUsd: "5" }).ok).toBe(
      false,
    );
    expect(createPlan({ goal: "Sew a button onto this coat", optimizationMode: "balanced", budgetUsd: "5" }).ok).toBe(
      false,
    );
    expect(createPlan({ goal: "There is a bug in the garden", optimizationMode: "balanced", budgetUsd: "5" }).ok).toBe(
      false,
    );
    expect(createPlan({ goal: "Change the bus route today", optimizationMode: "balanced", budgetUsd: "5" }).ok).toBe(
      false,
    );
    expect(createPlan({ goal: "Download the weather app today", optimizationMode: "balanced", budgetUsd: "5" }).ok).toBe(
      false,
    );
  });

  it("names the project from the first real clause, skipping a short lead-in", () => {
    expect(projectNameFromGoal("OK. Add authentication to the application now")).toBe(
      "Add authentication to the application now",
    );
  });

  it("plans a settings page and rejects a page mention with no software signal", () => {
    const planned = createPlan({
      goal: "Add a settings page to the app",
      optimizationMode: "balanced",
      budgetUsd: "10",
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.plan.tasks.map((entry) => entry.id)).toContain("frontend");
  });

  it("keeps a security review when authentication is requested alongside a login label", () => {
    const result = createPlan({
      goal: "Add Google authentication and fix the login button label.",
      optimizationMode: "balanced",
      budgetUsd: "20",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.tasks.map((entry) => entry.id)).toContain("security-review");
    expect(result.plan.tasks.map((entry) => entry.id)).toContain("frontend");
  });

  it("refuses a dependency that would create a cycle", () => {
    const tasks = [
      sampleTask({ id: "analysis", dependencies: [] }),
      sampleTask({ id: "backend", dependencies: ["analysis"] }),
    ];
    expect(canDependOn(tasks, "analysis", "backend")).toBe(false);
    expect(canDependOn(tasks, "backend", "backend")).toBe(false);
    expect(canDependOn(tasks, "backend", "missing")).toBe(false);
    expect(canDependOn(tasks, "analysis", "analysis")).toBe(false);
    expect(canDependOn([...tasks, sampleTask({ id: "tests", dependencies: [] })], "tests", "backend")).toBe(true);
  });

  it("rejects an invalid task and a circular graph", () => {
    const cyclic: PlannedWork = {
      summary: "Broken",
      optimizationMode: "balanced",
      budgetUsd: "10",
      contextRequests: [],
      tasks: [
        sampleTask({ id: "a", dependencies: ["b"] }),
        sampleTask({ id: "b", dependencies: ["c"] }),
        sampleTask({ id: "c", dependencies: ["a"] }),
      ],
    };
    const cyclicResult = validatePlan(cyclic);
    expect(cyclicResult.ok).toBe(false);
    if (!cyclicResult.ok) expect(cyclicResult.issues.join(" ")).toContain("Circular dependency");
    expect(findCycle(cyclic.tasks)).toEqual(["a", "b", "c", "a"]);

    const invalid = validatePlan({
      summary: "Broken",
      optimizationMode: "balanced",
      budgetUsd: "10",
      contextRequests: [
        {
          taskId: "missing",
          repositoryFullName: null,
          defaultBranch: null,
          reason: "Later, open a path.",
          pathHints: ["src/app\nconst secret = 1"],
        },
      ],
      tasks: [
        sampleTask({
          id: "orphan",
          title: " ",
          description: " ",
          type: "not-a-type" as PlanTask["type"],
          dependencies: ["orphan", "ghost", "ghost"],
          expectedOutput: "",
          verificationCriteria: "",
          complexity: 9 as PlanTask["complexity"],
        }),
      ],
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.issues).toEqual(
        expect.arrayContaining([
          "orphan has an unknown type.",
          "orphan needs a title.",
          "orphan needs a description.",
          "orphan needs an expected output.",
          "orphan needs verification criteria.",
          "orphan needs a complexity from 1 to 5.",
          "orphan cannot depend on itself.",
          "orphan depends on unknown task ghost.",
          "orphan lists ghost more than once.",
          "Context request missing does not match a task.",
          "Context request missing includes file contents instead of a path.",
        ]),
      );
    }
  });
});
