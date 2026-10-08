import type { ExecuteRequest, ExecuteResult, ProviderMessage } from "@/lib/ai/types";

const MAX_MESSAGES = 20;
const MAX_CONTENT = 32_000;

export function validateExecuteRequest(
  request: ExecuteRequest,
): { ok: true; request: ExecuteRequest } | Extract<ExecuteResult, { ok: false }> {
  if (!Array.isArray(request.messages) || request.messages.length === 0 || request.messages.length > MAX_MESSAGES) {
    return { ok: false, error: "malformed" };
  }
  const messages: ProviderMessage[] = [];
  for (const message of request.messages) {
    if (!message || (message.role !== "system" && message.role !== "user" && message.role !== "assistant")) {
      return { ok: false, error: "malformed" };
    }
    if (typeof message.content !== "string" || message.content.trim() === "" || message.content.length > MAX_CONTENT) {
      return { ok: false, error: "malformed" };
    }
    messages.push({ role: message.role, content: message.content });
  }
  const maxOutputTokens = request.maxOutputTokens ?? 1024;
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 8192) {
    return { ok: false, error: "malformed" };
  }
  return { ok: true, request: { modelId: request.modelId, messages, maxOutputTokens } };
}
