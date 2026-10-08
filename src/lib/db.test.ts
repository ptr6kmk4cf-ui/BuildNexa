import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { disconnectDatabase, getPrisma, initializeDatabase } from "@/lib/db";
import { resetServerEnvCache } from "@/lib/env";

const REQUIRED_MODELS = [
  "User",
  "Project",
  "Repository",
  "Provider",
  "Model",
  "ProjectPlan",
  "Task",
  "TaskDependency",
  "TaskAttempt",
  "ExecutionRun",
  "TaskExecution",
  "ExecutionLog",
  "ModelDecision",
  "Verification",
  "VerificationCheck",
  "TokenUsage",
  "CostRecord",
  "Budget",
  "PullRequest",
  "AuditLog",
  "GithubAccount",
  "ConnectedRepository",
  "ProviderPreference",
];

afterEach(async () => {
  delete process.env.DATABASE_URL;
  resetServerEnvCache();
  await disconnectDatabase();
});

describe("database initialization", () => {
  it("defines the phase 1 models, relationships, and indexes", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const migration = readFileSync(
      "prisma/migrations/20261008140000_init/migration.sql",
      "utf8",
    );
    const githubMigration = readFileSync(
      "prisma/migrations/20261008180000_github_connection/migration.sql",
      "utf8",
    );
    const providerMigration = readFileSync(
      "prisma/migrations/20261008200000_provider_preferences/migration.sql",
      "utf8",
    );
    const planMigration = readFileSync(
      "prisma/migrations/20261008220000_project_plans/migration.sql",
      "utf8",
    );
    const routingMigration = readFileSync(
      "prisma/migrations/20261008230000_model_routing/migration.sql",
      "utf8",
    );
    const executionMigration = readFileSync(
      "prisma/migrations/20261008240000_task_execution/migration.sql",
      "utf8",
    );
    const executionHeartbeat = readFileSync(
      "prisma/migrations/20261008250000_execution_run_heartbeat/migration.sql",
      "utf8",
    );
    const verificationMigration = readFileSync(
      "prisma/migrations/20261008260000_verification_checks/migration.sql",
      "utf8",
    );
    const models = [...schema.matchAll(/^model (\w+)/gm)].map((match) => match[1]);
    expect(models).toEqual(REQUIRED_MODELS);
    for (const model of REQUIRED_MODELS) {
      if (model === "GithubAccount" || model === "ConnectedRepository") {
        expect(githubMigration).toContain(`CREATE TABLE "${model}"`);
      } else if (model === "ProviderPreference") {
        expect(providerMigration).toContain(`CREATE TABLE "${model}"`);
      } else if (model === "ProjectPlan") {
        expect(planMigration).toContain(`CREATE TABLE "${model}"`);
      } else if (model === "ExecutionRun" || model === "TaskExecution" || model === "ExecutionLog") {
        expect(executionMigration).toContain(`CREATE TABLE "${model}"`);
      } else if (model === "VerificationCheck") {
        expect(verificationMigration).toContain(`CREATE TABLE "${model}"`);
      } else {
        expect(migration).toContain(`CREATE TABLE "${model}"`);
      }
    }
    expect(githubMigration).toContain("tokenCiphertext");
    expect(githubMigration).not.toContain("accessToken");
    expect(schema).not.toContain("accessToken");
    expect(schema).not.toContain("apiKey");
    expect(providerMigration).toContain("ProviderPreference_userId_provider_key");
    expect(planMigration).toContain("Task_complexity_range");
    expect(planMigration).toContain("Task_planId_planKey_key");
    expect(routingMigration).toContain("ModelDecision_success_probability_range");
    expect(routingMigration).toContain("ALTER TABLE \"ModelDecision\" ALTER COLUMN \"modelId\" DROP NOT NULL");
    expect(schema).toContain("successProbability");
    expect(executionMigration).toContain("CREATE TYPE \"ExecutionState\"");
    expect(executionHeartbeat).toContain("ExecutionRun_one_running_per_project");
    expect(executionHeartbeat).toContain("heartbeatAt");
    expect(schema).toContain("heartbeatAt");
    expect(schema).toContain("ignoredCommand");
    const costMigration = readFileSync(
      "prisma/migrations/20261008270000_cost_budget/migration.sql",
      "utf8",
    );
    expect(verificationMigration).toContain("VerificationOutcome");
    expect(costMigration).toContain("CREATE TYPE \"CostKind\"");
    expect(costMigration).toContain("authorizeOverBudget");
    expect(schema).toContain("enum CostKind");
    expect(schema).toContain("authorizeOverBudget");
    expect(schema).toContain("enum VerificationOutcome");
    expect(schema).toContain("enum ExecutionState");
    expect(schema).toContain("enum OptimizationMode");
    expect(schema).toContain("enum TaskType");
    expect(schema).toContain("@@unique([userId, githubRepoId])");
    expect(schema).toContain("@@unique([taskId, dependsOnTaskId])");
    expect(schema).toContain("@@unique([userId, slug])");
    expect(schema).toContain("@@index([projectId, createdAt])");
    expect(schema).toContain("@@index([entityType, entityId])");
  });

  it("does not construct a client when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    resetServerEnvCache();
    expect(getPrisma()).toBeNull();
    await expect(initializeDatabase()).resolves.toEqual({
      configured: false,
      connected: false,
    });
  });

  it("reports a configured database that cannot be reached", async () => {
    process.env.DATABASE_URL = "postgresql://optimizer:optimizer@127.0.0.1:1/ai_project_optimizer?connect_timeout=1";
    resetServerEnvCache();
    expect(getPrisma()).not.toBeNull();
    const status = await initializeDatabase();
    expect(status).toEqual({ configured: true, connected: false });
  });
});
