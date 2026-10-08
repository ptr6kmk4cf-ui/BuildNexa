"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { InputValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { projectLinkFromRepository } from "@/lib/github/types";
import { idSchema, parseInput } from "@/lib/validation";
import { disconnectCurrentGithub, refreshCurrentRepositories, selectCurrentUsersRepository } from "@/server/github";
import { attachRepositoryRecord } from "@/server/workspace";

export async function refreshGithubRepositories(): Promise<void> {
  try {
    const result = await refreshCurrentRepositories();
    if (!result.ok) redirect(`/github?error=${result.error}`);
    redirect("/github");
  } catch (error) {
    unstable_rethrow(error);
    logger.error("Could not refresh GitHub repositories");
    redirect("/github?error=unavailable");
  }
}

export async function disconnectGithub(): Promise<void> {
  try {
    await disconnectCurrentGithub();
    redirect("/github?notice=disconnected");
  } catch (error) {
    unstable_rethrow(error);
    logger.error("Could not disconnect GitHub");
    redirect("/github?error=unavailable");
  }
}

export async function attachRepository(
  _previous: { message: string | null },
  formData: FormData,
): Promise<{ message: string | null }> {
  try {
    const projectId = parseInput(idSchema, formData.get("projectId"));
    const repositoryId = parseInput(idSchema, formData.get("repositoryId"));
    const selected = await selectCurrentUsersRepository(repositoryId);
    if (!selected.ok) return { message: selected.message };
    const saved = await attachRepositoryRecord({
      projectId,
      userId: selected.userId,
      repository: projectLinkFromRepository(selected.repository),
    });
    if (!saved.ok) return { message: saved.message };
    redirect(`/projects/${projectId}?notice=attached`);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof InputValidationError) {
      return { message: "Choose a project and a connected repository." };
    }
    logger.error("Could not attach repository");
    return { message: "The repository could not be attached." };
  }
}
