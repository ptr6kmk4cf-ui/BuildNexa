"use client";

import { useActionState } from "react";
import { routeProjectTasks } from "@/server/actions/route-project";
import { initialRouteTasksState } from "@/lib/routing-form";
import { Button } from "@/components/ui/button";

export function RouteTasksForm({ projectId, hasDecisions }: { projectId: string; hasDecisions: boolean }) {
  const [state, formAction, pending] = useActionState(routeProjectTasks, initialRouteTasksState);

  return (
    <form action={formAction} className="mt-4 grid gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <p className="text-xs text-muted-foreground">
        Routing records a model for each task from capability ratings, prices, and past attempts. It does not call the model or change a repository.
      </p>
      {state.message ? (
        <p role={state.saved ? "status" : "alert"} className={state.saved ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
          {state.message}
        </p>
      ) : null}
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Routing..." : hasDecisions ? "Update model choices" : "Choose models"}
        </Button>
      </div>
    </form>
  );
}
