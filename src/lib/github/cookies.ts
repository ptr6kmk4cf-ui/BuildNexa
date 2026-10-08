export const OAUTH_STATE_COOKIE = "apo_github_oauth";
export const SESSION_COOKIE = "apo_session";

export type CookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
  maxAge: number;
};

export type CookieJar = {
  get(name: string): string | undefined;
  set(name: string, value: string, options: CookieOptions): void;
  delete(name: string): void;
};

export function cookieBase(secure: boolean, maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge,
  };
}
