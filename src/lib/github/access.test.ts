import { afterEach, describe, expect, it } from "vitest";
import { openSecret } from "@/lib/crypto";
import { beginAuthorization, disconnectAccount, finishAuthorization, listRepositoriesForUser, refreshRepositories, selectRepository } from "@/lib/github/access";
import type { GithubApi } from "@/lib/github/api";
import type { GithubConfig } from "@/lib/github/config";
import { OAUTH_STATE_COOKIE, SESSION_COOKIE, type CookieJar, type CookieOptions } from "@/lib/github/cookies";
import { readGithubConfig } from "@/lib/github/config";
import type { GithubStore, SealedGithubAccount } from "@/lib/github/store";
import type { ConnectedRepositoryRecord, GithubRepository } from "@/lib/github/types";

const tokenA = "gho_usertokenaaaaaaaaaaaaaaaa";
const tokenB = "gho_usertokenbbbbbbbbbbbbbbbb";
const now = new Date("2026-10-08T12:00:00.000Z");

const config: GithubConfig = {
  clientId: "Iv1.client",
  clientSecret: "super-secret-client",
  callbackUrl: "http://127.0.0.1:43123/api/github/callback",
  appSecret: "session-secret-session-secret-32",
  encryptionKey: Buffer.alloc(32, 6),
};

function memoryJar(): CookieJar & { values: Map<string, { value: string; options: CookieOptions }> } {
  const values = new Map<string, { value: string; options: CookieOptions }>();
  return {
    values,
    get(name) {
      return values.get(name)?.value;
    },
    set(name, value, options) {
      values.set(name, { value, options });
    },
    delete(name) {
      values.delete(name);
    },
  };
}

function repository(owner: string, name: string): GithubRepository {
  return {
    githubRepoId: owner === "alpha" ? "101" : "202",
    ownerLogin: owner,
    name,
    fullName: `${owner}/${name}`,
    defaultBranch: "main",
    htmlUrl: `https://github.com/${owner}/${name}`,
    private: false,
    description: null,
    permissions: { admin: false, maintain: false, push: true, triage: false, pull: true },
  };
}

function memoryStore(): GithubStore & { accounts: SealedGithubAccount[] } {
  const accounts: SealedGithubAccount[] = [];
  const repositories: ConnectedRepositoryRecord[] = [];
  let sequence = 0;
  return {
    accounts,
    async findUserIdByGithubUserId(githubUserId) {
      return accounts.find((account) => account.githubUserId === githubUserId)?.userId ?? null;
    },
    async findLocalOperator() {
      return null;
    },
    async createUser() {
      sequence += 1;
      return `user-${sequence}`;
    },
    async saveAccount(input) {
      const existing = accounts.findIndex((account) => account.githubUserId === input.githubUserId);
      const saved: SealedGithubAccount = {
        userId: input.userId,
        githubUserId: input.githubUserId,
        login: input.login,
        accountType: input.accountType,
        avatarUrl: input.avatarUrl,
        installationId: input.installationId,
        scopes: input.scopes.split(/[\s,]+/).filter(Boolean),
        scopeText: input.scopes,
        sealed: input.sealed,
      };
      if (existing >= 0) accounts[existing] = saved;
      else accounts.push(saved);
    },
    async readSealedAccount(userId) {
      return accounts.find((account) => account.userId === userId) ?? null;
    },
    async listRepositories(userId) {
      return repositories.filter((repository) => repository.userId === userId);
    },
    async replaceRepositories(userId, incoming) {
      for (let index = repositories.length - 1; index >= 0; index -= 1) {
        if (repositories[index]?.userId === userId) repositories.splice(index, 1);
      }
      for (const repository of incoming) {
        sequence += 1;
        repositories.push({ ...repository, id: `repo-${sequence}`, userId });
      }
      return repositories.filter((repository) => repository.userId === userId);
    },
    async getRepository(userId, id) {
      return repositories.find((repository) => repository.userId === userId && repository.id === id) ?? null;
    },
    async disconnect(userId) {
      const before = accounts.length;
      for (let index = accounts.length - 1; index >= 0; index -= 1) {
        if (accounts[index]?.userId === userId) accounts.splice(index, 1);
      }
      for (let index = repositories.length - 1; index >= 0; index -= 1) {
        if (repositories[index]?.userId === userId) repositories.splice(index, 1);
      }
      return accounts.length !== before;
    },
  };
}

function apiFor(tokens: Record<string, GithubRepository[]>): GithubApi {
  return {
    async exchangeAuthorizationCode() {
      return { ok: true, accessToken: tokenA, scopes: "read:user repo" };
    },
    async getViewer() {
      return {
        ok: true,
        viewer: { id: "1001", login: "alpha", accountType: "User", name: "Alpha", avatarUrl: null },
      };
    },
    async listRepositories(accessToken) {
      const rows = tokens[accessToken];
      if (!rows) return { ok: false, reason: "authorization_failed" };
      return { ok: true, repositories: rows };
    },
  };
}

describe("GitHub authorization", () => {
  afterEach(() => {
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    delete process.env.APP_SECRET;
    delete process.env.TOKEN_ENCRYPTION_KEY;
  });

  it("stays disabled until OAuth credentials are set, and an incomplete setup does not echo secrets", () => {
    expect(readGithubConfig({}).status).toBe("disabled");
    const incomplete = readGithubConfig({ GITHUB_CLIENT_SECRET: "super-secret-client" });
    expect(incomplete.status).toBe("incomplete");
    expect(JSON.stringify(incomplete)).not.toContain("super-secret-client");
  });

  it("starts OAuth with a signed httpOnly state cookie and no client secret in the URL", () => {
    const jar = memoryJar();
    const url = new URL(beginAuthorization({ config, jar, now, secure: false }));
    expect(url.origin).toBe("https://github.com");
    expect(url.searchParams.get("client_id")).toBe("Iv1.client");
    expect(url.searchParams.get("scope")).toBe("read:user repo");
    expect(url.toString()).not.toContain("super-secret-client");
    expect(url.toString()).not.toContain(tokenA);
    const cookie = jar.values.get(OAUTH_STATE_COOKIE);
    expect(cookie?.options.httpOnly).toBe(true);
    expect(cookie?.value).not.toContain(url.searchParams.get("state") ?? "missing");
  });

  it("rejects a cancelled authorization and a forged state before calling GitHub", async () => {
    const store = memoryStore();
    let called = false;
    const api: GithubApi = {
      async exchangeAuthorizationCode() {
        called = true;
        return { ok: false, reason: "exchange_failed" };
      },
      async getViewer() {
        called = true;
        return { ok: false, reason: "profile_failed" };
      },
      async listRepositories() {
        called = true;
        return { ok: false, reason: "unavailable" };
      },
    };
    const denied = await finishAuthorization({
      query: { error: "access_denied" },
      config,
      jar: memoryJar(),
      api,
      store,
      now,
      secure: false,
    });
    expect(denied).toEqual({ ok: false, error: "access_denied" });

    const jar = memoryJar();
    beginAuthorization({ config, jar, now, secure: false });
    const forged = await finishAuthorization({
      query: { code: "authorization-code", state: "forged-state" },
      config,
      jar,
      api,
      store,
      now,
      secure: false,
    });
    expect(forged).toEqual({ ok: false, error: "invalid_state" });
    expect(called).toBe(false);
    expect(store.accounts).toHaveLength(0);
  });

  it("keeps a saved account connected when the repository refresh throws", async () => {
    const store = memoryStore();
    const jar = memoryJar();
    const url = new URL(beginAuthorization({ config, jar, now, secure: false }));
    const failingStore: GithubStore = {
      ...store,
      async replaceRepositories() {
        throw new Error("database unavailable");
      },
    };
    const connected = await finishAuthorization({
      query: { code: "authorization-code", state: url.searchParams.get("state") ?? "" },
      config,
      jar,
      api: apiFor({ [tokenA]: [repository("alpha", "myapp")] }),
      store: failingStore,
      now,
      secure: false,
    });
    expect(connected).toMatchObject({ ok: true, login: "alpha", repositoriesLoaded: false });
    expect(store.accounts).toHaveLength(1);
    expect(jar.values.has(SESSION_COOKIE)).toBe(true);
    expect(jar.values.has(OAUTH_STATE_COOKIE)).toBe(false);
  });

  it("reports an unreachable profile without storing a token", async () => {
    const store = memoryStore();
    const jar = memoryJar();
    const url = new URL(beginAuthorization({ config, jar, now, secure: false }));
    const api: GithubApi = {
      async exchangeAuthorizationCode() {
        return { ok: true, accessToken: tokenA, scopes: "read:user repo" };
      },
      async getViewer() {
        return { ok: false, reason: "unavailable" };
      },
      async listRepositories() {
        return { ok: false, reason: "unavailable" };
      },
    };
    const result = await finishAuthorization({
      query: { code: "authorization-code", state: url.searchParams.get("state") ?? "" },
      config,
      jar,
      api,
      store,
      now,
      secure: false,
    });
    expect(result).toEqual({ ok: false, error: "unavailable" });
    expect(store.accounts).toHaveLength(0);
    expect(jar.values.has(SESSION_COOKIE)).toBe(false);
  });

  it("stores an encrypted token, isolates repositories, and removes only that account on disconnect", async () => {
    const store = memoryStore();
    const jar = memoryJar();
    const url = new URL(beginAuthorization({ config, jar, now, secure: true }));
    const connected = await finishAuthorization({
      query: {
        code: "authorization-code",
        state: url.searchParams.get("state") ?? "",
        installationId: "445566",
      },
      config,
      jar,
      api: apiFor({ [tokenA]: [repository("alpha", "myapp")] }),
      store,
      now,
      secure: true,
    });
    expect(connected.ok).toBe(true);
    expect(store.accounts).toHaveLength(1);
    const saved = store.accounts[0];
    expect(saved).toBeDefined();
    if (!saved) return;
    expect(openSecret(saved.sealed, config.encryptionKey)).toBe(tokenA);
    expect(JSON.stringify({ ...saved, sealed: undefined })).not.toContain(tokenA);
    expect(jar.values.get(SESSION_COOKIE)?.options.httpOnly).toBe(true);
    expect(jar.values.get(SESSION_COOKIE)?.value).not.toContain(tokenA);

    const userA = saved.userId;
    store.accounts.push({
      ...saved,
      userId: "user-b",
      githubUserId: "2002",
      login: "beta",
      sealed: { ciphertext: "other", iv: "other", tag: "other" },
    });
    await store.replaceRepositories("user-b", [repository("beta", "other")]);

    const visible = await listRepositoriesForUser(store, userA);
    expect(visible.map((repository) => repository.fullName)).toEqual(["alpha/myapp"]);
    const foreign = await selectRepository(store, "user-b", visible[0]?.id ?? "");
    expect(foreign).toBeNull();
    const own = await selectRepository(store, userA, visible[0]?.id ?? "");
    expect(own?.fullName).toBe("alpha/myapp");

    const hostile: GithubStore = {
      ...store,
      async readSealedAccount() {
        return saved;
      },
      async getRepository() {
        return visible[0] ?? null;
      },
    };
    expect(await selectRepository(hostile, "user-b", visible[0]?.id ?? "")).toBeNull();
    const leaked = await refreshRepositories({ userId: "user-b", config, api: apiFor({}), store: hostile });
    expect(leaked).toEqual({ ok: false, error: "not_connected" });

    const removed = await disconnectAccount(store, jar, userA);
    expect(removed).toBe(true);
    expect(store.accounts.some((account) => account.userId === userA)).toBe(false);
    expect(store.accounts.some((account) => account.userId === "user-b")).toBe(true);
    expect(jar.values.has(SESSION_COOKIE)).toBe(false);
    expect(JSON.stringify(store.accounts)).not.toContain(tokenA);
  });

  it("does not replace repositories when GitHub rejects the stored token", async () => {
    const store = memoryStore();
    const jar = memoryJar();
    const url = new URL(beginAuthorization({ config, jar, now, secure: false }));
    await finishAuthorization({
      query: { code: "authorization-code", state: url.searchParams.get("state") ?? "" },
      config,
      jar,
      api: apiFor({ [tokenA]: [repository("alpha", "myapp")] }),
      store,
      now,
      secure: false,
    });
    const userId = store.accounts[0]?.userId ?? "";
    store.accounts[0] = {
      ...(store.accounts[0] as SealedGithubAccount),
      sealed: { ciphertext: "tampered", iv: "tampered", tag: "tampered" },
    };
    const refreshed = await refreshRepositories({
      userId,
      config,
      api: apiFor({ [tokenB]: [repository("beta", "other")] }),
      store,
    });
    expect(refreshed).toEqual({ ok: false, error: "authorization_failed" });
    expect((await listRepositoriesForUser(store, userId)).map((repository) => repository.fullName)).toEqual([
      "alpha/myapp",
    ]);
  });
});
