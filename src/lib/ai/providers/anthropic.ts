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
    cache_read_input_tokens: z.number().int().nonnegative().optional(),
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
    if (!startsWithUser(messages)) return { ok: false, error: "malformed" };

    const response = await postJson({
      fetchImpl,
      url: ENDPOINT,
      timeoutMs,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
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

function startsWithUser(messages: ProviderMessage[]): boolean {
  return messages.length > 0 && messages[0]?.role === "user";
}

function readAnthropicResponse(modelId: string, body: unknown): ExecuteResult {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: "malformed" };
  const cachedInputTokens = parsed.data.usage.cache_read_input_tokens ?? 0;
  if (cachedInputTokens > parsed.data.usage.input_tokens) return { ok: false, error: "malformed" };
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
      inputTokens: parsed.data.usage.input_tokens,
      outputTokens: parsed.data.usage.output_tokens,
      cachedInputTokens,
    },
  };
}
