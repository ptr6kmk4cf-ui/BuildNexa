import { createChatCompletionsProvider } from "@/lib/ai/providers/chat-completions";
import type { ProviderOptions } from "@/lib/ai/provider";
import type { AIProvider } from "@/lib/ai/types";

const ENDPOINT = "https://api.deepseek.com/chat/completions";

export function createDeepSeekProvider(options: ProviderOptions): AIProvider {
  return createChatCompletionsProvider("deepseek", ENDPOINT, options);
}
