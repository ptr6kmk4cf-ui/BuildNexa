import { describe, expect, it, vi } from "vitest";
import { createAIProvider } from "@/lib/ai";
import { modelsForProvider } from "@/lib/ai/registry";
import type { AIProvider, ExecuteRequest, ProviderId, TokenCounts } from "@/lib/ai/types";

const apiKey = "sk-adaptertestkey123";
const usage: TokenCounts = { inputTokens: 12, outputTokens: 7, cachedInputTokens: 3 };

const adapters: Array<{
  id: ProviderId;
  modelId: string;
  url: string;
  header: string;
  success: unknown;
}> = [
  {
    id: "openai",
    modelId: "gpt-4.1",
    url: "https://api.openai.com/v1/chat/completions",
    header: "authorization",
    success: {
      choices: [{ message: { content: "Ship the auth change." } }],
      usage: { prompt_tokens: 12, completion_tokens: 7, prompt_tokens_details: { cached_tokens: 3 } },
    },
  },
  {
    id: "anthropic",
    modelId: "claude-sonnet-4-5",
    url: "https://api.anthropic.com/v1/messages",
    header: "x-api-key",
    success: {
      content: [{ type: "text", text: "Ship the auth change." }],
      usage: { input_tokens: 12, output_tokens: 7, cache_read_input_tokens: 3 },
    },
  },
  {
    id: "gemini",
    modelId: "gemini-2.5-pro",
    url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent",
    header: "x-goog-api-key",
    success: {
      candidates: [{ content: { parts: [{ text: "Ship the auth change." }] } }],
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 7, cachedContentTokenCount: 3 },
    },
  },
];

function providerFor(
  id: ProviderId,
  fetchImpl: typeof fetch,
  options?: { apiKey?: string; timeoutMs?: number },
): AIProvider {
  return createAIProvider(id, {
    apiKey: options?.apiKey === undefined ? apiKey : options.apiKey,
    fetch: fetchImpl,
    timeoutMs: options?.timeoutMs ?? 1000,
    pricingText: JSON.stringify({
      [`${id}:${adapters.find((adapter) => adapter.id === id)?.modelId}`]: {
        inputPerMillion: "2.5",
        outputPerMillion: "10",
        cachedInputPerMillion: "0.5",
      },
    }),
  });
}

function request(modelId: string): ExecuteRequest {
  return {
    modelId,
    messages: [{ role: "user", content: "Review the authentication upgrade." }],
  };
}

describe("provider adapters", () => {
  it("completes a request without placing the API key in the URL or the result", async () => {
    for (const adapter of adapters) {
      const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
        const url = String(input);
        expect(url).toBe(adapter.url);
        const headers = new Headers(init?.headers);
        expect(headers.get(adapter.header)).toContain(apiKey);
        const serialized = `${url}\n${String(init?.body)}`;
        expect(serialized).toContain(adapter.modelId);
        expect(serialized).not.toContain(apiKey);
        return Response.json(adapter.success);
      });
      const provider = providerFor(adapter.id, fetchImpl);
      const result = await provider.execute(request(adapter.modelId));
      expect(result).toEqual({
        ok: true,
        modelId: adapter.modelId,
        text: "Ship the auth change.",
        usage,
      });
      expect(JSON.stringify(result)).not.toContain(apiKey);
    }
  });

  it("reports provider failures without returning the response body", async () => {
    for (const adapter of adapters) {
      const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ error: apiKey }, { status: 503 }));
      const result = await providerFor(adapter.id, fetchImpl).execute(request(adapter.modelId));
      expect(result).toEqual({ ok: false, error: "provider_error" });
      expect(JSON.stringify(result)).not.toContain(apiKey);
    }
  });

  it("reports a timeout when the provider does not answer", async () => {
    for (const adapter of adapters) {
      const fetchImpl = vi.fn<typeof fetch>(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
            });
          }),
      );
      const result = await providerFor(adapter.id, fetchImpl, { timeoutMs: 20 }).execute(request(adapter.modelId));
      expect(result).toEqual({ ok: false, error: "timeout" });
    }
  });

  it("reports a malformed success body", async () => {
    for (const adapter of adapters) {
      const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ unexpected: true }));
      const result = await providerFor(adapter.id, fetchImpl).execute(request(adapter.modelId));
      expect(result).toEqual({ ok: false, error: "malformed" });
    }
  });

  it("does not call the provider when the key is missing or the model is unknown", async () => {
    for (const adapter of adapters) {
      const fetchImpl = vi.fn<typeof fetch>();
      const unconfigured = providerFor(adapter.id, fetchImpl, { apiKey: "" });
      expect(await unconfigured.execute(request(adapter.modelId))).toEqual({ ok: false, error: "not_configured" });
      const configured = providerFor(adapter.id, fetchImpl);
      expect(await configured.execute(request("not-a-model"))).toEqual({ ok: false, error: "unknown_model" });
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it("returns model capabilities, tool support, streaming, and a cost quote", () => {
    for (const adapter of adapters) {
      const provider = providerFor(adapter.id, vi.fn<typeof fetch>());
      const capabilities = provider.getCapabilities(adapter.modelId);
      expect(capabilities).toMatchObject({
        modelId: adapter.modelId,
        provider: adapter.id,
        toolSupport: true,
        streaming: true,
      });
      expect(capabilities?.coding).toBeGreaterThan(0);
      expect(capabilities?.contextWindow).toBeGreaterThan(0);
      expect(provider.supportsTools(adapter.modelId)).toBe(true);
      expect(provider.supportsStreaming(adapter.modelId)).toBe(true);
      expect(provider.supportsTools("missing")).toBe(false);
      expect(provider.supportsStreaming()).toBe(modelsForProvider(adapter.id).some((model) => model.streaming));
      expect(provider.listModels().map((model) => model.modelId)).toContain(adapter.modelId);
      expect(provider.estimateCost(adapter.modelId, usage)).toEqual({
        ok: true,
        quote: { currency: "USD", amount: "0.000094", priced: true },
      });
      expect(provider.estimateCost("missing", usage)).toEqual({ ok: false, error: "unknown_model" });
    }
  });
});
