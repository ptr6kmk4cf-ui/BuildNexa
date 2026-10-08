"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { InputValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  initialCreateProjectFormState,
  type CreateProjectFieldErrors,
  type CreateProjectFormState,
} from "@/lib/project-form";
import { createProjectInputSchema, parseInput } from "@/lib/validation";
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
  };
}

export async function createProject(
  _previous: CreateProjectFormState,
  formData: FormData,
): Promise<CreateProjectFormState> {
  try {
    const input = parseInput(createProjectInputSchema, {
      name: formData.get("name"),
      description: formData.get("description"),
      objective: formData.get("objective"),
    });
    const saved = await createProjectRecord(input);
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
