import { describe, expect, it, vi } from "vitest";
import { createGithubApi, nextGithubLink, parseRepository } from "@/lib/github/api";

const token = "gho_listtokenvalue1234567890";

function jsonResponse(body: unknown, status = 200, link: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: link ? { link } : undefined,
  });
}

describe("GitHub API", () => {
  it("drops repositories that are not https://github.com and keeps owner, branch, and permissions", () => {
    expect(
      parseRepository({
        id: 42,
        name: "myapp",
        private: true,
        default_branch: "main",
        html_url: "https://github.com/mycompany/myapp",
        description: "Billing export",
        owner: { login: "mycompany" },
        permissions: { admin: false, push: true, pull: true },
      }),
    ).toMatchObject({
      githubRepoId: "42",
      ownerLogin: "mycompany",
      name: "myapp",
      fullName: "mycompany/myapp",
      defaultBranch: "main",
      private: true,
      permissions: { push: true, pull: true, admin: false },
    });
    expect(
      parseRepository({
        id: 7,
        name: "evil",
        private: false,
        html_url: "https://evil.example/mycompany/evil",
        owner: { login: "mycompany" },
      }),
    ).toBeNull();
    expect(
      parseRepository({
        id: 8,
        name: "myapp",
        private: false,
        html_url: "https://user:secret@github.com/attacker/phish",
        owner: { login: "mycompany" },
      }),
    ).toBeNull();
    expect(
      parseRepository({
        id: 9,
        name: "myapp",
        private: false,
        html_url: "https://user:secret@github.com/mycompany/myapp?next=/evil",
        owner: { login: "mycompany" },
      })?.htmlUrl,
    ).toBe("https://github.com/mycompany/myapp");
  });

  it("ignores next links that leave api.github.com", () => {
    expect(nextGithubLink('<https://evil.example/repos>; rel="next"')).toBeNull();
    expect(nextGithubLink('<https://api.github.com/user/repos?page=2>; rel="next"')).toBe(
      "https://api.github.com/user/repos?page=2",
    );
  });

  it("exchanges a code without putting the client secret on the request URL", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe("https://github.com/login/oauth/access_token");
      expect(String(init && "body" in init ? init.body : "")).toContain("super-secret-client");
      return jsonResponse({ access_token: token, scope: "read:user,repo" });
    });
    const api = createGithubApi({
      clientId: "Iv1.client",
      clientSecret: "super-secret-client",
      redirectUri: "http://127.0.0.1:43123/api/github/callback",
      fetch: fetchImpl,
    });
    const result = await api.exchangeAuthorizationCode("authorization-code");
    expect(result).toEqual({ ok: true, accessToken: token, scopes: "read:user,repo" });
    expect(JSON.stringify(result)).toContain(token);
  });

  it("maps a rejected token exchange and a 401 repository list to authorization failures without the token", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("access_token")) {
        return jsonResponse({ error: "bad_verification_code", error_description: token });
      }
      return jsonResponse({ message: token }, 401);
    });
    const api = createGithubApi({
      clientId: "Iv1.client",
      clientSecret: "super-secret-client",
      redirectUri: "http://127.0.0.1:43123/api/github/callback",
      fetch: fetchImpl,
    });
    const exchanged = await api.exchangeAuthorizationCode("authorization-code");
    const listed = await api.listRepositories(token);
    expect(exchanged).toEqual({ ok: false, reason: "exchange_failed" });
    expect(listed).toEqual({ ok: false, reason: "authorization_failed" });
    expect(JSON.stringify(exchanged)).not.toContain(token);
    expect(JSON.stringify(listed)).not.toContain(token);
    expect(JSON.stringify(listed)).not.toContain("super-secret-client");
  });

  it("treats a rate-limited repository list as unreachable instead of a rejected token", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
        status: 403,
        headers: { "x-ratelimit-remaining": "0" },
      }),
    );
    const api = createGithubApi({
      clientId: "Iv1.client",
      clientSecret: "super-secret-client",
      redirectUri: "http://127.0.0.1:43123/api/github/callback",
      fetch: fetchImpl,
    });
    expect(await api.listRepositories(token)).toEqual({ ok: false, reason: "unavailable" });
    expect(JSON.stringify(await api.listRepositories(token))).not.toContain(token);
  });

  it("lists repositories for the authorized user", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe(`Bearer ${token}`);
      return jsonResponse([
        {
          id: 99,
          name: "myapp",
          private: false,
          default_branch: "main",
          html_url: "https://github.com/mycompany/myapp",
          owner: { login: "mycompany" },
          permissions: { pull: true },
        },
      ]);
    });
    const api = createGithubApi({
      clientId: "Iv1.client",
      clientSecret: "super-secret-client",
      redirectUri: "http://127.0.0.1:43123/api/github/callback",
      fetch: fetchImpl,
    });
    const listed = await api.listRepositories(token);
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.repositories).toHaveLength(1);
      expect(listed.repositories[0]?.fullName).toBe("mycompany/myapp");
      expect(JSON.stringify(listed.repositories)).not.toContain(token);
    }
  });
});
