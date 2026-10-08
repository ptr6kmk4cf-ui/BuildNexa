import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { VERIFICATION_CONFIG } from "@/lib/verification/config";
import { commandLine, detectChecks, isAllowedVerificationCommand, type DetectedChecks } from "@/lib/verification/detect";
import { checkFromProcess, interpretChecks, unknownVerification } from "@/lib/verification/interpret";
import type { PlannedCheck, TaskVerification, VerificationCheck } from "@/lib/verification/types";

export type CommandSpawn = (planned: PlannedCheck, cwd: string, timeoutMs: number, signal?: AbortSignal) => Promise<{
  output: string;
  exitCode: number | null;
  durationMs: number;
  spawnError?: string;
}>;

export function readProjectChecks(cwd: string): DetectedChecks {
  const packagePath = join(cwd, "package.json");
  if (!existsSync(packagePath)) return detectChecks({ packageJson: null, hasTsconfig: false });
  try {
    const packageJson: unknown = JSON.parse(readFileSync(packagePath, "utf8"));
    return detectChecks({ packageJson, hasTsconfig: existsSync(join(cwd, "tsconfig.json")) });
  } catch {
    return { ok: false, reason: "package.json could not be read, so the project checks were not run." };
  }
}

export function createWorkspaceVerifier(cwd: string, spawnImpl: CommandSpawn = spawnCommand): (signal?: AbortSignal) => Promise<TaskVerification> {
  const cache = new Map<string, VerificationCheck>();
  return async (signal) => {
    const detected = readProjectChecks(cwd);
    if (!detected.ok) return unknownVerification(detected.reason);
    const checks: VerificationCheck[] = [];
    let reused = false;
    for (const planned of detected.checks) {
      if (signal?.aborted) break;
      if (!isAllowedVerificationCommand(planned.command, planned.args)) {
        checks.push(checkFromProcess(planned, {
          output: "",
          exitCode: null,
          durationMs: 0,
          spawnError: "The command is not an allowed project check.",
        }));
        continue;
      }
      const key = commandLine(planned);
      const saved = cache.get(key);
      if (saved) {
        reused = true;
        checks.push({ ...saved });
        continue;
      }
      const result = await spawnImpl(planned, cwd, VERIFICATION_CONFIG.commandTimeoutMs, signal);
      if (signal?.aborted || result.spawnError === "The check was cancelled.") break;
      const check = checkFromProcess(planned, result);
      cache.set(key, check);
      checks.push(check);
    }
    const verification = interpretChecks(checks);
    if (reused) {
      verification.summary = `${verification.summary}. Workspace files were not modified, so a repeated check uses the same result.`;
    }
    return verification;
  };
}

export function spawnCommand(
  planned: PlannedCheck,
  cwd: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{
  output: string;
  exitCode: number | null;
  durationMs: number;
  spawnError?: string;
}> {
  if (!isAllowedVerificationCommand(planned.command, planned.args)) {
    return Promise.resolve({
      output: "",
      exitCode: null,
      durationMs: 0,
      spawnError: "The command is not an allowed project check.",
    });
  }
  if (signal?.aborted) {
    return Promise.resolve({
      output: "",
      exitCode: null,
      durationMs: 0,
      spawnError: "The check was cancelled.",
    });
  }
  return new Promise((resolve) => {
    const started = Date.now();
    let output = "";
    let settled = false;
    const child = spawn(planned.command, [...planned.args], {
      cwd,
      shell: false,
      detached: true,
      env: verificationEnv(process.env),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stop = () => killProcessTree(child);
    const timer = setTimeout(() => {
      stop();
      finish({
        output,
        exitCode: null,
        durationMs: Date.now() - started,
        spawnError: "The check exceeded its time limit.",
      });
    }, timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });

    function finish(result: { output: string; exitCode: number | null; durationMs: number; spawnError?: string }) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(result);
    }
    function onAbort() {
      stop();
      finish({
        output,
        exitCode: null,
        durationMs: Date.now() - started,
        spawnError: "The check was cancelled.",
      });
    }
    const append = (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      const room = VERIFICATION_CONFIG.maxOutputChars - output.length;
      if (room <= 0) return;
      output += text.slice(0, room);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.on("error", (error) => {
      finish({
        output,
        exitCode: null,
        durationMs: Date.now() - started,
        spawnError: error.message,
      });
    });
    child.on("close", (code) => {
      finish({ output, exitCode: code, durationMs: Date.now() - started });
    });
  });
}

function killProcessTree(child: ChildProcess): void {
  const pid = child.pid;
  if (pid === undefined || pid <= 0) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      // The process already exited.
    }
  }
}

function verificationEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: base.NODE_ENV ?? "production" };
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) continue;
    if (/(KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|CIPHER|CREDENTIAL)/i.test(key)) continue;
    env[key] = value;
  }
  return env;
}
