import { describe, expect, it } from "vitest";
import { visibleActionMessages } from "@/lib/execution-form";

describe("run and cancel notices", () => {
  it("shows a run result and a later cancel together", () => {
    expect(
      visibleActionMessages({
        runMessage: "Finished 2 tasks.",
        cancelMessage: "Cancellation requested. A running model call will stop, and later tasks will not start.",
        runMark: 1,
        cancelMark: 2,
      }),
    ).toEqual({
      run: "Finished 2 tasks.",
      cancel: "Cancellation requested. A running model call will stop, and later tasks will not start.",
    });
  });

  it("hides an older cancel error after a newer run", () => {
    expect(
      visibleActionMessages({
        runMessage: "Finished 1 task.",
        cancelMessage: "No task run is in progress.",
        runMark: 2,
        cancelMark: 1,
      }),
    ).toEqual({ run: "Finished 1 task.", cancel: null });
  });

  it("shows only the action that was submitted", () => {
    expect(
      visibleActionMessages({
        runMessage: null,
        cancelMessage: "The task run was cancelled.",
        runMark: 0,
        cancelMark: 1,
      }),
    ).toEqual({ run: null, cancel: "The task run was cancelled." });
  });
});
