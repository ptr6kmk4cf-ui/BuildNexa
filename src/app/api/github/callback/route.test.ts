import { afterEach, describe, expect, it, vi } from "vitest";
import { resetServerEnvCache } from "@/lib/env";

const jar = vi.hoisted(() => ({
  values: new Map<string, { value: string; httpOnly?: boolean }>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const entry = jar.values.get(name);
      return entry ? { name, value: entry.value } : undefined;
    },
    set: (name: string, value: string, options?: { httpOnly?: boolean }) => {
      jar.values.set(name, { value, httpOnly: options?.httpOnly });
    },
  }),
}));

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    connection: () => Promise.resolve(),
  };
});

describe("GitHub OAuth routes", () => {
  afterEach(() => {
    jar.values.clear();
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    delete process.env.GITHUB_CALLBACK_URL;
    delete process.env.APP_SECRET;
    delete process.env.TOKEN_ENCRYPTION_KEY;
    delete process.env.DATABASE_URL;
    resetServerEnvCache();
  });

  it("does not send an unconfigured OAuth error to an untrusted host", async () => {
    resetServerEnvCache();
    const { GET } = await import("../connect/route");
    const response = await GET(
      new Request("http://evil.example/api/github/connect", { headers: { host: "evil.example" } }),
    );
    const location = response.headers.get("location") ?? "";
    expect(location.startsWith("http://127.0.0.1:43123/github?error=not_configured")).toBe(true);
    expect(location).not.toContain("evil.example");
  });

  it("does not start OAuth when GitHub is not configured", async () => {
    resetServerEnvCache();
    const { GET } = await import("../connect/route");
    const response = await GET(new Request("http://127.0.0.1:43123/api/github/connect"));
    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/github?error=not_configured");
    expect(location).not.toContain("github.com/login");
  });

  it("sends the browser to GitHub without the client secret", async () => {
    process.env.GITHUB_CLIENT_ID = "Iv1.client";
    process.env.GITHUB_CLIENT_SECRET = "super-secret-client";
    process.env.APP_SECRET = "session-secret-session-secret-32";
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString("base64");
    resetServerEnvCache();
    const { GET } = await import("../connect/route");
    const response = await GET(new Request("http://127.0.0.1:43123/api/github/connect"));
    const location = response.headers.get("location") ?? "";
    expect(location.startsWith("https://github.com/login/oauth/authorize")).toBe(true);
    expect(location).toContain("client_id=Iv1.client");
    expect(location).not.toContain("super-secret-client");
    const stateCookie = jar.values.get("apo_github_oauth");
    expect(stateCookie?.httpOnly).toBe(true);
    expect(stateCookie?.value).not.toContain("super-secret-client");
  });

  it("records a cancelled authorization without calling GitHub", async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);
    process.env.GITHUB_CLIENT_ID = "Iv1.client";
    process.env.GITHUB_CLIENT_SECRET = "super-secret-client";
    process.env.APP_SECRET = "session-secret-session-secret-32";
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString("base64");
    resetServerEnvCache();
    const { GET } = await import("./route");
    const response = await GET(
      new Request("http://127.0.0.1:43123/api/github/callback?error=access_denied"),
    );
    expect(response.headers.get("location")).toContain("/github?error=access_denied");
    expect(fetchImpl).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
