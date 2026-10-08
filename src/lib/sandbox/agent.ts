import type { ProviderMessage } from "@/lib/ai/types";
import type { ModelCall, ModelCaller } from "@/lib/execution/environment";
import { SANDBOX_LIMITS } from "@/lib/sandbox/limits";
import type { RepositoryWorkspace } from "@/lib/sandbox/workflow";

export const SANDBOX_SYSTEM_PROMPT =
  "Edit the repository only by returning one JSON object for a single tool. Do not include a shell command, markdown, or a second object. Tools: read_file {path}, write_file {path,content}, edit_file {path,old,replacement}, create_file {path,content}, delete_file {path}, list_files {path}, search_files {query}, run_command {name}, done {summary}. run_command name is test, lint, typecheck, or build, and only when that script exists. The host does not execute prose.";

const TOOLS = new Set(["read_file", "write_file", "edit_file", "create_file", "delete_file", "list_files", "search_files", "run_command", "done"]);

export type ToolCall =
  | { tool: "read_file"; path: string }
  | { tool: "write_file"; path: string; content: string }
  | { tool: "edit_file"; path: string; old: string; replacement: string }
  | { tool: "create_file"; path: string; content: string }
  | { tool: "delete_file"; path: string }
  | { tool: "list_files"; path: string }
  | { tool: "search_files"; query: string }
  | { tool: "run_command"; name: string }
  | { tool: "done"; summary: string };

export function parseToolCall(text: string): { ok: true; call: ToolCall } | { ok: false; message: string } {
  const body = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (!body.startsWith("{") || !body.endsWith("}")) return { ok: false, message: "The model did not return one JSON tool call." };
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return { ok: false, message: "The model did not return one JSON tool call." };
  }
  if (!isRecord(value) || typeof value.tool !== "string" || !TOOLS.has(value.tool)) {
    return { ok: false, message: "That tool is not available." };
  }
  if ("args" in value || "command" in value || "argv" in value) {
    return { ok: false, message: "The model cannot choose the command arguments." };
  }
  const tool = value.tool;
  if (tool === "done") return typeof value.summary === "string" ? { ok: true, call: { tool, summary: value.summary } } : { ok: false, message: "The done tool needs a summary." };
  if (tool === "search_files") return typeof value.query === "string" ? { ok: true, call: { tool, query: value.query } } : { ok: false, message: "The search tool needs text." };
  if (tool === "run_command") return typeof value.name === "string" ? { ok: true, call: { tool, name: value.name } } : { ok: false, message: "The command name is not available." };
  if (typeof value.path !== "string") return { ok: false, message: "The tool needs a path inside the repository." };
  if (tool === "read_file" || tool === "delete_file" || tool === "list_files") return { ok: true, call: { tool, path: value.path } };
  if (tool === "write_file" || tool === "create_file") {
    return typeof value.content === "string" ? { ok: true, call: { tool, path: value.path, content: value.content } } : { ok: false, message: "The tool needs file content." };
  }
  if (typeof value.old !== "string" || typeof value.replacement !== "string") return { ok: false, message: "The edit tool needs the old text and the replacement." };
  return { ok: true, call: { tool: "edit_file", path: value.path, old: value.old, replacement: value.replacement } };
}

export async function runSandboxModel(input: {
  workspace: RepositoryWorkspace;
  call: ModelCall;
  callModel: ModelCaller;
}): Promise<{ ok: true; text: string; usage: { inputTokens: number; outputTokens: number; cachedInputTokens: number }; durationMs: number } | { ok: false; error: "cancelled"; durationMs: number }> {
  const started = Date.now();
  const usage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
  const messages: ProviderMessage[] = [
    { role: "system", content: SANDBOX_SYSTEM_PROMPT },
    ...input.call.messages.filter((message) => message.role !== "system"),
    { role: "user", content: await input.workspace.contextMessage() },
  ];
  const notes: string[] = [];
  for (let step = 0; step < SANDBOX_LIMITS.maxToolSteps; step += 1) {
    if (input.call.signal.aborted) return { ok: false, error: "cancelled", durationMs: Date.now() - started };
    const result = await input.callModel({ ...input.call, messages });
    usage.inputTokens += result.ok ? result.usage.inputTokens : 0;
    usage.outputTokens += result.ok ? result.usage.outputTokens : 0;
    usage.cachedInputTokens += result.ok ? result.usage.cachedInputTokens : 0;
    if (!result.ok) {
      notes.push(result.error);
      break;
    }
    const parsed = parseToolCall(result.text);
    if (!parsed.ok) {
      notes.push(parsed.message);
      break;
    }
    if (parsed.call.tool === "done") {
      notes.push(parsed.call.summary);
      break;
    }
    const outcome = await input.workspace.apply(parsed.call);
    notes.push(outcome);
    messages.push({ role: "assistant", content: result.text });
    messages.push({ role: "user", content: outcome });
  }
  const prepared = await input.workspace.persist();
  const text = [notes.at(-1) ?? "The sandbox finished.", prepared.summary].filter(Boolean).join("\n");
  return { ok: true, text, usage, durationMs: Date.now() - started };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
