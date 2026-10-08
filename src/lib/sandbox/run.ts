import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { SandboxLimits } from "@/lib/sandbox/limits";
import { SANDBOX_LIMITS } from "@/lib/sandbox/limits";
import { bwrapArguments, type RuntimeBind } from "@/lib/sandbox/bwrap";
import { createSandboxCgroup, sandboxCgroupParent } from "@/lib/sandbox/cgroup";

const PAUSE_WAIT_MS = 2_000;

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
  const held = await holdUntilLimited(child.pid, cgroup);
  if (!held.ok) {
    killTree(child.pid);
    return { ok: false, exitCode: child.exitCode, output, durationMs: Date.now() - started, timedOut: false, error: held.error };
  }
  if (child.exitCode !== null || child.signalCode !== null) {
    return {
      ok: false,
      exitCode: child.exitCode,
      output,
      durationMs: Date.now() - started,
      timedOut: false,
      error: "The sandbox command exited before its limits were confirmed.",
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

async function holdUntilLimited(pid: number, cgroup: { place(pid: number): Promise<void> }): Promise<{ ok: true } | { ok: false; error: string }> {
  const deadline = Date.now() + PAUSE_WAIT_MS;
  let tree: number[] | null = null;
  while (Date.now() < deadline) {
    if ((await processState(pid)) === null) {
      return { ok: false, error: "The sandbox command exited before its limits were confirmed." };
    }
    const pids = await processTree(pid);
    const states = await Promise.all(pids.map(async (id) => processState(id)));
    if (states.includes("T")) {
      tree = pids;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  if (!tree) {
    return { ok: false, error: "The sandbox process could not be placed under resource limits, so it was stopped." };
  }
  try {
    for (const id of tree) await cgroup.place(id);
    const again = await processTree(pid);
    for (const id of again) {
      if (!tree.includes(id)) await cgroup.place(id);
    }
    const paused = await processTree(pid);
    let continued = false;
    for (const id of paused) {
      if ((await processState(id)) !== "T") continue;
      process.kill(id, "SIGCONT");
      continued = true;
    }
    if (!continued) {
      return { ok: false, error: "The sandbox process could not be placed under resource limits, so it was stopped." };
    }
  } catch {
    return { ok: false, error: "The sandbox process could not be placed under resource limits, so it was stopped." };
  }
  return { ok: true };
}

async function processTree(pid: number): Promise<number[]> {
  const children = await childPids(pid);
  const nested = await Promise.all(children.map((child) => processTree(child)));
  return [pid, ...nested.flat()];
}

async function childPids(pid: number): Promise<number[]> {
  try {
    const text = await readFile(/*turbopackIgnore: true*/ `/proc/${pid}/task/${pid}/children`, "utf8");
    return text.trim().split(/\s+/).filter(Boolean).map(Number).filter((value) => Number.isInteger(value) && value > 0);
  } catch {
    return [];
  }
}

async function processState(pid: number): Promise<string | null> {
  try {
    const stat = await readFile(/*turbopackIgnore: true*/ `/proc/${pid}/stat`, "utf8");
    const marker = stat.lastIndexOf(")");
    if (marker < 0) return null;
    return stat.slice(marker + 2, marker + 3) || null;
  } catch {
    return null;
  }
}

function killTree(pid: number): void {
  const order: number[] = [];
  const visit = (current: number) => {
    for (const child of childPidsSync(current)) visit(child);
    order.push(current);
  };
  visit(pid);
  for (const id of order) {
    try {
      process.kill(id, "SIGKILL");
    } catch {
      // The process already exited.
    }
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // The process group already exited.
  }
}

function childPidsSync(pid: number): number[] {
  try {
    const text = readFileSync(/*turbopackIgnore: true*/ `/proc/${pid}/task/${pid}/children`, "utf8");
    return text.trim().split(/\s+/).filter(Boolean).map(Number).filter((value) => Number.isInteger(value) && value > 0);
  } catch {
    return [];
  }
}
