import { calculateCost } from "@/lib/ai/cost";
import { validateExecuteRequest } from "@/lib/ai/request";
import {
  capabilitiesOf,
  type AIProvider,
  type CostResult,
  type ExecuteRequest,
  type ExecuteResult,
  type ProviderId,
  type RegistryModel,
} from "@/lib/ai/types";

export type ProviderOptions = {
  apiKey?: string | undefined;
  models: RegistryModel[];
  fetch?: typeof fetch | undefined;
  timeoutMs?: number | undefined;
};

export function createProvider(
  id: ProviderId,
  options: ProviderOptions,
  callModel: (input: {
    model: RegistryModel;
    request: ExecuteRequest;
    apiKey: string;
    fetchImpl: typeof fetch;
    timeoutMs: number;
  }) => Promise<ExecuteResult>,
): AIProvider {
  const models = options.models.filter((model) => model.provider === id);
  const timeoutMs = options.timeoutMs ?? 20_000;
  const fetchImpl = options.fetch ?? fetch;

  return {
    id,
    listModels() {
      return models;
    },
    async execute(request) {
      if (!options.apiKey) return { ok: false, error: "not_configured" };
      const model = models.find((entry) => entry.modelId === request.modelId);
      if (!model) return { ok: false, error: "unknown_model" };
      const validated = validateExecuteRequest(request);
      if (!validated.ok) return validated;
      return callModel({
        model,
        request: validated.request,
        apiKey: options.apiKey,
        fetchImpl,
        timeoutMs,
      });
    },
    estimateCost(modelId, usage): CostResult {
      const model = models.find((entry) => entry.modelId === modelId);
      if (!model) return { ok: false, error: "unknown_model" };
      return { ok: true, quote: calculateCost(model.pricing, usage) };
    },
    getCapabilities(modelId) {
      const model = models.find((entry) => entry.modelId === modelId);
      return model ? capabilitiesOf(model) : null;
    },
    supportsTools(modelId) {
      if (modelId === undefined) return models.some((model) => model.toolSupport);
      return models.find((model) => model.modelId === modelId)?.toolSupport ?? false;
    },
    supportsStreaming(modelId) {
      if (modelId === undefined) return models.some((model) => model.streaming);
      return models.find((model) => model.modelId === modelId)?.streaming ?? false;
    },
  };
}
