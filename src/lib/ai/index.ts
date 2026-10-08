import { modelsForProvider } from "@/lib/ai/registry";
import { createAnthropicProvider } from "@/lib/ai/providers/anthropic";
import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import { createOpenAIProvider } from "@/lib/ai/providers/openai";
import type { AIProvider, ProviderId } from "@/lib/ai/types";

export type AIProviderFactoryOptions = {
  apiKey?: string | undefined;
  pricingText?: string | undefined;
  fetch?: typeof fetch | undefined;
  timeoutMs?: number | undefined;
};

export function createAIProvider(id: ProviderId, options: AIProviderFactoryOptions = {}): AIProvider {
  const models = modelsForProvider(id, options.pricingText);
  const providerOptions = {
    apiKey: options.apiKey,
    models,
    fetch: options.fetch,
    timeoutMs: options.timeoutMs,
  };
  if (id === "openai") return createOpenAIProvider(providerOptions);
  if (id === "anthropic") return createAnthropicProvider(providerOptions);
  return createGeminiProvider(providerOptions);
}
