"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { initialRunTasksState } from "@/lib/execution-form";
import { cancelProjectTasks, executeProjectTasks } from "@/server/actions/execute-project";

export function RunTasksForm({ projectId }: { projectId: string }) {
  const [runState, runAction, runPending] = useActionState(executeProjectTasks, initialRunTasksState);
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelProjectTasks, initialRunTasksState);

  return (
    <div className="mt-4 grid gap-2">
      <p className="text-xs text-muted-foreground">
        Run sends each unfinished task and its dependency results to the selected model. Tasks that already completed stay as they are. Independent tasks can run together. The reply is stored. Shell commands in that reply are not executed, and the repository is not modified.
      </p>
      {runState.message ? (
        <p role={runState.saved ? "status" : "alert"} className={runState.saved ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
          {runState.message}
        </p>
      ) : null}
      {cancelState.message ? (
        <p role={cancelState.saved ? "status" : "alert"} className={cancelState.saved ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
          {cancelState.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <form action={runAction}>
          <input type="hidden" name="projectId" value={projectId} />
          <Button type="submit" variant="outline" disabled={runPending}>
            {runPending ? "Running tasks..." : "Run tasks"}
          </Button>
        </form>
        <form action={cancelAction}>
          <input type="hidden" name="projectId" value={projectId} />
          <Button type="submit" variant="ghost" disabled={cancelPending}>
            {cancelPending ? "Stopping..." : "Cancel run"}
          </Button>
        </form>
      </div>
    </div>
  );
}
