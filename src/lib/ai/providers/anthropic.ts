import { z } from "zod";
import { postJson } from "@/lib/ai/http";
import { createProvider, type ProviderOptions } from "@/lib/ai/provider";
import type { AIProvider, ExecuteResult, ProviderMessage } from "@/lib/ai/types";

const ENDPOINT = "https://api.anthropic.com/v1/messages";

const responseSchema = z.object({
  content: z
    .array(
      z.object({
        type: z.string(),
        text: z.string().optional(),
      }),
    )
    .min(1),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    cache_creation_input_tokens: z.number().int().nonnegative().nullish(),
    cache_read_input_tokens: z.number().int().nonnegative().nullish(),
  }),
});

export function createAnthropicProvider(options: ProviderOptions): AIProvider {
  return createProvider("anthropic", options, async ({ model, request, apiKey, fetchImpl, timeoutMs }) => {
    const system = request.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    const messages = request.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({ role: message.role, content: message.content }));
    if (!alternatingUserConversation(messages)) return { ok: false, error: "malformed" };

    const response = await postJson({
      fetchImpl,
      url: ENDPOINT,
      timeoutMs,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: request.signal,
      body: {
        model: model.modelId,
        max_tokens: request.maxOutputTokens,
        ...(system ? { system } : {}),
        messages,
      },
    });
    if (!response.ok) return response;
    return readAnthropicResponse(model.modelId, response.body);
  });
}

function alternatingUserConversation(messages: ProviderMessage[]): boolean {
  if (messages.length === 0 || messages[0]?.role !== "user" || messages.at(-1)?.role !== "user") return false;
  for (let index = 1; index < messages.length; index += 1) {
    if (messages[index]?.role === messages[index - 1]?.role) return false;
  }
  return true;
}

function readAnthropicResponse(modelId: string, body: unknown): ExecuteResult {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: "malformed" };
  // Cache reads and cache writes are billed apart from input_tokens, not inside it.
  const cachedInputTokens = parsed.data.usage.cache_read_input_tokens ?? 0;
  const cacheWrites = parsed.data.usage.cache_creation_input_tokens ?? 0;
  const inputTokens = addCounts(parsed.data.usage.input_tokens, cachedInputTokens, cacheWrites);
  if (inputTokens === null) return { ok: false, error: "malformed" };
  const text = parsed.data.content
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("");
  if (!text) return { ok: false, error: "malformed" };
  return {
    ok: true,
    modelId,
    text,
    usage: {
      inputTokens,
      outputTokens: parsed.data.usage.output_tokens,
      cachedInputTokens,
    },
  };
}

function addCounts(first: number, second: number, third: number): number | null {
  const total = first + second + third;
  if (!Number.isSafeInteger(total)) return null;
  return total;
}
