import { decodeEncryptionKey } from "@/lib/crypto";

export const DEFAULT_GITHUB_CALLBACK_URL = "http://127.0.0.1:43123/api/github/callback";
export const GITHUB_OAUTH_SCOPE = "read:user repo";

export type GithubConfig = {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  appSecret: string;
  encryptionKey: Buffer;
};

export type GithubConfigResult =
  | { status: "disabled"; missing: []; issues: [] }
  | { status: "incomplete"; missing: string[]; issues: string[] }
  | { status: "ready"; config: GithubConfig; missing: []; issues: [] };

export type GithubEnvInput = {
  GITHUB_CLIENT_ID?: string | undefined;
  GITHUB_CLIENT_SECRET?: string | undefined;
  GITHUB_CALLBACK_URL?: string | undefined;
  APP_SECRET?: string | undefined;
  TOKEN_ENCRYPTION_KEY?: string | undefined;
};

function blankToUndefined(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function readGithubConfig(source: GithubEnvInput): GithubConfigResult {
  const clientId = blankToUndefined(source.GITHUB_CLIENT_ID);
  const clientSecret = blankToUndefined(source.GITHUB_CLIENT_SECRET);
  const callbackUrl = blankToUndefined(source.GITHUB_CALLBACK_URL) ?? DEFAULT_GITHUB_CALLBACK_URL;
  const appSecret = blankToUndefined(source.APP_SECRET);
  const encryptionKeyText = blankToUndefined(source.TOKEN_ENCRYPTION_KEY);
  const anyCredential = Boolean(clientId || clientSecret || appSecret || encryptionKeyText || source.GITHUB_CALLBACK_URL?.trim());

  if (!clientId && !clientSecret && !appSecret && !encryptionKeyText) {
    return { status: "disabled", missing: [], issues: [] };
  }

  const missing: string[] = [];
  const issues: string[] = [];
  if (!clientId) missing.push("GITHUB_CLIENT_ID");
  if (!clientSecret) missing.push("GITHUB_CLIENT_SECRET");
  if (!appSecret) missing.push("APP_SECRET");
  if (!encryptionKeyText) missing.push("TOKEN_ENCRYPTION_KEY");
  if (clientId && !/^[A-Za-z0-9._-]{1,100}$/.test(clientId)) {
    issues.push("GITHUB_CLIENT_ID contains unsupported characters.");
  }
  if (appSecret && appSecret.length < 32) {
    issues.push("APP_SECRET must be at least 32 characters.");
  }
  if (encryptionKeyText && !decodeEncryptionKey(encryptionKeyText)) {
    issues.push("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  }
  if (anyCredential && !isHttpUrl(callbackUrl)) {
    issues.push("GITHUB_CALLBACK_URL must be an http or https URL.");
  }

  if (missing.length > 0 || issues.length > 0 || !clientId || !clientSecret || !appSecret || !encryptionKeyText) {
    return { status: "incomplete", missing, issues };
  }

  const encryptionKey = decodeEncryptionKey(encryptionKeyText);
  if (!encryptionKey) {
    return {
      status: "incomplete",
      missing,
      issues: ["TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded."],
    };
  }

  return {
    status: "ready",
    missing: [],
    issues: [],
    config: {
      clientId,
      clientSecret,
      callbackUrl,
      appSecret,
      encryptionKey,
    },
  };
}
