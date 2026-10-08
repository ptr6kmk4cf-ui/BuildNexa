import type { ExecuteResult } from "@/lib/ai/types";
import type { EnvironmentResult } from "@/lib/execution/types";

export type ModelCall = {
  provider: string;
  modelId: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  timeoutMs: number;
  signal: AbortSignal;
};

export type ModelCaller = (call: ModelCall) => Promise<ExecuteResult>;

// This environment only calls a model. It has no shell, no filesystem writes, and no repository client.
export interface ExecutionEnvironment {
  readonly kind: "controlled";
  readonly writesRepository?: boolean;
  run(call: ModelCall): Promise<EnvironmentResult>;
}

export function createControlledEnvironment(caller: ModelCaller): ExecutionEnvironment {
  return {
    kind: "controlled",
    async run(call) {
      const started = Date.now();
      if (call.signal.aborted) return { ok: false, error: "cancelled", durationMs: 0 };
      const timeout = AbortSignal.timeout(call.timeoutMs);
      const combined = AbortSignal.any([call.signal, timeout]);
      try {
        const outcome = await Promise.race([
          caller({ ...call, signal: combined }).then((result) => ({ kind: "result" as const, result })),
          waitForAbort(combined).then(() => ({ kind: "aborted" as const })),
        ]);
        const durationMs = Math.max(0, Date.now() - started);
        if (call.signal.aborted) return { ok: false, error: "cancelled", durationMs };
        if (outcome.kind === "result") {
          if (!outcome.result.ok) return { ok: false, error: outcome.result.error, durationMs };
          return { ok: true, text: outcome.result.text, usage: outcome.result.usage, durationMs };
        }
        return { ok: false, error: "timeout", durationMs };
      } catch {
        const durationMs = Math.max(0, Date.now() - started);
        if (call.signal.aborted) return { ok: false, error: "cancelled", durationMs };
        if (timeout.aborted) return { ok: false, error: "timeout", durationMs };
        return { ok: false, error: "unavailable", durationMs };
      }
    },
  };
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}
