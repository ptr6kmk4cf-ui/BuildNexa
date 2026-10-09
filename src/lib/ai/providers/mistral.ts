import { createChatCompletionsProvider } from "@/lib/ai/providers/chat-completions";
import type { ProviderOptions } from "@/lib/ai/provider";
import type { AIProvider } from "@/lib/ai/types";

const ENDPOINT = "https://api.mistral.ai/v1/chat/completions";

export function createMistralProvider(options: ProviderOptions): AIProvider {
  return createChatCompletionsProvider("mistral", ENDPOINT, options);
}
