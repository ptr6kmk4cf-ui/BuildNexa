import type { ProviderMessage } from "@/lib/ai/types";
import { EXECUTION_CONFIG } from "@/lib/execution/config";
import type { ExecutionTask } from "@/lib/execution/types";

const COMMAND_PATTERN =
  /(?:^|\n)\s*(?:sudo\s+)?(?:rm\s+-\w*|curl\s+(?:-\w|\S+:\/\/)|wget\s+(?:-\w|\S+:\/\/)|bash\s+-|sh\s+-c|powershell(?:\.exe)?\s+-|chmod\s+\+|git\s+push\b|npm\s+exec\b|npx\s+\S)/i;

export const EXECUTION_SYSTEM_PROMPT =
  "Complete one planned software task. Reply with the written result only. Do not ask the host to run a shell command, write a file, or change a repository. The host will not execute commands from your reply.";

export function looksLikeHostCommand(text: string): boolean {
  return COMMAND_PATTERN.test(text);
}

export function buildTaskMessages(
  task: ExecutionTask,
  dependencyResults: ReadonlyArray<{ title: string; result: string }>,
): ProviderMessage[] {
  const lines = [
    `Task: ${clip(task.title, 500)}`,
    task.description.trim() ? `Description: ${clip(task.description, 4_000)}` : "",
    task.expectedOutput.trim() ? `Expected output: ${clip(task.expectedOutput, 2_000)}` : "",
    task.verificationCriteria.trim() ? `Verification: ${clip(task.verificationCriteria, 2_000)}` : "",
    task.context?.repositoryFullName ? `Repository: ${task.context.repositoryFullName}` : "",
    task.context && task.context.pathHints.length > 0
      ? `Path hints (names only, contents were not read): ${task.context.pathHints.join(", ")}`
      : "",
    task.context?.reason ? `Why these paths: ${clip(task.context.reason, 500)}` : "",
  ].filter((line) => line.length > 0);

  if (dependencyResults.length > 0) {
    lines.push("Completed dependency results:");
    for (const dependency of dependencyResults) {
      lines.push(`- ${dependency.title}: ${clip(dependency.result, EXECUTION_CONFIG.maxDependencyChars)}`);
    }
  }

  const content = cap(lines.join("\n"), EXECUTION_CONFIG.maxPromptChars);
  return [
    { role: "system", content: EXECUTION_SYSTEM_PROMPT },
    { role: "user", content },
  ];
}

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function cap(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}
