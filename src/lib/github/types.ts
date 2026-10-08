export type RepoPermissions = {
  admin: boolean;
  maintain: boolean;
  push: boolean;
  triage: boolean;
  pull: boolean;
};

export type GithubViewer = {
  id: string;
  login: string;
  accountType: string;
  name: string | null;
  avatarUrl: string | null;
};

export type GithubRepository = {
  githubRepoId: string;
  ownerLogin: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  htmlUrl: string;
  private: boolean;
  description: string | null;
  permissions: RepoPermissions;
};

export type PublicGithubAccount = {
  githubUserId: string;
  login: string;
  accountType: string;
  avatarUrl: string | null;
  installationId: string | null;
  scopes: string[];
};

export type ConnectedRepositoryRecord = GithubRepository & {
  id: string;
  userId: string;
};

export type ProjectRepositoryLink = {
  connectedRepositoryId: string;
  githubRepoId: string;
  ownerLogin: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  htmlUrl: string;
  private: boolean;
  permissions: RepoPermissions;
};

export type GithubFailure =
  | "not_configured"
  | "incomplete"
  | "access_denied"
  | "invalid_state"
  | "missing_code"
  | "exchange_failed"
  | "authorization_failed"
  | "profile_failed"
  | "unavailable"
  | "database"
  | "not_connected"
  | "rate_limited";

export function projectLinkFromRepository(repository: ConnectedRepositoryRecord): ProjectRepositoryLink {
  return {
    connectedRepositoryId: repository.id,
    githubRepoId: repository.githubRepoId,
    ownerLogin: repository.ownerLogin,
    name: repository.name,
    fullName: repository.fullName,
    defaultBranch: repository.defaultBranch,
    htmlUrl: repository.htmlUrl,
    private: repository.private,
    permissions: repository.permissions,
  };
}
