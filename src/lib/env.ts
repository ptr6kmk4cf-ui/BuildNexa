import { z } from "zod";
import { EnvValidationError } from "@/lib/errors";

const postgresUrl = /^postgres(?:ql)?:\/\/\S+$/i;

const optionalEnvString = z.preprocess((value) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}, z.string().optional());

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.preprocess((value) => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }, z.string().regex(postgresUrl, "DATABASE_URL must be a PostgreSQL connection string.").optional()),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  GITHUB_CLIENT_ID: optionalEnvString,
  GITHUB_CLIENT_SECRET: optionalEnvString,
  GITHUB_CALLBACK_URL: optionalEnvString,
  APP_SECRET: optionalEnvString,
  TOKEN_ENCRYPTION_KEY: optionalEnvString,
  OPENAI_API_KEY: optionalEnvString,
  ANTHROPIC_API_KEY: optionalEnvString,
  GEMINI_API_KEY: optionalEnvString,
  MISTRAL_API_KEY: optionalEnvString,
  GROQ_API_KEY: optionalEnvString,
  DEEPSEEK_API_KEY: optionalEnvString,
  XAI_API_KEY: optionalEnvString,
  MODEL_PRICING: optionalEnvString,
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
  GITHUB_CLIENT_ID?: string | undefined;
  GITHUB_CLIENT_SECRET?: string | undefined;
  GITHUB_CALLBACK_URL?: string | undefined;
  APP_SECRET?: string | undefined;
  TOKEN_ENCRYPTION_KEY?: string | undefined;
  OPENAI_API_KEY?: string | undefined;
  ANTHROPIC_API_KEY?: string | undefined;
  GEMINI_API_KEY?: string | undefined;
  MISTRAL_API_KEY?: string | undefined;
  GROQ_API_KEY?: string | undefined;
  DEEPSEEK_API_KEY?: string | undefined;
  XAI_API_KEY?: string | undefined;
  MODEL_PRICING?: string | undefined;
}): ServerEnv {
  const parsed = serverEnvSchema.safeParse({
    NODE_ENV: source.NODE_ENV,
    DATABASE_URL: source.DATABASE_URL,
    LOG_LEVEL: source.LOG_LEVEL,
    GITHUB_CLIENT_ID: source.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: source.GITHUB_CLIENT_SECRET,
    GITHUB_CALLBACK_URL: source.GITHUB_CALLBACK_URL,
    APP_SECRET: source.APP_SECRET,
    TOKEN_ENCRYPTION_KEY: source.TOKEN_ENCRYPTION_KEY,
    OPENAI_API_KEY: source.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: source.ANTHROPIC_API_KEY,
    GEMINI_API_KEY: source.GEMINI_API_KEY,
    MISTRAL_API_KEY: source.MISTRAL_API_KEY,
    GROQ_API_KEY: source.GROQ_API_KEY,
    DEEPSEEK_API_KEY: source.DEEPSEEK_API_KEY,
    XAI_API_KEY: source.XAI_API_KEY,
    MODEL_PRICING: source.MODEL_PRICING,
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
