import type { GithubFailure } from "@/lib/github/types";

export const GITHUB_ERROR_MESSAGES: Record<GithubFailure, string> = {
  not_configured: "GitHub is not configured on this server. Add the OAuth credentials to the server environment.",
  incomplete: "GitHub environment variables are incomplete. The connection stays off until every required value is set.",
  access_denied: "GitHub authorization was cancelled before this workspace received access.",
  invalid_state: "That GitHub authorization session is no longer valid. Start the connection again.",
  missing_code: "GitHub did not return an authorization code.",
  exchange_failed: "GitHub could not finish authorization. No token was stored.",
  authorization_failed: "GitHub rejected the authorization. Connect the account again.",
  profile_failed: "GitHub did not return an account profile. No token was stored.",
  unavailable: "GitHub could not be reached. The saved connection was left unchanged.",
  database: "Connect PostgreSQL before saving a GitHub account.",
  not_connected: "Connect GitHub before loading repositories.",
};

export const GITHUB_NOTICES = {
  disconnected: "GitHub is disconnected. The saved access token was removed.",
  attached: "Repository attached. No branch was created and no pull request was opened.",
} as const;

export function githubErrorMessage(code: string | undefined | null): string | null {
  if (!code || !(code in GITHUB_ERROR_MESSAGES)) return null;
  return GITHUB_ERROR_MESSAGES[code as GithubFailure];
}

export function githubNotice(code: string | undefined | null): string | null {
  if (code === "disconnected" || code === "attached") return GITHUB_NOTICES[code];
  return null;
}
