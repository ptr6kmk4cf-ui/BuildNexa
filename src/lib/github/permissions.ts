import type { RepoPermissions } from "@/lib/github/types";

export const EMPTY_PERMISSIONS: RepoPermissions = {
  admin: false,
  maintain: false,
  push: false,
  triage: false,
  pull: false,
};

export function readPermissions(value: unknown, fallbackPull = false): RepoPermissions {
  if (typeof value !== "object" || value === null) {
    return { ...EMPTY_PERMISSIONS, pull: fallbackPull };
  }
  const record = value as Record<string, unknown>;
  return {
    admin: record.admin === true,
    maintain: record.maintain === true,
    push: record.push === true,
    triage: record.triage === true,
    pull: record.pull === true,
  };
}

export function describePermissions(permissions: RepoPermissions): string {
  if (permissions.admin) return "Admin";
  if (permissions.maintain) return "Maintain";
  if (permissions.push) return "Write";
  if (permissions.triage) return "Triage";
  if (permissions.pull) return "Read";
  return "No access";
}

export function safeHttpsUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isGithubWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "github.com" || url.hostname === "www.github.com");
  } catch {
    return false;
  }
}
