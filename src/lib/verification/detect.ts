import type { PlannedCheck } from "@/lib/verification/types";

export type DetectedChecks =
  | { ok: true; checks: PlannedCheck[] }
  | { ok: false; reason: string };

export function detectChecks(input: { packageJson: unknown; hasTsconfig: boolean }): DetectedChecks {
  if (!isRecord(input.packageJson)) {
    return { ok: false, reason: "No package.json was found, so this is not a detected JavaScript or TypeScript project." };
  }
  const scripts = isRecord(input.packageJson.scripts) ? input.packageJson.scripts : {};
  const checks: PlannedCheck[] = [];
  if (typeof scripts.test === "string" && scripts.test.trim()) checks.push({ kind: "test", command: "npm", args: ["test"] });
  if (typeof scripts.lint === "string" && scripts.lint.trim()) checks.push({ kind: "lint", command: "npm", args: ["run", "lint"] });
  if (typeof scripts.typecheck === "string" && scripts.typecheck.trim()) {
    checks.push({ kind: "typecheck", command: "npm", args: ["run", "typecheck"] });
  } else if (input.hasTsconfig && hasTypescript(input.packageJson)) {
    checks.push({
      kind: "typecheck",
      command: "npm",
      args: ["exec", "--offline", "--", "tsc", "--noEmit", "--pretty", "false"],
    });
  }
  if (typeof scripts.build === "string" && scripts.build.trim()) checks.push({ kind: "build", command: "npm", args: ["run", "build"] });
  if (checks.length === 0) {
    return { ok: false, reason: "No test, lint, typecheck, or build script was found in the project." };
  }
  return { ok: true, checks };
}

export function commandLine(check: PlannedCheck): string {
  return [check.command, ...check.args].join(" ");
}

export function isAllowedVerificationCommand(command: string, args: readonly string[]): boolean {
  if (command !== "npm") return false;
  if (same(args, ["test"])) return true;
  if (same(args, ["run", "lint"])) return true;
  if (same(args, ["run", "typecheck"])) return true;
  if (same(args, ["run", "build"])) return true;
  if (same(args, ["exec", "--offline", "--", "tsc", "--noEmit", "--pretty", "false"])) return true;
  return false;
}

function hasTypescript(pkg: Record<string, unknown>): boolean {
  return dependencyNamed(pkg.dependencies, "typescript") || dependencyNamed(pkg.devDependencies, "typescript");
}

function dependencyNamed(value: unknown, name: string): boolean {
  return isRecord(value) && typeof value[name] === "string";
}

function same(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
