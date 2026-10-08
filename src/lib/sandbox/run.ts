import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type { SandboxLimits } from "@/lib/sandbox/limits";
import { SANDBOX_LIMITS } from "@/lib/sandbox/limits";
import { bwrapArguments, type RuntimeBind } from "@/lib/sandbox/bwrap";
import { createSandboxCgroup, sandboxCgroupParent } from "@/lib/sandbox/cgroup";

export type IsolatedResult = {
  ok: boolean;
  exitCode: number | null;
  output: string;
  durationMs: number;
  timedOut: boolean;
  error: string | null;
};

export async function sandboxRuntime(parent = sandboxCgroupParent()): Promise<{ ok: true; bwrap: string; parent: string } | { ok: false; reason: string }> {
  const bwrap = existsSync(/*turbopackIgnore: true*/ "/usr/bin/bwrap") ? "/usr/bin/bwrap" : "";
  if (!bwrap) return { ok: false, reason: "bubblewrap is not installed, so commands are not run." };
  if (!existsSync(/*turbopackIgnore: true*/ parent)) return { ok: false, reason: "The sandbox cgroup is not available, so commands are not run." };
  try {
    const probe = await createSandboxCgroup(parent, {
      memoryBytes: 32 * 1024 * 1024,
      cpuMax: SANDBOX_LIMITS.cpuMax,
      pidsMax: 16,
      timeoutMs: 1_000,
    });
    await probe.remove();
  } catch {
    return { ok: false, reason: "Sandbox resource limits could not be applied, so commands are not run." };
  }
  return { ok: true, bwrap, parent };
}

export async function runIsolated(input: {
  command: string;
  args: readonly string[];
  workspace: string;
  limits?: Partial<SandboxLimits>;
  network?: boolean;
  timeoutMs?: number;
  extraEnv?: Readonly<Record<string, string>>;
  readOnly?: readonly RuntimeBind[];
  signal?: AbortSignal;
  parent?: string;
  bwrap?: string;
}): Promise<IsolatedResult> {
  const started = Date.now();
  const bwrap = input.bwrap ?? "/usr/bin/bwrap";
  const parent = input.parent ?? sandboxCgroupParent();
  if (!existsSync(/*turbopackIgnore: true*/ bwrap)) {
    return { ok: false, exitCode: null, output: "", durationMs: 0, timedOut: false, error: "bubblewrap is not installed, so the command was not run." };
  }
  const limits: SandboxLimits = {
    memoryBytes: input.limits?.memoryBytes ?? SANDBOX_LIMITS.memoryBytes,
    cpuMax: input.limits?.cpuMax ?? SANDBOX_LIMITS.cpuMax,
    pidsMax: input.limits?.pidsMax ?? SANDBOX_LIMITS.pidsMax,
    timeoutMs: input.timeoutMs ?? input.limits?.timeoutMs ?? SANDBOX_LIMITS.timeoutMs,
  };
  let cgroup: Awaited<ReturnType<typeof createSandboxCgroup>> | null = null;
  try {
    cgroup = await createSandboxCgroup(parent, limits);
  } catch {
    return { ok: false, exitCode: null, output: "", durationMs: Date.now() - started, timedOut: false, error: "Sandbox resource limits could not be applied, so the command was not run." };
  }
  let args: string[];
  try {
    args = bwrapArguments({
      workspace: input.workspace,
      command: input.command,
      args: input.args,
      network: input.network === true,
      extraEnv: input.extraEnv,
      readOnly: input.readOnly,
    });
  } catch (error) {
    await cgroup.remove();
    return { ok: false, exitCode: null, output: "", durationMs: Date.now() - started, timedOut: false, error: error instanceof Error ? error.message : "The sandbox command was refused." };
  }
  try {
    return await waitForSandbox(bwrap, args, cgroup, limits.timeoutMs, input.signal, started);
  } finally {
    await cgroup.kill();
    await cgroup.remove();
  }
}

async function waitForSandbox(
  bwrap: string,
  args: string[],
  cgroup: { place(pid: number): Promise<void>; kill(): Promise<void> },
  timeoutMs: number,
  signal: AbortSignal | undefined,
  started: number,
): Promise<IsolatedResult> {
  const child = spawn(bwrap, args, { detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  let settled = false;
  const append = (chunk: Buffer | string) => {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    const room = SANDBOX_LIMITS.maxOutputChars - output.length;
    if (room <= 0) return;
    output += text.slice(0, room);
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  if (child.pid === undefined) {
    child.kill("SIGKILL");
    return { ok: false, exitCode: null, output, durationMs: Date.now() - started, timedOut: false, error: "The sandbox process did not start." };
  }
  try {
    await cgroup.place(child.pid);
  } catch {
    let alive = true;
    try {
      process.kill(child.pid, 0);
    } catch {
      alive = false;
    }
    if (alive) {
      killTree(child.pid);
      return { ok: false, exitCode: null, output, durationMs: Date.now() - started, timedOut: false, error: "The sandbox process could not be placed under resource limits, so it was stopped." };
    }
  }
  if (child.exitCode !== null || child.signalCode !== null) {
    return {
      ok: child.exitCode === 0,
      exitCode: child.exitCode,
      output,
      durationMs: Date.now() - started,
      timedOut: false,
      error: child.exitCode === 0 ? null : "The sandbox command exited before its limits were confirmed.",
    };
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => finish(true, null, "The sandbox command exceeded its time limit."), timeoutMs);
    const onAbort = () => finish(false, null, "The sandbox command was cancelled.");
    signal?.addEventListener("abort", onAbort, { once: true });
    function finish(timedOut: boolean, exitCode: number | null, error: string | null) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (timedOut || error) {
        if (child.pid) killTree(child.pid);
        void cgroup.kill();
      }
      resolve({
        ok: error === null && exitCode === 0,
        exitCode,
        output,
        durationMs: Date.now() - started,
        timedOut,
        error,
      });
    }
    child.on("error", (error) => finish(false, null, error.message));
    child.on("close", (code) => finish(false, code, null));
  });
}

function killTree(pid: number): void {
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // The process already exited.
    }
  }
}
