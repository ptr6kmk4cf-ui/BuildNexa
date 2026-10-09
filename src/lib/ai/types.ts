export const PROVIDER_IDS = ["openai", "anthropic", "gemini", "mistral", "deepseek", "xai"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export type CapabilityScore = 0 | 1 | 2 | 3 | 4 | 5;

export type ModelPricing = {
  inputPerMillion: string | null;
  outputPerMillion: string | null;
  cachedInputPerMillion: string | null;
};

export type RegistryModel = {
  provider: ProviderId;
  modelId: string;
  displayName: string;
  contextWindow: number;
  coding: CapabilityScore;
  reasoning: CapabilityScore;
  planning: CapabilityScore;
  debugging: CapabilityScore;
  research: CapabilityScore;
  speed: CapabilityScore;
  reliability: CapabilityScore;
  toolSupport: boolean;
  streaming: boolean;
  pricing: ModelPricing;
};

export type ModelCapabilities = {
  modelId: string;
  provider: ProviderId;
  contextWindow: number;
  coding: CapabilityScore;
  reasoning: CapabilityScore;
  planning: CapabilityScore;
  debugging: CapabilityScore;
  research: CapabilityScore;
  speed: CapabilityScore;
  reliability: CapabilityScore;
  toolSupport: boolean;
  streaming: boolean;
};

export type TokenCounts = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
};

export type CostQuote =
  | { currency: "USD"; amount: string; priced: true }
  | { currency: "USD"; amount: null; priced: false; reason: "pricing_unconfigured" | "invalid_usage" };

export type ProviderMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ExecuteRequest = {
  modelId: string;
  messages: ProviderMessage[];
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

export type ProviderFailure =
  | "not_configured"
  | "unknown_model"
  | "timeout"
  | "provider_error"
  | "malformed"
  | "unavailable";

export type ExecuteResult =
  | { ok: true; modelId: string; text: string; usage: TokenCounts }
  | { ok: false; error: ProviderFailure };

export type CostResult = { ok: true; quote: CostQuote } | { ok: false; error: "unknown_model" };

export interface AIProvider {
  readonly id: ProviderId;
  listModels(): RegistryModel[];
  execute(request: ExecuteRequest): Promise<ExecuteResult>;
  estimateCost(modelId: string, usage: TokenCounts): CostResult;
  getCapabilities(modelId: string): ModelCapabilities | null;
  supportsTools(modelId?: string): boolean;
  supportsStreaming(modelId?: string): boolean;
}

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  mistral: "Mistral",
  deepseek: "DeepSeek",
  xai: "Grok",
};

export function providerLabel(id: ProviderId): string {
  return PROVIDER_LABELS[id];
}

export function capabilitiesOf(model: RegistryModel): ModelCapabilities {
  return {
    modelId: model.modelId,
    provider: model.provider,
    contextWindow: model.contextWindow,
    coding: model.coding,
    reasoning: model.reasoning,
    planning: model.planning,
    debugging: model.debugging,
    research: model.research,
    speed: model.speed,
    reliability: model.reliability,
    toolSupport: model.toolSupport,
    streaming: model.streaming,
  };
}
