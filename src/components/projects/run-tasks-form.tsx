"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { initialRunTasksState, visibleActionMessages } from "@/lib/execution-form";
import { cancelProjectTasks, executeProjectTasks } from "@/server/actions/execute-project";

export function RunTasksForm({ projectId }: { projectId: string }) {
  const [runState, runAction, runPending] = useActionState(executeProjectTasks, initialRunTasksState);
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelProjectTasks, initialRunTasksState);
  const [marks, setMarks] = useState({ run: 0, cancel: 0 });
  const shown = visibleActionMessages({
    runMessage: runState.message,
    cancelMessage: cancelState.message,
    runMark: marks.run,
    cancelMark: marks.cancel,
  });

  function mark(which: "run" | "cancel") {
    setMarks((current) => {
      const tick = Math.max(current.run, current.cancel) + 1;
      return { ...current, [which]: tick };
    });
  }

  return (
    <div className="mt-4 grid gap-2">
      <p className="text-xs text-muted-foreground">
        Run sends each unfinished task and its dependency results to the selected model. Tasks that already completed stay as they are. Independent tasks can run together. The reply is stored. Shell commands in that reply are not executed, and the repository is not modified.
      </p>
      {shown.run ? (
        <p role={runState.saved ? "status" : "alert"} className={runState.saved ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
          {shown.run}
        </p>
      ) : null}
      {shown.cancel ? (
        <p role={cancelState.saved ? "status" : "alert"} className={cancelState.saved ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
          {shown.cancel}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <form action={runAction} onSubmit={() => mark("run")}>
          <input type="hidden" name="projectId" value={projectId} />
          <Button type="submit" variant="outline" disabled={runPending}>
            {runPending ? "Running tasks..." : "Run tasks"}
          </Button>
        </form>
        <form action={cancelAction} onSubmit={() => mark("cancel")}>
          <input type="hidden" name="projectId" value={projectId} />
          <Button type="submit" variant="ghost" disabled={cancelPending}>
            {cancelPending ? "Stopping..." : "Cancel run"}
          </Button>
        </form>
      </div>
    </div>
  );
}
