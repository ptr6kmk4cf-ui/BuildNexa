import { createChatCompletionsProvider } from "@/lib/ai/providers/chat-completions";
import type { ProviderOptions } from "@/lib/ai/provider";
import type { AIProvider } from "@/lib/ai/types";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export function createGroqProvider(options: ProviderOptions): AIProvider {
  return createChatCompletionsProvider("groq", ENDPOINT, options);
}
