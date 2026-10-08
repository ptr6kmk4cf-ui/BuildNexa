import { z } from "zod";
import { postJson } from "@/lib/ai/http";
import { createProvider, type ProviderOptions } from "@/lib/ai/provider";
import type { AIProvider, ExecuteResult } from "@/lib/ai/types";

const responseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({
          parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })).min(1),
        }),
      }),
    )
    .min(1),
  usageMetadata: z.object({
    promptTokenCount: z.number().int().nonnegative(),
    candidatesTokenCount: z.number().int().nonnegative(),
    thoughtsTokenCount: z.number().int().nonnegative().nullish(),
    cachedContentTokenCount: z.number().int().nonnegative().nullish(),
  }),
});

export function createGeminiProvider(options: ProviderOptions): AIProvider {
  return createProvider("gemini", options, async ({ model, request, apiKey, fetchImpl, timeoutMs }) => {
    const system = request.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    const contents = request.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      }));
    if (contents.length === 0 || contents[0]?.role !== "user") return { ok: false, error: "malformed" };

    const response = await postJson({
      fetchImpl,
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.modelId)}:generateContent`,
      timeoutMs,
      headers: { "x-goog-api-key": apiKey },
      body: {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        generationConfig: { maxOutputTokens: request.maxOutputTokens },
      },
    });
    if (!response.ok) return response;
    return readGeminiResponse(model.modelId, response.body);
  });
}

function readGeminiResponse(modelId: string, body: unknown): ExecuteResult {
  const parsed = responseSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: "malformed" };
  const cachedInputTokens = parsed.data.usageMetadata.cachedContentTokenCount ?? 0;
  if (cachedInputTokens > parsed.data.usageMetadata.promptTokenCount) return { ok: false, error: "malformed" };
  const outputTokens = addCounts(
    parsed.data.usageMetadata.candidatesTokenCount,
    parsed.data.usageMetadata.thoughtsTokenCount ?? 0,
  );
  if (outputTokens === null) return { ok: false, error: "malformed" };
  // Thought parts are hidden reasoning. Their tokens are already added to output above.
  const text = parsed.data.candidates[0]?.content.parts
    .filter((part) => part.thought !== true)
    .map((part) => part.text ?? "")
    .join("");
  if (!text) return { ok: false, error: "malformed" };
  return {
    ok: true,
    modelId,
    text,
    usage: {
      inputTokens: parsed.data.usageMetadata.promptTokenCount,
      outputTokens,
      cachedInputTokens,
    },
  };
}

function addCounts(first: number, second: number): number | null {
  const total = first + second;
  if (!Number.isSafeInteger(total)) return null;
  return total;
}
