"use server";

import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { initialRunTasksState, type RunTasksState } from "@/lib/execution-form";
import { logger } from "@/lib/logger";
import { idSchema } from "@/lib/validation";
import { executeStoredProject, requestExecutionCancel } from "@/server/execution";

export async function executeProjectTasks(
  _previous: RunTasksState,
  formData: FormData,
): Promise<RunTasksState> {
  try {
    const projectId = formData.get("projectId");
    if (typeof projectId !== "string" || !idSchema.safeParse(projectId).success) {
      return { ...initialRunTasksState, message: "That project could not be found." };
    }
    const executed = await executeStoredProject(projectId, {
      authorizeOverBudget: formData.get("authorizeOverBudget") === "on",
    });
    if (!executed.ok) return { ...initialRunTasksState, message: executed.message };
    refresh();
    if (executed.taskCount === 0) {
      return { saved: true, message: "Every task was already completed. The model was not called." };
    }
    const taskWord = executed.taskCount === 1 ? "task" : "tasks";
    const summary =
      executed.completedCount === executed.taskCount
        ? `Finished ${executed.taskCount} ${taskWord}.`
        : `Finished the run. ${executed.completedCount} of ${executed.taskCount} ${taskWord} completed.`;
    return {
      saved: true,
      message: `${summary} Replies are stored. Repository edits and project commands run only inside the sandbox, and only after a GitHub repository is cloned there. A pull request is not opened.`,
    };
  } catch (error) {
    unstable_rethrow(error);
    logger.error("Could not execute project tasks", { error });
    return { ...initialRunTasksState, message: "The task run could not be saved." };
  }
}

export async function cancelProjectTasks(
  _previous: RunTasksState,
  formData: FormData,
): Promise<RunTasksState> {
  try {
    const projectId = formData.get("projectId");
    if (typeof projectId !== "string" || !idSchema.safeParse(projectId).success) {
      return { ...initialRunTasksState, message: "That project could not be found." };
    }
    const cancelled = await requestExecutionCancel(projectId);
    if (!cancelled.ok) return { ...initialRunTasksState, message: cancelled.message };
    refresh();
    if (cancelled.stopped) return { saved: true, message: "The task run was cancelled." };
    return { saved: true, message: "Cancellation requested. A running model call will stop, and later tasks will not start." };
  } catch (error) {
    unstable_rethrow(error);
    logger.error("Could not cancel project tasks", { error });
    return { ...initialRunTasksState, message: "The task run could not be cancelled." };
  }
}
