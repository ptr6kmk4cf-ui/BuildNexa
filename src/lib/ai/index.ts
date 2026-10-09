import { modelsForProvider } from "@/lib/ai/registry";
import { createAnthropicProvider } from "@/lib/ai/providers/anthropic";
import { createDeepSeekProvider } from "@/lib/ai/providers/deepseek";
import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import { createMistralProvider } from "@/lib/ai/providers/mistral";
import { createOpenAIProvider } from "@/lib/ai/providers/openai";
import { createXAIProvider } from "@/lib/ai/providers/xai";
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
  switch (id) {
    case "openai":
      return createOpenAIProvider(providerOptions);
    case "anthropic":
      return createAnthropicProvider(providerOptions);
    case "gemini":
      return createGeminiProvider(providerOptions);
    case "mistral":
      return createMistralProvider(providerOptions);
    case "deepseek":
      return createDeepSeekProvider(providerOptions);
    case "xai":
      return createXAIProvider(providerOptions);
  }
}
