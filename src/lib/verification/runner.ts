import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { VERIFICATION_CONFIG } from "@/lib/verification/config";
import { commandLine, detectChecks, isAllowedVerificationCommand, type DetectedChecks } from "@/lib/verification/detect";
import { checkFromProcess, interpretChecks, unknownVerification } from "@/lib/verification/interpret";
import type { PlannedCheck, TaskVerification, VerificationCheck } from "@/lib/verification/types";

export type CommandSpawn = (planned: PlannedCheck, cwd: string, timeoutMs: number) => Promise<{
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

export function createWorkspaceVerifier(cwd: string, spawnImpl: CommandSpawn = spawnCommand): () => Promise<TaskVerification> {
  const cache = new Map<string, VerificationCheck>();
  return async () => {
    const detected = readProjectChecks(cwd);
    if (!detected.ok) return unknownVerification(detected.reason);
    const checks: VerificationCheck[] = [];
    let reused = false;
    for (const planned of detected.checks) {
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
      const result = await spawnImpl(planned, cwd, VERIFICATION_CONFIG.commandTimeoutMs);
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

export function spawnCommand(planned: PlannedCheck, cwd: string, timeoutMs: number): Promise<{
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
  return new Promise((resolve) => {
    const started = Date.now();
    let output = "";
    let settled = false;
    const finish = (result: { output: string; exitCode: number | null; durationMs: number; spawnError?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const child = spawn(planned.command, [...planned.args], {
      cwd,
      shell: false,
      env: verificationEnv(process.env),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({
        output,
        exitCode: null,
        durationMs: Date.now() - started,
        spawnError: "The check exceeded its time limit.",
      });
    }, timeoutMs);
    const append = (chunk: Buffer | string) => {
      if (output.length >= VERIFICATION_CONFIG.maxOutputChars) return;
      output += typeof chunk === "string" ? chunk : chunk.toString("utf8");
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

function verificationEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: base.NODE_ENV ?? "production" };
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) continue;
    if (/(KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|CIPHER|CREDENTIAL)/i.test(key)) continue;
    env[key] = value;
  }
  return env;
}
