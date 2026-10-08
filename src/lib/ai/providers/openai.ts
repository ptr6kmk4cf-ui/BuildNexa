import { z } from "zod";
import { postJson } from "@/lib/ai/http";
import { createProvider, type ProviderOptions } from "@/lib/ai/provider";
import type { AIProvider, ExecuteResult, TokenCounts } from "@/lib/ai/types";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";

const responseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().min(1),
        }),
      }),
    )
    .min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    prompt_tokens_details: z
      .object({
        cached_tokens: z.number().int().nonnegative().optional(),
      })
      .optional(),
  }),
});

export function createOpenAIProvider(options: ProviderOptions): AIProvider {
  return createProvider("openai", options, async ({ model, request, apiKey, fetchImpl, timeoutMs }) => {
    const response = await postJson({
      fetchImpl,
      url: ENDPOINT,
      timeoutMs,
      headers: { authorization: `Bearer ${apiKey}` },
      signal: request.signal,
      body: {
        model: model.modelId,
        messages: request.messages,
        max_completion_tokens: request.maxOutputTokens,
      },
    });
    if (!response.ok) return response;
    return readOpenAIResponse(model.modelId, response.body);
  });
}

function readOpenAIResponse(modelId: string, body: unknown): ExecuteResult {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: "malformed" };
  const usage = usageFrom(parsed.data.usage);
  if (!usage) return { ok: false, error: "malformed" };
  const text = parsed.data.choices[0]?.message.content;
  if (!text) return { ok: false, error: "malformed" };
  return { ok: true, modelId, text, usage };
}

function usageFrom(usage: {
  prompt_tokens: number;
  completion_tokens: number;
  prompt_tokens_details?: { cached_tokens?: number | undefined } | undefined;
}): TokenCounts | null {
  const cachedInputTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;
  if (cachedInputTokens > usage.prompt_tokens) return null;
  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    cachedInputTokens,
  };
}
