import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/security/rate-limit";
import { anonymousMayUseLocalOperator, canAccessProject, viewerFromSession } from "@/lib/security/viewer";
import { isAllowedVerificationCommand } from "@/lib/verification/detect";
import { verificationEnv } from "@/lib/verification/runner";

describe("viewer isolation", () => {
  it("uses the session account when one is present", () => {
    expect(viewerFromSession({
      nodeEnv: "production",
      sessionUserId: "github-user",
      localOperatorId: "local-operator",
    })).toBe("github-user");
  });

  it("does not fall back to the local operator in production", () => {
    expect(viewerFromSession({
      nodeEnv: "production",
      sessionUserId: null,
      localOperatorId: "local-operator",
    })).toBeNull();
    expect(anonymousMayUseLocalOperator("production")).toBe(false);
  });

  it("uses the local operator outside production only when that user exists", () => {
    expect(viewerFromSession({
      nodeEnv: "development",
      sessionUserId: null,
      localOperatorId: "local-operator",
    })).toBe("local-operator");
    expect(viewerFromSession({
      nodeEnv: "test",
      sessionUserId: null,
      localOperatorId: null,
    })).toBeNull();
    expect(anonymousMayUseLocalOperator("test")).toBe(true);
  });

  it("allows a project only when the viewer is that project's owner", () => {
    expect(canAccessProject("user-a", "user-a")).toBe(true);
    expect(canAccessProject("user-a", "user-b")).toBe(false);
    expect(canAccessProject(null, "user-a")).toBe(false);
  });
});

describe("request limits", () => {
  it("limits one key inside the window and allows another key", () => {
    const limiter = createRateLimiter(2, 1_000);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 500)).toBe(true);
    expect(limiter.allow("a", 500)).toBe(false);
    expect(limiter.allow("b", 500)).toBe(true);
  });

  it("allows the same key again after the window expires", () => {
    const limiter = createRateLimiter(2, 1_000);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("a", 500)).toBe(true);
    expect(limiter.allow("a", 1_501)).toBe(true);
  });
});

describe("command and process restrictions", () => {
  it("allows only the project check commands", () => {
    expect(isAllowedVerificationCommand("npm", ["test"])).toBe(true);
    expect(isAllowedVerificationCommand("npm", ["run", "lint"])).toBe(true);
    expect(isAllowedVerificationCommand("bash", ["-c", "npm test"])).toBe(false);
    expect(isAllowedVerificationCommand("npm", ["test", "--", "rm", "-rf", "/"])).toBe(false);
    expect(isAllowedVerificationCommand("npm", ["exec", "sh"])).toBe(false);
  });

  it("does not pass credentials into a check process", () => {
    const env = verificationEnv({
      NODE_ENV: "test",
      PATH: "/usr/bin",
      OPENAI_API_KEY: "sk-secret",
      GITHUB_CLIENT_SECRET: "oauth-secret",
      TOKEN_ENCRYPTION_KEY: "encryption-key",
      DATABASE_URL: "postgresql://optimizer:optimizer@127.0.0.1:5432/ai_project_optimizer",
      APP_SECRET: "session-secret",
      LOG_LEVEL: "error",
    });
    expect(env.PATH).toBe("/usr/bin");
    expect(env.LOG_LEVEL).toBe("error");
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.GITHUB_CLIENT_SECRET).toBeUndefined();
    expect(env.TOKEN_ENCRYPTION_KEY).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.APP_SECRET).toBeUndefined();
    expect(JSON.stringify(env)).not.toMatch(/sk-secret|oauth-secret|encryption-key|optimizer:optimizer|session-secret/);
  });
});
