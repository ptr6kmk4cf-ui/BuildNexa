import { z } from "zod";
import { withTimeout } from "@/lib/async";
import { isGithubWebUrl, readPermissions } from "@/lib/github/permissions";
import type { GithubRepository, GithubViewer } from "@/lib/github/types";

const API_ROOT = "https://api.github.com";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_AGENT = "ai-project-optimizer";
const githubName = z.string().regex(/^[A-Za-z0-9_.-]+$/).max(100);

const viewerSchema = z.object({
  id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
  login: githubName,
  type: z.string().min(1).max(40).optional(),
  name: z.string().max(200).nullable().optional(),
  avatar_url: z.string().max(500).nullable().optional(),
});

const repositorySchema = z.object({
  id: z.number().int().positive(),
  name: githubName,
  private: z.boolean(),
  default_branch: z.string().regex(/^[A-Za-z0-9._/-]+$/).max(255).nullable().optional(),
  html_url: z.string().max(500),
  description: z.string().max(2000).nullable().optional(),
  owner: z.object({
    login: githubName,
  }),
  permissions: z
    .object({
      admin: z.boolean().optional(),
      maintain: z.boolean().optional(),
      push: z.boolean().optional(),
      triage: z.boolean().optional(),
      pull: z.boolean().optional(),
    })
    .optional(),
});

export type GithubApi = {
  exchangeAuthorizationCode(
    code: string,
  ): Promise<{ ok: true; accessToken: string; scopes: string } | { ok: false; reason: "exchange_failed" | "authorization_failed" }>;
  getViewer(
    accessToken: string,
  ): Promise<{ ok: true; viewer: GithubViewer } | { ok: false; reason: "authorization_failed" | "profile_failed" | "unavailable" }>;
  listRepositories(
    accessToken: string,
  ): Promise<{ ok: true; repositories: GithubRepository[] } | { ok: false; reason: "authorization_failed" | "unavailable" }>;
};

export function createGithubApi(options: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetch?: typeof fetch;
}): GithubApi {
  const fetchImpl = options.fetch ?? fetch;

  return {
    async exchangeAuthorizationCode(code) {
      try {
        const response = await withTimeout(
          fetchImpl(TOKEN_URL, {
            method: "POST",
            headers: {
              accept: "application/json",
              "content-type": "application/json",
              "user-agent": USER_AGENT,
            },
            body: JSON.stringify({
              client_id: options.clientId,
              client_secret: options.clientSecret,
              code,
              redirect_uri: options.redirectUri,
            }),
            signal: AbortSignal.timeout(8000),
          }),
          9000,
        );
        if (response.status === 401 || response.status === 403) {
          return { ok: false, reason: "authorization_failed" };
        }
        if (!response.ok) return { ok: false, reason: "exchange_failed" };
        const payload: unknown = await response.json();
        const parsed = z
          .object({
            access_token: z.string().min(1).optional(),
            scope: z.string().optional(),
            error: z.string().optional(),
          })
          .safeParse(payload);
        if (!parsed.success || parsed.data.error || !parsed.data.access_token) {
          return { ok: false, reason: "exchange_failed" };
        }
        return {
          ok: true,
          accessToken: parsed.data.access_token,
          scopes: parsed.data.scope ?? "",
        };
      } catch {
        return { ok: false, reason: "exchange_failed" };
      }
    },

    async getViewer(accessToken) {
      const response = await githubRequest(fetchImpl, `${API_ROOT}/user`, accessToken);
      if (!response.ok) return response;
      const parsed = viewerSchema.safeParse(response.body);
      if (!parsed.success) return { ok: false, reason: "profile_failed" };
      return {
        ok: true,
        viewer: {
          id: String(parsed.data.id),
          login: parsed.data.login,
          accountType: parsed.data.type ?? "User",
          name: parsed.data.name ?? null,
          avatarUrl: parsed.data.avatar_url ?? null,
        },
      };
    },

    async listRepositories(accessToken) {
      const repositories: GithubRepository[] = [];
      let nextUrl: string | null =
        `${API_ROOT}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`;

      for (let page = 0; page < 3 && nextUrl; page += 1) {
        const response = await githubRequest(fetchImpl, nextUrl, accessToken);
        if (!response.ok) return response;
        if (!Array.isArray(response.body)) return { ok: false, reason: "unavailable" };
        for (const entry of response.body) {
          const repository = parseRepository(entry);
          if (repository) repositories.push(repository);
          if (repositories.length >= 300) return { ok: true, repositories };
        }
        nextUrl = nextGithubLink(response.link);
      }

      return { ok: true, repositories };
    },
  };
}

type GithubRequestResult =
  | { ok: true; body: unknown; link: string | null }
  | { ok: false; reason: "authorization_failed" | "unavailable" };

async function githubRequest(
  fetchImpl: typeof fetch,
  url: string,
  accessToken: string,
): Promise<GithubRequestResult> {
  if (!url.startsWith(`${API_ROOT}/`)) return { ok: false, reason: "unavailable" };
  try {
    const response = await withTimeout(
      fetchImpl(url, {
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": USER_AGENT,
          "x-github-api-version": "2022-11-28",
          authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(8000),
      }),
      9000,
    );
    if (response.status === 401) return { ok: false, reason: "authorization_failed" };
    if (response.status === 403) {
      const rateLimited = response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after");
      return { ok: false, reason: rateLimited ? "unavailable" : "authorization_failed" };
    }
    if (!response.ok) return { ok: false, reason: "unavailable" };
    const body: unknown = await response.json();
    return { ok: true, body, link: response.headers.get("link") };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export function parseRepository(entry: unknown): GithubRepository | null {
  const parsed = repositorySchema.safeParse(entry);
  if (!parsed.success || !isGithubWebUrl(parsed.data.html_url)) return null;
  const ownerLogin = parsed.data.owner.login;
  const htmlUrl = canonicalGithubRepoUrl(parsed.data.html_url, ownerLogin, parsed.data.name);
  if (!htmlUrl) return null;
  return {
    githubRepoId: String(parsed.data.id),
    ownerLogin,
    name: parsed.data.name,
    fullName: `${ownerLogin}/${parsed.data.name}`,
    defaultBranch: parsed.data.default_branch ?? "main",
    htmlUrl,
    private: parsed.data.private,
    description: parsed.data.description?.trim() || null,
    permissions: readPermissions(parsed.data.permissions, true),
  };
}

function canonicalGithubRepoUrl(value: string, ownerLogin: string, name: string): string | null {
  const url = new URL(value);
  const path = url.pathname.replace(/\/+$/, "");
  if (path !== `/${ownerLogin}/${name}`) return null;
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function nextGithubLink(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    const candidate = match?.[1];
    if (!candidate || !candidate.startsWith(`${API_ROOT}/`)) continue;
    return candidate;
  }
  return null;
}
