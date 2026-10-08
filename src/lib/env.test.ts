import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvValidationError } from "@/lib/errors";
import { getServerEnv, parseServerEnv, resetServerEnvCache } from "@/lib/env";

afterEach(() => {
  resetServerEnvCache();
  vi.unstubAllGlobals();
});

describe("environment validation", () => {
  it("treats a missing database URL as local mode", () => {
    const env = parseServerEnv({ NODE_ENV: "test" });
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.NODE_ENV).toBe("test");
  });

  it("treats a blank database URL as unset", () => {
    const env = parseServerEnv({ DATABASE_URL: "   ", NODE_ENV: "test" });
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it("accepts a PostgreSQL URL", () => {
    const env = parseServerEnv({
      DATABASE_URL: "postgresql://optimizer:optimizer@127.0.0.1:5432/ai_project_optimizer",
      LOG_LEVEL: "debug",
      NODE_ENV: "development",
    });
    expect(env.DATABASE_URL).toContain("postgresql://");
    expect(env.LOG_LEVEL).toBe("debug");
  });

  it("rejects a non-PostgreSQL URL without echoing the secret", () => {
    expect(() =>
      parseServerEnv({
        DATABASE_URL: "mysql://user:supersecret@localhost:3306/app",
        NODE_ENV: "test",
      }),
    ).toThrow(EnvValidationError);

    try {
      parseServerEnv({
        DATABASE_URL: "mysql://user:supersecret@localhost:3306/app",
        NODE_ENV: "test",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect(JSON.stringify(error)).not.toContain("supersecret");
    }
  });

  it("rejects an unknown log level", () => {
    expect(() => parseServerEnv({ LOG_LEVEL: "verbose", NODE_ENV: "test" })).toThrow(EnvValidationError);
  });

  it("refuses to read server environment in the browser", () => {
    vi.stubGlobal("window", {});
    resetServerEnvCache();
    expect(() => getServerEnv()).toThrow(/browser/);
  });

  it("keeps the example env local and free of cloud secrets", () => {
    const example = readFileSync(".env.example", "utf8");
    const gitignore = readFileSync(".gitignore", "utf8");
    expect(example).toMatch(/127\.0\.0\.1/);
    expect(example).toContain("DATABASE_URL");
    expect(example).not.toMatch(/sk-|ghp_|AKIA|xoxb-/);
    expect(gitignore).toMatch(/\.env\*/);
    expect(gitignore).toContain("!.env.example");
  });
});
