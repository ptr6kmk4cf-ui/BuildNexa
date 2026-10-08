"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/projects/confirm-submit";
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
        Run sends each unfinished task to the selected model, then runs the test, lint, typecheck, and build scripts from the project configuration. A reply is not treated as success unless those checks pass. The reply is stored and is not applied to the repository.
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
        <form action={runAction} onSubmit={() => mark("run")} className="grid gap-2">
          <input type="hidden" name="projectId" value={projectId} />
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input type="checkbox" name="authorizeOverBudget" className="mt-0.5" />
            Allow this run to exceed the project budget
          </label>
          <Button type="submit" variant="outline" disabled={runPending}>
            {runPending ? "Running tasks..." : "Run tasks"}
          </Button>
        </form>
        <ConfirmSubmit
          action={cancelAction}
          title="Cancel this run?"
          description="The running model call stops. Tasks that have not started stay in the plan until you run again. Stored replies are kept."
          confirmLabel={cancelPending ? "Stopping..." : "Cancel run"}
          triggerLabel={cancelPending ? "Stopping..." : "Cancel run"}
          fields={{ projectId }}
          disabled={cancelPending}
          onSubmit={() => mark("cancel")}
        />
      </div>
    </div>
  );
}
