import { afterEach, describe, expect, it, vi } from "vitest";
import { disconnectDatabase } from "@/lib/db";
import { resetServerEnvCache } from "@/lib/env";
import { buildHealthReport, healthHttpStatus } from "@/lib/health";

vi.mock("next/server", () => ({
  connection: () => Promise.resolve(),
}));

vi.mock("next/navigation", () => ({
  unstable_rethrow: () => {},
}));

afterEach(async () => {
  delete process.env.DATABASE_URL;
  process.env.LOG_LEVEL = "error";
  resetServerEnvCache();
  await disconnectDatabase();
});

describe("health API", () => {
  it("reports an ok app when the database is not configured", async () => {
    delete process.env.DATABASE_URL;
    resetServerEnvCache();
    const now = new Date("2026-10-08T12:00:00.000Z");
    const report = await buildHealthReport(now);
    expect(healthHttpStatus(report)).toBe(200);
    expect(report).toMatchObject({
      status: "ok",
      service: "ai-project-optimizer",
      phase: 1,
      checks: { app: "ok", database: "unconfigured" },
      timestamp: "2026-10-08T12:00:00.000Z",
    });
  });

  it("serves the health route", async () => {
    delete process.env.DATABASE_URL;
    resetServerEnvCache();
    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as {
      service: string;
      checks: { app: string; database: string };
    };
    expect(body.service).toBe("ai-project-optimizer");
    expect(body.checks.app).toBe("ok");
    expect(body.checks.database).toBe("unconfigured");
  });
});
