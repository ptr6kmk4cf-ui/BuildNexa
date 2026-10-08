import type { SealedSecret } from "@/lib/crypto";
import type { ConnectedRepositoryRecord, GithubRepository, PublicGithubAccount } from "@/lib/github/types";

export type SealedGithubAccount = PublicGithubAccount & {
  userId: string;
  sealed: SealedSecret;
  scopeText: string;
};

export type GithubStore = {
  findUserIdByGithubUserId(githubUserId: string): Promise<string | null>;
  findLocalOperator(): Promise<{ id: string; hasGithub: boolean } | null>;
  createUser(input: { email: string; name: string }): Promise<string>;
  saveAccount(input: {
    userId: string;
    githubUserId: string;
    login: string;
    accountType: string;
    avatarUrl: string | null;
    installationId: string | null;
    scopes: string;
    sealed: SealedSecret;
  }): Promise<void>;
  readSealedAccount(userId: string): Promise<SealedGithubAccount | null>;
  listRepositories(userId: string): Promise<ConnectedRepositoryRecord[]>;
  replaceRepositories(userId: string, repositories: GithubRepository[]): Promise<ConnectedRepositoryRecord[]>;
  getRepository(userId: string, id: string): Promise<ConnectedRepositoryRecord | null>;
  disconnect(userId: string): Promise<boolean>;
};

export function chooseAccountOwner(input: {
  existingUserId: string | null;
  localOperator: { id: string; hasGithub: boolean } | null;
  createdUserId: string;
}): string {
  if (input.existingUserId) return input.existingUserId;
  if (input.localOperator && !input.localOperator.hasGithub) return input.localOperator.id;
  return input.createdUserId;
}

export function toPublicGithubAccount(account: {
  githubUserId: string;
  login: string;
  accountType: string;
  avatarUrl: string | null;
  installationId: string | null;
  scopes: string;
}): PublicGithubAccount {
  return {
    githubUserId: account.githubUserId,
    login: account.login,
    accountType: account.accountType,
    avatarUrl: account.avatarUrl,
    installationId: account.installationId,
    scopes: account.scopes.split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean),
  };
}
