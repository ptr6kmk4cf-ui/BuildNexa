"use server";

import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { logger } from "@/lib/logger";
import { initialRouteTasksState, type RouteTasksState } from "@/lib/routing-form";
import { idSchema } from "@/lib/validation";
import { routeStoredProject } from "@/server/routing";

export async function routeProjectTasks(
  _previous: RouteTasksState,
  formData: FormData,
): Promise<RouteTasksState> {
  try {
    const projectId = formData.get("projectId");
    if (typeof projectId !== "string" || !idSchema.safeParse(projectId).success) {
      return { ...initialRouteTasksState, message: "That project could not be found." };
    }
    const routed = await routeStoredProject(projectId);
    if (!routed.ok) return { ...initialRouteTasksState, message: routed.message };
    refresh();
    const chosen =
      routed.selectedCount === routed.taskCount
        ? `Recorded a model choice for ${routed.taskCount} tasks.`
        : `Recorded routing for ${routed.taskCount} tasks. ${routed.selectedCount} could be given a model.`;
    return { saved: true, message: `${chosen} Nothing was executed.` };
  } catch (error) {
    unstable_rethrow(error);
    logger.error("Could not route project tasks", { error });
    return { ...initialRouteTasksState, message: "The model choice could not be saved." };
  }
}
