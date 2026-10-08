import "server-only";
import { cookies } from "next/headers";
import { getPrisma } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  beginAuthorization,
  clearGithubCookies,
  disconnectAccount,
  finishAuthorization,
  listRepositoriesForUser,
  publicAccountForUser,
  readSessionUserId,
  refreshRepositories,
  selectRepository,
} from "@/lib/github/access";
import { createGithubApi } from "@/lib/github/api";
import { readGithubConfig, type GithubConfigResult } from "@/lib/github/config";
import { OAUTH_STATE_COOKIE, type CookieJar, type CookieOptions } from "@/lib/github/cookies";
import type { PublicGithubAccount } from "@/lib/github/types";
import type { ConnectedRepositoryRecord } from "@/lib/github/types";
import { githubConnectLimiter } from "@/lib/security/limits";
import { createPrismaGithubStore } from "@/server/github-store";

export type GithubPageData = {
  setup: GithubConfigResult;
  databaseConfigured: boolean;
  account: PublicGithubAccount | null;
  repositories: ConnectedRepositoryRecord[];
};

export async function startGithubConnection(): Promise<
  { type: "redirect"; url: string } | { type: "error"; error: "not_configured" | "incomplete" | "rate_limited" }
> {
  const setup = readGithubConfig(getServerEnv());
  if (setup.status !== "ready") {
    return { type: "error", error: setup.status === "disabled" ? "not_configured" : "incomplete" };
  }
  if (!githubConnectLimiter.allow("github-connect")) {
    return { type: "error", error: "rate_limited" };
  }
  const url = beginAuthorization({
    config: setup.config,
    jar: await nextCookieJar(),
    now: new Date(),
    secure: secureCookies(),
  });
  return { type: "redirect", url };
}

export async function completeGithubConnection(query: URLSearchParams): Promise<string> {
  const setup = readGithubConfig(getServerEnv());
  if (setup.status !== "ready") return setup.status === "disabled" ? "not_configured" : "incomplete";
  const oauthError = query.get("error");
  if (oauthError) {
    (await nextCookieJar()).delete(OAUTH_STATE_COOKIE);
    return oauthError === "access_denied" ? "access_denied" : "exchange_failed";
  }
  const prisma = getPrisma();
  if (!prisma) return "database";

  const result = await finishAuthorization({
    query: {
      code: query.get("code") ?? undefined,
      state: query.get("state") ?? undefined,
      error: query.get("error") ?? undefined,
      installationId: query.get("installation_id") ?? undefined,
    },
    config: setup.config,
    jar: await nextCookieJar(),
    api: githubApi(setup.config),
    store: createPrismaGithubStore(prisma),
    now: new Date(),
    secure: secureCookies(),
  });

  if (!result.ok) return result.error;
  if (!result.repositoriesLoaded) {
    logger.warn("GitHub account connected but repository list was not saved");
  }
  logger.info("GitHub account connected", { login: result.login });
  return "ok";
}

export async function currentGithubUserId(): Promise<string | null> {
  const setup = readGithubConfig(getServerEnv());
  if (setup.status !== "ready") return null;
  return readSessionUserId(await nextCookieJar(), setup.config.appSecret, new Date());
}

export async function loadGithubPage(): Promise<GithubPageData> {
  const setup = readGithubConfig(getServerEnv());
  const prisma = getPrisma();
  if (setup.status !== "ready" || !prisma) {
    return { setup, databaseConfigured: Boolean(prisma), account: null, repositories: [] };
  }
  const userId = await currentGithubUserId();
  if (!userId) {
    return { setup, databaseConfigured: true, account: null, repositories: [] };
  }
  const store = createPrismaGithubStore(prisma);
  const [account, repositories] = await Promise.all([
    publicAccountForUser(store, userId),
    listRepositoriesForUser(store, userId),
  ]);
  return { setup, databaseConfigured: true, account, repositories };
}

export async function listRepositoryOptions(): Promise<
  Array<{ id: string; fullName: string; defaultBranch: string; private: boolean; githubRepoId: string }>
> {
  const page = await loadGithubPage();
  return page.repositories.map((repository) => ({
    id: repository.id,
    fullName: repository.fullName,
    defaultBranch: repository.defaultBranch,
    private: repository.private,
    githubRepoId: repository.githubRepoId,
  }));
}

export async function repositoryDetailForCurrentUser(
  repositoryId: string,
): Promise<{ account: PublicGithubAccount; repository: ConnectedRepositoryRecord } | null> {
  const setup = readGithubConfig(getServerEnv());
  const prisma = getPrisma();
  const userId = await currentGithubUserId();
  if (setup.status !== "ready" || !prisma || !userId) return null;
  const store = createPrismaGithubStore(prisma);
  const [account, repository] = await Promise.all([
    publicAccountForUser(store, userId),
    selectRepository(store, userId, repositoryId),
  ]);
  if (!account || !repository) return null;
  return { account, repository };
}

export async function selectCurrentUsersRepository(repositoryId: string) {
  const prisma = getPrisma();
  const userId = await currentGithubUserId();
  if (!prisma) return { ok: false as const, message: "Connect PostgreSQL before attaching a repository." };
  if (!userId) return { ok: false as const, message: "Connect GitHub before choosing a repository." };
  const repository = await selectRepository(createPrismaGithubStore(prisma), userId, repositoryId);
  if (!repository) {
    return { ok: false as const, message: "That repository is not on the GitHub account connected to this session." };
  }
  return { ok: true as const, userId, repository };
}

export async function refreshCurrentRepositories(): Promise<{ ok: true } | { ok: false; error: string }> {
  const setup = readGithubConfig(getServerEnv());
  if (setup.status !== "ready") return { ok: false, error: setup.status === "disabled" ? "not_configured" : "incomplete" };
  const prisma = getPrisma();
  if (!prisma) return { ok: false, error: "database" };
  const userId = await currentGithubUserId();
  if (!userId) return { ok: false, error: "not_connected" };
  const result = await refreshRepositories({
    userId,
    config: setup.config,
    api: githubApi(setup.config),
    store: createPrismaGithubStore(prisma),
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export async function disconnectCurrentGithub(): Promise<void> {
  const jar = await nextCookieJar();
  const setup = readGithubConfig(getServerEnv());
  const prisma = getPrisma();
  const userId =
    setup.status === "ready" ? readSessionUserId(jar, setup.config.appSecret, new Date()) : null;
  if (prisma && userId) {
    await disconnectAccount(createPrismaGithubStore(prisma), jar, userId);
    logger.info("GitHub account disconnected");
    return;
  }
  clearGithubCookies(jar);
}

function githubApi(config: { clientId: string; clientSecret: string; callbackUrl: string }) {
  return createGithubApi({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.callbackUrl,
  });
}

export function appOrigin(request: Request): string {
  const setup = readGithubConfig(getServerEnv());
  const fallback = setup.status === "ready" ? new URL(setup.config.callbackUrl).origin : "http://127.0.0.1:43123";
  const hostHeader = request.headers.get("host")?.trim().toLowerCase();
  const hostname = hostHeader ? hostnameFromHost(hostHeader) : null;
  const callback = setup.status === "ready" ? new URL(setup.config.callbackUrl) : null;
  const callbackHost = callback?.hostname.toLowerCase() ?? null;
  const localHost = hostname === "localhost" || hostname === "127.0.0.1";
  if (!hostHeader || !hostname || (!localHost && hostname !== callbackHost)) return fallback;

  const https =
    request.headers.get("x-forwarded-proto") === "https" ||
    (hostname === callbackHost && callback?.protocol === "https:");
  try {
    const origin = new URL(`${https ? "https" : "http"}://${hostHeader}`).origin;
    if (new URL(origin).hostname !== hostname) return fallback;
    return origin;
  } catch {
    return fallback;
  }
}

function hostnameFromHost(host: string): string | null {
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end > 1 ? host.slice(1, end) : null;
  }
  const name = host.split(":")[0];
  return name || null;
}

function secureCookies(): boolean {
  return getServerEnv().NODE_ENV === "production";
}

async function nextCookieJar(): Promise<CookieJar> {
  const store = await cookies();
  const secure = secureCookies();
  return {
    get(name) {
      return store.get(name)?.value;
    },
    set(name, value, options: CookieOptions) {
      store.set(name, value, options);
    },
    delete(name) {
      store.set(name, "", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure,
        maxAge: 0,
      });
    },
  };
}
