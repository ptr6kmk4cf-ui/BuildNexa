import { APP_PHASE } from "@/lib/constants";
import { initializeDatabase, type DatabaseInitResult } from "@/lib/db";

export type DatabaseCheck = "ok" | "unconfigured" | "unavailable";

export type HealthReport = {
  status: "ok" | "degraded";
  service: "ai-project-optimizer";
  phase: typeof APP_PHASE;
  checks: {
    app: "ok";
    database: DatabaseCheck;
  };
  timestamp: string;
};

export function databaseCheck(result: DatabaseInitResult): DatabaseCheck {
  if (!result.configured) return "unconfigured";
  return result.connected ? "ok" : "unavailable";
}

export async function buildHealthReport(now = new Date()): Promise<HealthReport> {
  const database = databaseCheck(await initializeDatabase());
  return {
    status: database === "unavailable" ? "degraded" : "ok",
    service: "ai-project-optimizer",
    phase: APP_PHASE,
    checks: {
      app: "ok",
      database,
    },
    timestamp: now.toISOString(),
  };
}

export function healthHttpStatus(report: HealthReport): number {
  return report.checks.database === "unavailable" ? 503 : 200;
}
