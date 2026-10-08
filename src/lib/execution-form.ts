export type RunTasksState = {
  message: string | null;
  saved: boolean;
};

export const initialRunTasksState: RunTasksState = {
  message: null,
  saved: false,
};

// Marks increase each time a button is submitted. A newer run replaces an older cancel notice.
// A cancel that comes after the run stays visible with the run result.
export function visibleActionMessages(input: {
  runMessage: string | null;
  cancelMessage: string | null;
  runMark: number;
  cancelMark: number;
}): { run: string | null; cancel: string | null } {
  return {
    run: input.runMessage && input.runMark > 0 ? input.runMessage : null,
    cancel: input.cancelMessage && input.cancelMark > 0 && input.cancelMark >= input.runMark ? input.cancelMessage : null,
  };
}
