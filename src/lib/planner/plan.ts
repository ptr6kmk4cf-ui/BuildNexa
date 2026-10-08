import { canDependOn } from "@/lib/planner/graph";
import { validatePlan } from "@/lib/planner/validate";
import type {
  Complexity,
  ContextRequest,
  OptimizationMode,
  PlanRequest,
  PlanTask,
  PlannedWork,
  RepositoryContext,
  TaskDifficulty,
} from "@/lib/planner/types";

const SOFTWARE =
  /\b(api|endpoint|endpoints|database|schema|migration|frontend|backend|interface|component|authentication|oauth|login|tests?|bug|repository|page|screen|ui|readme|code|function|module|app|application|website|server|button|form|route|pull request|refactor|debug|homepage)\b/i;

const INVALID_MESSAGE = "Describe a software change, such as the feature, bug, or tests to add.";

type Area =
  | "database"
  | "backend"
  | "frontend"
  | "tests"
  | "documentation"
  | "security"
  | "refactor"
  | "debug";

type Draft = Omit<PlanTask, "dependencies">;

export function projectNameFromGoal(goal: string): string {
  const normalized = goal.trim().replace(/\s+/g, " ");
  const sentence = normalized.split(/[.\n]/)[0]?.trim() || normalized;
  const clause = sentence.split(",")[0]?.trim() || sentence;
  const source = clause.length >= 12 && clause.length <= 80 ? clause : sentence;
  if (source.length <= 80) return source.length >= 2 ? source : "Planned project";
  return `${source.slice(0, 77).trimEnd()}...`;
}

export function createPlan(request: PlanRequest): { ok: true; plan: PlannedWork } | { ok: false; message: string } {
  const goal = request.goal.trim().replace(/\s+/g, " ");
  if (!isSoftwareObjective(goal)) return { ok: false, message: INVALID_MESSAGE };

  const repository = request.repository ?? null;
  const areas = detectAreas(goal);
  const auth = requestsAuthSystem(goal);
  const pullRequest = /\bpull request\b|\bmerge request\b/i.test(goal);
  const broad = isBroad(areas, auth);
  const tasks = buildTasks({
    goal,
    mode: request.optimizationMode,
    repository,
    areas,
    auth,
    pullRequest,
    broad,
  });
  const contextRequests = tasks.flatMap((task) => contextFor(task.id, repository));
  const plan: PlannedWork = {
    summary: summarize(request.optimizationMode, request.budgetUsd, tasks.length, contextRequests.length),
    optimizationMode: request.optimizationMode,
    budgetUsd: request.budgetUsd,
    tasks,
    contextRequests,
  };
  const validated = validatePlan(plan);
  if (!validated.ok) return { ok: false, message: "The plan could not be built." };
  return { ok: true, plan };
}

function isSoftwareObjective(goal: string): boolean {
  const words = goal.split(" ").filter(Boolean);
  return goal.length >= 12 && words.length >= 3 && SOFTWARE.test(goal);
}

function detectAreas(goal: string): Set<Area> {
  const areas = new Set<Area>();
  if (/\b(database|schema|migration|sql|postgres|prisma|tables?)\b/i.test(goal)) areas.add("database");
  if (/\b(api|apis|endpoint|endpoints|backend|server|handlers?|routes?)\b/i.test(goal)) areas.add("backend");
  if (/\b(ui|frontend|interface|pages?|screens?|buttons?|forms?|components?|homepage)\b/i.test(goal)) {
    areas.add("frontend");
  }
  if (/\b(tests?|testing|specs?)\b/i.test(goal)) areas.add("tests");
  if (/\b(docs?|documentation|readme)\b/i.test(goal)) areas.add("documentation");
  if (/\b(refactor|refactoring|restructure)\b/i.test(goal)) areas.add("refactor");
  if (/\b(bugs?|debug|debugging|broken|failing)\b/i.test(goal)) areas.add("debug");
  if (requestsAuthSystem(goal)) areas.add("security");
  return areas;
}

function requestsAuthSystem(goal: string): boolean {
  if (/\blogin\s+(button|label|text|copy|color|style)\b/i.test(goal)) return false;
  if (/\b(authentication|oauth|sso|sign-in|signin|signup|sign-up|password|credential)\b/i.test(goal)) return true;
  if (/\b(google|apple)\b/i.test(goal) && /\b(auth|login|sign)\b/i.test(goal)) return true;
  return /\blogin\s+(interface|page|screen|flow|form)\b/i.test(goal);
}

function isBroad(areas: Set<Area>, auth: boolean): boolean {
  const implementation = ["database", "backend", "frontend", "refactor", "debug"].filter((area) =>
    areas.has(area as Area),
  ).length;
  return implementation >= 2 || (auth && implementation >= 1);
}

function buildTasks(input: {
  goal: string;
  mode: OptimizationMode;
  repository: RepositoryContext | null;
  areas: Set<Area>;
  auth: boolean;
  pullRequest: boolean;
  broad: boolean;
}): PlanTask[] {
  const tasks: PlanTask[] = [];
  const quote = clip(input.goal, 180);
  const attach = (draft: Draft, dependencyIds: string[]) => {
    const task: PlanTask = { ...draft, dependencies: [] };
    tasks.push(task);
    for (const dependencyId of dependencyIds) {
      if (canDependOn(tasks, task.id, dependencyId)) task.dependencies.push(dependencyId);
    }
    return task;
  };

  const analysis = attach(
    {
      id: "repository-analysis",
      title: "Repository analysis",
      description: `${repositorySentence(input.repository)} Objective: ${quote}`,
      type: "analysis",
      priority: input.broad ? "high" : "medium",
      difficulty: "medium",
      expectedOutput: input.repository
        ? `A short note of what ${input.repository.fullName} already appears to contain, based on its name, branch, and description. No file bodies.`
        : "A list of assumptions, because no repository metadata is available.",
      verificationCriteria: "The note names the objective and does not claim that repository files were changed.",
      complexity: scale(2, input.mode),
    },
    [],
  );

  let spine = analysis.id;
  if (input.mode === "quality" && input.broad) {
    const planning = attach(
      {
        id: "planning",
        title: "Planning",
        description: `Order the work for: ${quote}`,
        type: "planning",
        priority: "high",
        difficulty: "medium",
        expectedOutput: "A written sequence of the implementation steps and the risks of doing them out of order.",
        verificationCriteria: "Each later task appears in the sequence, and no step depends on work that is scheduled after it.",
        complexity: scale(3, input.mode),
      },
      [spine],
    );
    spine = planning.id;
  }

  if (input.broad && input.mode !== "savings") {
    const architecture = attach(
      {
        id: "architecture",
        title: "Architecture",
        description: `Choose where the change lives before editing anything. Objective: ${quote}`,
        type: "architecture",
        priority: "high",
        difficulty: "high",
        expectedOutput: "A boundary diagram for the data, server, and interface pieces this goal touches.",
        verificationCriteria: "The diagram names each implementation task and the dependency between them.",
        complexity: scale(4, input.mode),
      },
      [spine],
    );
    spine = architecture.id;
  }

  const implementation: string[] = [];
  if (input.areas.has("database")) {
    implementation.push(
      attach(codingTask("database", "Database", input, "Update the stored data shape required by the objective."), [spine]).id,
    );
    spine = "database";
  }
  if (input.areas.has("backend")) {
    implementation.push(
      attach(codingTask("backend", "Backend", input, "Add the server behavior and API surface the objective asks for."), [spine]).id,
    );
    spine = "backend";
  }
  if (input.areas.has("frontend")) {
    implementation.push(
      attach(codingTask("frontend", "Frontend", input, "Build the interface the objective describes."), [spine]).id,
    );
    spine = "frontend";
  }
  if (input.areas.has("refactor")) {
    implementation.push(
      attach(
        {
          id: "refactor",
          title: "Refactor",
          description: `Restructure the existing code without changing the requested behavior. Objective: ${quote}`,
          type: "refactoring",
          priority: "medium",
          difficulty: "medium",
          expectedOutput: "A smaller or clearer structure that still meets the current behavior.",
          verificationCriteria: "The refactor does not add an unrelated feature, and the existing behavior is named in the notes.",
          complexity: scale(3, input.mode),
        },
        [spine],
      ).id,
    );
    spine = "refactor";
  }
  if (input.areas.has("debug")) {
    implementation.push(
      attach(
        {
          id: "debug",
          title: "Debug",
          description: `Find the failure behind the objective before changing behavior. Objective: ${quote}`,
          type: "debugging",
          priority: "high",
          difficulty: "medium",
          expectedOutput: "A cause, the condition that reproduces it, and the smallest change that addresses it.",
          verificationCriteria: "The cause is specific enough that someone else could reproduce the failure.",
          complexity: scale(3, input.mode),
        },
        [spine],
      ).id,
    );
    spine = "debug";
  }
  if (implementation.length === 0 && !input.areas.has("tests") && !input.areas.has("documentation")) {
    implementation.push(
      attach(codingTask("change", "Implementation", input, "Make the software change described in the objective."), [spine]).id,
    );
    spine = "change";
  }

  const afterImplementation = implementation.at(-1) ?? spine;
  const parallel: string[] = [];

  if (input.areas.has("tests") || implementation.length > 0) {
    const tests = attach(
      {
        id: "tests",
        title: "Tests",
        description: `Add checks for the behavior in the objective. Objective: ${quote}`,
        type: "testing",
        priority: "high",
        difficulty: input.broad ? "medium" : "low",
        expectedOutput: "Automated tests that fail if the requested behavior regresses.",
        verificationCriteria: "The tests name the user-visible behavior and do not require a model call.",
        complexity: scale(input.broad ? 3 : 2, input.mode),
      },
      [afterImplementation],
    );
    parallel.push(tests.id);
  }

  if (input.areas.has("documentation") || (input.mode === "quality" && input.broad)) {
    const documentation = attach(
      {
        id: "documentation",
        title: "Documentation",
        description: `Record how to use the change. Objective: ${quote}`,
        type: "documentation",
        priority: "low",
        difficulty: "low",
        expectedOutput: "A short usage note a later reader can follow without the original conversation.",
        verificationCriteria: "The note matches the objective and does not describe work that is not in the plan.",
        complexity: scale(2, input.mode),
      },
      [afterImplementation],
    );
    parallel.push(documentation.id);
  }

  const beforeReview = parallel.length > 0 ? parallel : [afterImplementation];
  if (input.auth || input.areas.has("security") || (input.mode === "quality" && input.broad)) {
    const security = attach(
      {
        id: "security-review",
        title: "Security review",
        description: input.auth
          ? `Review account linking, session handling, and data access for: ${quote}`
          : `Review the change for exposed secrets, missing checks, and unsafe defaults. Objective: ${quote}`,
        type: "security",
        priority: input.mode === "quality" && input.auth ? "critical" : "high",
        difficulty: "high",
        expectedOutput: "A list of security findings, each marked fixed in the plan or explicitly deferred.",
        verificationCriteria: "Authentication and stored credentials are mentioned when the objective asks for them. No secret value is copied into the note.",
        complexity: scale(4, input.mode),
      },
      beforeReview,
    );
    beforeReview.splice(0, beforeReview.length, security.id);
  }

  attach(
    {
      id: "final-verification",
      title: "Final verification",
      description: input.pullRequest
        ? `Check the finished plan against the objective and prepare a pull request checklist. Do not open the pull request. Objective: ${quote}`
        : `Check the finished plan against the objective. Objective: ${quote}`,
      type: "review",
      priority: "high",
      difficulty: "medium",
      expectedOutput: input.pullRequest
        ? "A pass or fail for every task, plus a pull request title and test plan. The pull request stays unopened."
        : "A pass or fail for every task, with any gap stated in one sentence.",
      verificationCriteria: "Every earlier task is listed, and the result does not say that code was pushed or a pull request was opened.",
      complexity: scale(2, input.mode),
    },
    beforeReview,
  );

  return tasks;
}

function codingTask(id: string, title: string, input: { goal: string; mode: OptimizationMode; broad: boolean }, action: string): Draft {
  const quote = clip(input.goal, 180);
  return {
    id,
    title,
    description: `${action} Objective: ${quote}`,
    type: "coding",
    priority: input.broad ? "high" : "medium",
    difficulty: difficultyFor(id, input.broad),
    expectedOutput: outputFor(id),
    verificationCriteria: criteriaFor(id),
    complexity: scale(complexityFor(id, input.broad), input.mode),
  };
}

function difficultyFor(id: string, broad: boolean): TaskDifficulty {
  if (id === "database") return "high";
  if (id === "backend") return broad ? "high" : "medium";
  if (id === "frontend") return broad ? "medium" : "low";
  return "medium";
}

function complexityFor(id: string, broad: boolean): Complexity {
  if (id === "database" || id === "backend") return broad ? 4 : 3;
  if (id === "frontend") return broad ? 3 : 2;
  return 3;
}

function outputFor(id: string): string {
  if (id === "database") return "A schema or migration plan for the new or changed records. The migration is not applied by this planner.";
  if (id === "backend") return "The endpoint contracts, including inputs, outputs, and failure cases. No server code is edited here.";
  if (id === "frontend") return "The screens or components to add or change, including the empty and error states.";
  return "A description of the code change a later phase would make. This planner does not edit files.";
}

function criteriaFor(id: string): string {
  if (id === "database") return "The data plan names the records the objective needs and does not include an unrelated table.";
  if (id === "backend") return "Each requested endpoint has an input, a success result, and one failure case.";
  if (id === "frontend") return "The interface description matches the objective and includes what the person sees when the request fails.";
  return "The change description can be checked against the objective without reading unrelated code.";
}

function scale(base: number, mode: OptimizationMode): Complexity {
  const delta = mode === "savings" ? -1 : mode === "quality" ? 1 : 0;
  const value = Math.min(5, Math.max(1, base + delta));
  return value as Complexity;
}

function repositorySentence(repository: RepositoryContext | null): string {
  if (!repository) {
    return "No repository is attached, so this step records assumptions instead of reading files.";
  }
  const visibility = repository.private ? "private" : "public";
  const description = repository.description?.trim() ? ` Description: ${clip(repository.description, 200)}.` : "";
  return `Inspect metadata for ${visibility} repository ${repository.fullName} on ${repository.defaultBranch}.${description} Do not load the repository tree.`;
}

function contextFor(taskId: string, repository: RepositoryContext | null): ContextRequest[] {
  const pathHints = PATH_HINTS[taskId];
  if (!pathHints) return [];
  return [
    {
      taskId,
      repositoryFullName: repository?.fullName ?? null,
      defaultBranch: repository?.defaultBranch ?? null,
      reason: repository
        ? `Later, open only these paths in ${repository.fullName}@${repository.defaultBranch} for ${taskId}.`
        : `Later, open only these paths for ${taskId}. No repository is attached yet.`,
      pathHints,
    },
  ];
}

const PATH_HINTS: Record<string, string[]> = {
  "repository-analysis": ["README.md", "package.json"],
  planning: ["README.md"],
  architecture: ["README.md", "package.json"],
  database: ["prisma/schema.prisma", "prisma/migrations"],
  backend: ["src/app/api", "src/server"],
  frontend: ["src/app", "src/components"],
  change: ["src"],
  refactor: ["src"],
  debug: ["src"],
  tests: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  documentation: ["README.md"],
  "security-review": ["src/server", "src/app"],
  "final-verification": ["README.md"],
};

function summarize(mode: OptimizationMode, budgetUsd: string, taskCount: number, requestCount: number): string {
  const label = mode === "savings" ? "Savings" : mode === "quality" ? "Quality" : "Balanced";
  const zero = budgetUsd === "0" || budgetUsd === "0.0" || budgetUsd === "0.00";
  const budgetNote = zero
    ? ` The budget is ${money(budgetUsd)}, so a later phase should not run this plan until the limit is raised.`
    : ` Budget ${money(budgetUsd)} is recorded and is not spent.`;
  return `${label} plan with ${taskCount} tasks.${budgetNote} ${requestCount} context requests name paths a later step may open. No model is selected, no files are changed, and no pull request is opened.`;
}

function money(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  return `$${whole}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

function clip(value: string, max: number): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 3).trimEnd()}...`;
}
