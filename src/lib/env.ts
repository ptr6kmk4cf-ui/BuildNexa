import { z } from "zod";
import { EnvValidationError } from "@/lib/errors";

const postgresUrl = /^postgres(?:ql)?:\/\/\S+$/i;

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.preprocess((value) => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }, z.string().regex(postgresUrl, "DATABASE_URL must be a PostgreSQL connection string.").optional()),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function resetServerEnvCache(): void {
  cached = undefined;
}

function environmentIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".") || "environment";
    if (path === "DATABASE_URL") {
      return { path, message: "DATABASE_URL must be a PostgreSQL connection string." };
    }
    if (path === "LOG_LEVEL") {
      return { path, message: "LOG_LEVEL must be debug, info, warn, or error." };
    }
    if (path === "NODE_ENV") {
      return { path, message: "NODE_ENV must be development, test, or production." };
    }
    return { path, message: "Invalid environment value." };
  });
}

export function parseServerEnv(source: {
  NODE_ENV?: string | undefined;
  DATABASE_URL?: string | undefined;
  LOG_LEVEL?: string | undefined;
}): ServerEnv {
  const parsed = serverEnvSchema.safeParse({
    NODE_ENV: source.NODE_ENV,
    DATABASE_URL: source.DATABASE_URL,
    LOG_LEVEL: source.LOG_LEVEL,
  });
  if (!parsed.success) {
    throw new EnvValidationError(environmentIssues(parsed.error));
  }
  return parsed.data;
}

export function getServerEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("Server environment cannot be read in the browser.");
  }
  cached ??= parseServerEnv(process.env);
  return cached;
}
