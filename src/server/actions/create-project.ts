"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { InputValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  initialCreateProjectFormState,
  type CreateProjectFieldErrors,
  type CreateProjectFormState,
} from "@/lib/project-form";
import { projectLinkFromRepository } from "@/lib/github/types";
import { planLimiter } from "@/lib/security/limits";
import { anonymousMayUseLocalOperator } from "@/lib/security/viewer";
import { createProjectInputSchema, parseInput } from "@/lib/validation";
import { getServerEnv } from "@/lib/env";
import { currentGithubUserId, selectCurrentUsersRepository } from "@/server/github";
import { createProjectRecord } from "@/server/workspace";

function fieldErrorsFromDetails(details: unknown): CreateProjectFieldErrors {
  if (typeof details !== "object" || details === null || !("fieldErrors" in details)) {
    return {};
  }
  const fieldErrors = details.fieldErrors;
  if (typeof fieldErrors !== "object" || fieldErrors === null) return {};
  const record = fieldErrors as Record<string, unknown>;
  return {
    ...(Array.isArray(record.name) ? { name: record.name.filter((item) => typeof item === "string") } : {}),
    ...(Array.isArray(record.description)
      ? { description: record.description.filter((item) => typeof item === "string") }
      : {}),
    ...(Array.isArray(record.objective)
      ? { objective: record.objective.filter((item) => typeof item === "string") }
      : {}),
    ...(Array.isArray(record.repositoryId)
      ? { repositoryId: record.repositoryId.filter((item) => typeof item === "string") }
      : {}),
  };
}

export async function createProject(
  _previous: CreateProjectFormState,
  formData: FormData,
): Promise<CreateProjectFormState> {
  try {
    const sessionUserId = await currentGithubUserId();
    if (!planLimiter.allow(sessionUserId ?? "anonymous")) {
      return {
        ...initialCreateProjectFormState,
        status: "error",
        message: "Too many projects were started. Wait a few minutes and try again.",
      };
    }
    if (!sessionUserId && !anonymousMayUseLocalOperator(getServerEnv().NODE_ENV)) {
      return { ...initialCreateProjectFormState, status: "error", message: "Connect GitHub before creating a project." };
    }
    const input = parseInput(createProjectInputSchema, {
      name: formData.get("name"),
      description: formData.get("description"),
      objective: formData.get("objective"),
      repositoryId: formData.get("repositoryId"),
    });
    const link = input.repositoryId
      ? await selectCurrentUsersRepository(input.repositoryId)
      : null;
    if (link && !link.ok) {
      return { ...initialCreateProjectFormState, status: "error", message: link.message };
    }
    const saved = await createProjectRecord(
      input,
      link?.ok
        ? { userId: link.userId, repository: projectLinkFromRepository(link.repository) }
        : undefined,
    );
    if (!saved.ok) {
      return { ...initialCreateProjectFormState, status: "error", message: saved.message };
    }
    redirect(`/projects/${saved.id}`);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof InputValidationError) {
      return {
        status: "error",
        message: "Check the highlighted fields.",
        fieldErrors: fieldErrorsFromDetails(error.details),
      };
    }
    logger.error("Could not create project", { error });
    return {
      ...initialCreateProjectFormState,
      status: "error",
      message: "The project could not be saved.",
    };
  }
}
