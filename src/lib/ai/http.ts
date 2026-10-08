import { withTimeout } from "@/lib/async";
import type { ProviderFailure } from "@/lib/ai/types";

export async function postJson(options: {
  fetchImpl: typeof fetch;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<{ ok: true; body: unknown } | { ok: false; error: Extract<ProviderFailure, "timeout" | "provider_error" | "unavailable" | "malformed"> }> {
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  try {
    const response = await withTimeout(
      options.fetchImpl(options.url, {
        method: "POST",
        redirect: "error",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "user-agent": "ai-project-optimizer",
          ...options.headers,
        },
        body: JSON.stringify(options.body),
        signal,
      }),
      options.timeoutMs + 1000,
    );
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, error: "provider_error" };
    }
    try {
      const body: unknown = await response.json();
      return { ok: true, body };
    } catch {
      return { ok: false, error: "malformed" };
    }
  } catch (error) {
    if (isTimeout(error)) return { ok: false, error: "timeout" };
    return { ok: false, error: "unavailable" };
  }
}

function isTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError" || error.message === "Operation timed out")
  );
}
