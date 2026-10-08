import { randomBytes } from "node:crypto";
import { openSecret, sealSecret, SealedSecretError } from "@/lib/crypto";
import { readSignedValue, signValue } from "@/lib/signed-value";
import type { GithubApi } from "@/lib/github/api";
import { GITHUB_OAUTH_SCOPE, type GithubConfig } from "@/lib/github/config";
import { OAUTH_STATE_COOKIE, SESSION_COOKIE, cookieBase, type CookieJar } from "@/lib/github/cookies";
import { safeHttpsUrl } from "@/lib/github/permissions";
import { chooseAccountOwner, toPublicGithubAccount, type GithubStore } from "@/lib/github/store";
import type { ConnectedRepositoryRecord, GithubFailure, GithubViewer } from "@/lib/github/types";

const STATE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const CODE_PATTERN = /^[A-Za-z0-9._-]{8,200}$/;

export type GithubCallbackQuery = {
  code?: string | undefined;
  state?: string | undefined;
  error?: string | undefined;
  installationId?: string | undefined;
};

export function beginAuthorization(input: {
  config: GithubConfig;
  jar: CookieJar;
  now: Date;
  secure: boolean;
}): string {
  const state = randomBytes(32).toString("base64url");
  const exp = input.now.getTime() + STATE_TTL_MS;
  input.jar.set(
    OAUTH_STATE_COOKIE,
    signValue({ purpose: "github-oauth", state, exp }, input.config.appSecret),
    cookieBase(input.secure, Math.floor(STATE_TTL_MS / 1000)),
  );
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", input.config.clientId);
  url.searchParams.set("redirect_uri", input.config.callbackUrl);
  url.searchParams.set("scope", GITHUB_OAUTH_SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("allow_signup", "false");
  return url.toString();
}

export function readSessionUserId(jar: CookieJar, appSecret: string, now: Date): string | null {
  const raw = jar.get(SESSION_COOKIE);
  if (!raw) return null;
  const payload = readSignedValue(raw, appSecret);
  if (!payload || payload.purpose !== "github-session" || typeof payload.userId !== "string") return null;
  if (typeof payload.exp !== "number" || payload.exp <= now.getTime()) return null;
  return payload.userId;
}

export function clearGithubCookies(jar: CookieJar): void {
  jar.delete(OAUTH_STATE_COOKIE);
  jar.delete(SESSION_COOKIE);
}

export async function finishAuthorization(input: {
  query: GithubCallbackQuery;
  config: GithubConfig;
  jar: CookieJar;
  api: GithubApi;
  store: GithubStore;
  now: Date;
  secure: boolean;
}): Promise<{ ok: true; userId: string; login: string; repositoriesLoaded: boolean } | { ok: false; error: GithubFailure }> {
  if (input.query.error) {
    input.jar.delete(OAUTH_STATE_COOKIE);
    return { ok: false, error: input.query.error === "access_denied" ? "access_denied" : "exchange_failed" };
  }

  const expectedState = readOauthState(input.jar, input.config.appSecret, input.now);
  if (!expectedState || !input.query.state || expectedState !== input.query.state) {
    input.jar.delete(OAUTH_STATE_COOKIE);
    return { ok: false, error: "invalid_state" };
  }
  input.jar.delete(OAUTH_STATE_COOKIE);

  if (!input.query.code || !CODE_PATTERN.test(input.query.code)) {
    return { ok: false, error: "missing_code" };
  }

  const exchanged = await input.api.exchangeAuthorizationCode(input.query.code);
  if (!exchanged.ok) return { ok: false, error: exchanged.reason };

  const profile = await input.api.getViewer(exchanged.accessToken);
  if (!profile.ok) {
    if (profile.reason === "authorization_failed") return { ok: false, error: "authorization_failed" };
    if (profile.reason === "unavailable") return { ok: false, error: "unavailable" };
    return { ok: false, error: "profile_failed" };
  }

  let userId: string;
  try {
    userId = await linkViewer(input.store, profile.viewer);
    const installationId = normalizeInstallationId(input.query.installationId);
    await input.store.saveAccount({
      userId,
      githubUserId: profile.viewer.id,
      login: profile.viewer.login,
      accountType: profile.viewer.accountType,
      avatarUrl: safeHttpsUrl(profile.viewer.avatarUrl),
      installationId,
      scopes: exchanged.scopes,
      sealed: sealSecret(exchanged.accessToken, input.config.encryptionKey),
    });
  } catch {
    return { ok: false, error: "unavailable" };
  }

  writeSession(input.jar, input.config.appSecret, userId, input.now, input.secure);
  let repositoriesLoaded = false;
  try {
    const refreshed = await refreshRepositories({
      userId,
      config: input.config,
      api: input.api,
      store: input.store,
    });
    repositoriesLoaded = refreshed.ok;
  } catch {
    repositoriesLoaded = false;
  }
  return { ok: true, userId, login: profile.viewer.login, repositoriesLoaded };
}

export async function refreshRepositories(input: {
  userId: string;
  config: GithubConfig;
  api: GithubApi;
  store: GithubStore;
}): Promise<{ ok: true; repositories: ConnectedRepositoryRecord[] } | { ok: false; error: GithubFailure }> {
  const account = await input.store.readSealedAccount(input.userId);
  if (!account || account.userId !== input.userId) return { ok: false, error: "not_connected" };

  let accessToken: string;
  try {
    accessToken = openSecret(account.sealed, input.config.encryptionKey);
  } catch (error) {
    if (error instanceof SealedSecretError) return { ok: false, error: "authorization_failed" };
    return { ok: false, error: "authorization_failed" };
  }

  const listed = await input.api.listRepositories(accessToken);
  if (!listed.ok) return { ok: false, error: listed.reason };

  const stored = await input.store.replaceRepositories(input.userId, listed.repositories);
  return { ok: true, repositories: stored.filter((repository) => repository.userId === input.userId) };
}

export async function listRepositoriesForUser(
  store: GithubStore,
  userId: string,
): Promise<ConnectedRepositoryRecord[]> {
  const rows = await store.listRepositories(userId);
  return rows.filter((repository) => repository.userId === userId);
}

export async function selectRepository(
  store: GithubStore,
  userId: string,
  repositoryId: string,
): Promise<ConnectedRepositoryRecord | null> {
  const repository = await store.getRepository(userId, repositoryId);
  if (!repository || repository.userId !== userId || repository.id !== repositoryId) return null;
  return repository;
}

export async function disconnectAccount(store: GithubStore, jar: CookieJar, userId: string | null): Promise<boolean> {
  const removed = userId ? await store.disconnect(userId) : false;
  clearGithubCookies(jar);
  return removed;
}

export async function publicAccountForUser(store: GithubStore, userId: string) {
  const account = await store.readSealedAccount(userId);
  if (!account || account.userId !== userId) return null;
  return toPublicGithubAccount({ ...account, scopes: account.scopeText });
}

async function linkViewer(store: GithubStore, viewer: GithubViewer): Promise<string> {
  const existingUserId = await store.findUserIdByGithubUserId(viewer.id);
  const localOperator = await store.findLocalOperator();
  let createdUserId = "unneeded";
  if (!existingUserId && !(localOperator && !localOperator.hasGithub)) {
    createdUserId = await store.createUser({
      email: `github-${viewer.id}@users.noreply.github.invalid`,
      name: viewer.name ?? viewer.login,
    });
  }
  return chooseAccountOwner({ existingUserId, localOperator, createdUserId });
}

function readOauthState(jar: CookieJar, secret: string, now: Date): string | null {
  const raw = jar.get(OAUTH_STATE_COOKIE);
  if (!raw) return null;
  const payload = readSignedValue(raw, secret);
  if (!payload || payload.purpose !== "github-oauth" || typeof payload.state !== "string") return null;
  if (typeof payload.exp !== "number" || payload.exp <= now.getTime()) return null;
  return payload.state;
}

function writeSession(jar: CookieJar, secret: string, userId: string, now: Date, secure: boolean): void {
  jar.set(
    SESSION_COOKIE,
    signValue(
      { purpose: "github-session", userId, exp: now.getTime() + SESSION_TTL_MS },
      secret,
    ),
    cookieBase(secure, Math.floor(SESSION_TTL_MS / 1000)),
  );
}

function normalizeInstallationId(value: string | undefined): string | null {
  if (!value || !/^\d{1,20}$/.test(value)) return null;
  return value;
}
