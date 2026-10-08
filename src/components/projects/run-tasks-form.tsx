"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { initialRunTasksState } from "@/lib/execution-form";
import { cancelProjectTasks, executeProjectTasks } from "@/server/actions/execute-project";

export function RunTasksForm({ projectId }: { projectId: string }) {
  const [runState, runAction, runPending] = useActionState(executeProjectTasks, initialRunTasksState);
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelProjectTasks, initialRunTasksState);
  const message = runState.message ?? cancelState.message;
  const saved = runState.message ? runState.saved : cancelState.saved;

  return (
    <div className="mt-4 grid gap-2">
      <p className="text-xs text-muted-foreground">
        Run sends each unfinished task and its dependency results to the selected model. Tasks that already completed stay as they are. Independent tasks can run together. The reply is stored. Shell commands in that reply are not executed, and the repository is not modified.
      </p>
      {message ? (
        <p role={saved ? "status" : "alert"} className={saved ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
          {message}
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
