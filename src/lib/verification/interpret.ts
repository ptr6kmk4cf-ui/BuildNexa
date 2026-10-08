import { VERIFICATION_CONFIG } from "@/lib/verification/config";
import { commandLine } from "@/lib/verification/detect";
import type { PlannedCheck, TaskVerification, VerificationCheck } from "@/lib/verification/types";

export function unknownVerification(reason: string): TaskVerification {
  return {
    outcome: "unknown",
    checks: [],
    durationMs: 0,
    errors: reason,
    summary: reason,
    costUsd: null,
  };
}

export function failedWithoutChecks(message: string): TaskVerification {
  return {
    outcome: "fail",
    checks: [],
    durationMs: 0,
    errors: message,
    summary: message,
    costUsd: null,
  };
}

export function interpretChecks(checks: readonly VerificationCheck[], costUsd: string | null = null): TaskVerification {
  if (checks.length === 0) return unknownVerification("No checks were produced.");
  const durationMs = checks.reduce((total, check) => total + Math.max(0, check.durationMs), 0);
  const failures = checks.filter((check) => check.outcome === "fail");
  const passes = checks.filter((check) => check.outcome === "pass");
  const unknowns = checks.filter((check) => check.outcome === "unknown");
  const outcome = overallOutcome(passes.length, failures.length, unknowns.length);
  const errors = clip(
    failures
      .concat(unknowns)
      .map((check) => check.errors)
      .filter((value): value is string => Boolean(value))
      .join("\n"),
    VERIFICATION_CONFIG.maxErrorChars,
  );
  const summary = checks
    .map((check) => {
      const exit = check.exitCode === null ? "no exit code" : `exited ${check.exitCode}`;
      return `${check.command} ${exit}`;
    })
    .join(". ");
  return {
    outcome,
    checks: checks.map((check) => ({ ...check })),
    durationMs,
    errors: errors || null,
    summary,
    costUsd,
  };
}

export function checkFromProcess(planned: PlannedCheck, input: {
  output: string;
  exitCode: number | null;
  durationMs: number;
  spawnError?: string;
}): VerificationCheck {
  const output = clip(input.output, VERIFICATION_CONFIG.maxOutputChars);
  if (input.spawnError || input.exitCode === null) {
    const errors = clip(input.spawnError ?? "The check did not exit.", VERIFICATION_CONFIG.maxErrorChars);
    return {
      kind: planned.kind,
      command: commandLine(planned),
      output,
      exitCode: input.exitCode,
      durationMs: Math.max(0, input.durationMs),
      errors,
      outcome: "unknown",
    };
  }
  const failed = input.exitCode !== 0;
  return {
    kind: planned.kind,
    command: commandLine(planned),
    output,
    exitCode: input.exitCode,
    durationMs: Math.max(0, input.durationMs),
    errors: failed ? clip(tail(output), VERIFICATION_CONFIG.maxErrorChars) : null,
    outcome: failed ? "fail" : "pass",
  };
}

export function unresolvedReport(input: {
  verification: TaskVerification;
  attempts: number;
  costUsd: string | null;
  reason: string;
}): string {
  const failed = input.verification.checks.filter((check) => check.outcome !== "pass");
  const what = failed.length > 0
    ? failed.map((check) => `${check.command} (${check.outcome}${check.exitCode === null ? "" : `, exit ${check.exitCode}`})`).join("; ")
    : input.verification.summary;
  const cost = input.costUsd ? `$${input.costUsd}` : "no priced cost";
  return `Verification did not pass. Failed: ${what}. Attempts: ${input.attempts}. Cost incurred: ${cost}. Stopped because ${input.reason}`;
}

function overallOutcome(passes: number, failures: number, unknowns: number): TaskVerification["outcome"] {
  if (failures === 0 && unknowns === 0 && passes > 0) return "pass";
  if (failures > 0 && passes > 0) return "partial";
  if (failures > 0) return "fail";
  if (passes > 0 && unknowns > 0) return "partial";
  return "unknown";
}

function tail(output: string): string {
  const lines = output.trim().split("\n");
  return lines.slice(-20).join("\n");
}

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}
