import "server-only";
import { openSecret } from "@/lib/crypto";
import { getPrisma } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { readGithubConfig } from "@/lib/github/config";
import { githubCloneUrl, openGithubRepository, sandboxBranchName, type RepositoryWorkspace } from "@/lib/sandbox/workflow";
import { sandboxRuntime } from "@/lib/sandbox/run";

export async function openProjectSandbox(input: {
  projectId: string;
  userId: string;
  url: string;
  defaultBranch: string;
}): Promise<{ ok: true; workspace: RepositoryWorkspace } | { ok: false; message: string }> {
  const cloneUrl = githubCloneUrl(input.url);
  if (!cloneUrl) return { ok: false, message: "The repository URL is not an https://github.com address, so it was not cloned." };
  const runtime = await sandboxRuntime();
  if (!runtime.ok) return { ok: false, message: runtime.reason };
  try {
    const workspace = await openGithubRepository({
      cloneUrl,
      branch: sandboxBranchName(input.projectId),
      baseBranch: input.defaultBranch || "main",
      token: await githubToken(input.userId),
    });
    return { ok: true, workspace };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "The repository could not be opened in the sandbox." };
  }
}

async function githubToken(userId: string): Promise<string | null> {
  const setup = readGithubConfig(getServerEnv());
  const prisma = getPrisma();
  if (setup.status !== "ready" || !prisma) return null;
  const account = await prisma.githubAccount.findUnique({
    where: { userId },
    select: { tokenCiphertext: true, tokenIv: true, tokenTag: true },
  });
  if (!account) return null;
  try {
    return openSecret(
      { ciphertext: account.tokenCiphertext, iv: account.tokenIv, tag: account.tokenTag },
      setup.config.encryptionKey,
    );
  } catch {
    return null;
  }
}
