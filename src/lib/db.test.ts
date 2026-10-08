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
  "Task",
  "TaskDependency",
  "TaskAttempt",
  "ModelDecision",
  "Verification",
  "TokenUsage",
  "CostRecord",
  "Budget",
  "PullRequest",
  "AuditLog",
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
    const models = [...schema.matchAll(/^model (\w+)/gm)].map((match) => match[1]);
    expect(models).toEqual(REQUIRED_MODELS);
    for (const model of REQUIRED_MODELS) {
      expect(migration).toContain(`CREATE TABLE "${model}"`);
    }
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
