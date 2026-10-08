import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { SealedSecret } from "@/lib/crypto";
import { safeHttpsUrl, readPermissions } from "@/lib/github/permissions";
import { toPublicGithubAccount, type GithubStore, type SealedGithubAccount } from "@/lib/github/store";
import type { ConnectedRepositoryRecord, GithubRepository } from "@/lib/github/types";
import { LOCAL_OPERATOR_EMAIL } from "@/lib/constants";

export function createPrismaGithubStore(prisma: PrismaClient): GithubStore {
  return {
    async findUserIdByGithubUserId(githubUserId) {
      const account = await prisma.githubAccount.findUnique({
        where: { githubUserId },
        select: { userId: true },
      });
      return account?.userId ?? null;
    },

    async findLocalOperator() {
      const user = await prisma.user.findUnique({
        where: { email: LOCAL_OPERATOR_EMAIL },
        select: { id: true, githubAccount: { select: { id: true } } },
      });
      if (!user) return null;
      return { id: user.id, hasGithub: user.githubAccount !== null };
    },

    async createUser(input) {
      const user = await prisma.user.upsert({
        where: { email: input.email },
        update: { name: input.name },
        create: { email: input.email, name: input.name },
        select: { id: true },
      });
      return user.id;
    },

    async saveAccount(input) {
      const existing = await prisma.githubAccount.findUnique({
        where: { githubUserId: input.githubUserId },
        select: { id: true },
      });
      await prisma.$transaction(async (tx) => {
        const account = await tx.githubAccount.upsert({
          where: { githubUserId: input.githubUserId },
          create: accountWrite(input),
          update: {
            login: input.login,
            accountType: input.accountType,
            avatarUrl: input.avatarUrl,
            installationId: input.installationId,
            scopes: input.scopes,
            tokenCiphertext: input.sealed.ciphertext,
            tokenIv: input.sealed.iv,
            tokenTag: input.sealed.tag,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: account.userId,
            action: existing ? "UPDATE" : "CREATE",
            entityType: "GithubAccount",
            entityId: account.id,
            metadata: {
              login: account.login,
              githubUserId: account.githubUserId,
              accountType: account.accountType,
              installationId: account.installationId,
            },
          },
        });
      });
    },

    async readSealedAccount(userId) {
      const account = await prisma.githubAccount.findUnique({ where: { userId } });
      if (!account) return null;
      return sealedAccount(account);
    },

    async listRepositories(userId) {
      const rows = await prisma.connectedRepository.findMany({
        where: { userId },
        orderBy: { fullName: "asc" },
        take: 300,
      });
      return rows.map(toConnectedRecord);
    },

    async replaceRepositories(userId, repositories) {
      await prisma.$transaction(async (tx) => {
        const account = await tx.githubAccount.findUnique({
          where: { userId },
          select: { id: true },
        });
        if (!account) return;
        const githubRepoIds = repositories.map((repository) => repository.githubRepoId);
        for (const repository of repositories) {
          await tx.connectedRepository.upsert({
            where: { userId_githubRepoId: { userId, githubRepoId: repository.githubRepoId } },
            create: {
              userId,
              githubAccountId: account.id,
              ...repositoryColumns(repository),
            },
            update: repositoryColumns(repository),
          });
        }
        await tx.connectedRepository.deleteMany({
          where:
            githubRepoIds.length === 0
              ? { userId }
              : {
                  userId,
                  githubRepoId: { notIn: githubRepoIds },
                },
        });
      });
      return this.listRepositories(userId);
    },

    async getRepository(userId, id) {
      const row = await prisma.connectedRepository.findFirst({
        where: { id, userId },
      });
      return row ? toConnectedRecord(row) : null;
    },

    async disconnect(userId) {
      const account = await prisma.githubAccount.findUnique({
        where: { userId },
        select: { id: true, login: true, githubUserId: true },
      });
      if (!account) return false;
      await prisma.$transaction(async (tx) => {
        await tx.auditLog.create({
          data: {
            userId,
            action: "DELETE",
            entityType: "GithubAccount",
            entityId: account.id,
            metadata: { login: account.login, githubUserId: account.githubUserId },
          },
        });
        await tx.githubAccount.delete({ where: { id: account.id } });
      });
      return true;
    },
  };
}

function accountWrite(input: {
  userId: string;
  githubUserId: string;
  login: string;
  accountType: string;
  avatarUrl: string | null;
  installationId: string | null;
  scopes: string;
  sealed: SealedSecret;
}) {
  return {
    userId: input.userId,
    githubUserId: input.githubUserId,
    login: input.login,
    accountType: input.accountType,
    avatarUrl: input.avatarUrl,
    installationId: input.installationId,
    scopes: input.scopes,
    tokenCiphertext: input.sealed.ciphertext,
    tokenIv: input.sealed.iv,
    tokenTag: input.sealed.tag,
  };
}

function repositoryColumns(repository: GithubRepository) {
  return {
    githubRepoId: repository.githubRepoId,
    ownerLogin: repository.ownerLogin,
    name: repository.name,
    fullName: repository.fullName,
    defaultBranch: repository.defaultBranch,
    htmlUrl: repository.htmlUrl,
    private: repository.private,
    description: repository.description,
    permissions: repository.permissions as Prisma.InputJsonValue,
  };
}

function sealedAccount(account: {
  userId: string;
  githubUserId: string;
  login: string;
  accountType: string;
  avatarUrl: string | null;
  installationId: string | null;
  scopes: string;
  tokenCiphertext: string;
  tokenIv: string;
  tokenTag: string;
}): SealedGithubAccount {
  const publicAccount = toPublicGithubAccount({
    ...account,
    avatarUrl: safeHttpsUrl(account.avatarUrl),
  });
  return {
    ...publicAccount,
    userId: account.userId,
    scopeText: account.scopes,
    sealed: {
      ciphertext: account.tokenCiphertext,
      iv: account.tokenIv,
      tag: account.tokenTag,
    },
  };
}

function toConnectedRecord(row: {
  id: string;
  userId: string;
  githubRepoId: string;
  ownerLogin: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  htmlUrl: string;
  private: boolean;
  description: string | null;
  permissions: Prisma.JsonValue;
}): ConnectedRepositoryRecord {
  return {
    id: row.id,
    userId: row.userId,
    githubRepoId: row.githubRepoId,
    ownerLogin: row.ownerLogin,
    name: row.name,
    fullName: row.fullName,
    defaultBranch: row.defaultBranch,
    htmlUrl: row.htmlUrl,
    private: row.private,
    description: row.description,
    permissions: readPermissions(row.permissions),
  };
}
