import { createChatCompletionsProvider } from "@/lib/ai/providers/chat-completions";
import type { ProviderOptions } from "@/lib/ai/provider";
import type { AIProvider } from "@/lib/ai/types";

const ENDPOINT = "https://api.x.ai/v1/chat/completions";

export function createXAIProvider(options: ProviderOptions): AIProvider {
  return createChatCompletionsProvider("xai", ENDPOINT, options);
}
