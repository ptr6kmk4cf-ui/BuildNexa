import { parsePrice } from "@/lib/ai/cost";
import { MODEL_DEFINITIONS } from "@/lib/ai/registry-data";
import { isProviderId, type ModelPricing, type ProviderId, type RegistryModel } from "@/lib/ai/types";

const EMPTY_PRICING: ModelPricing = {
  inputPerMillion: null,
  outputPerMillion: null,
  cachedInputPerMillion: null,
};

export type RegistrySnapshot = {
  models: RegistryModel[];
  pricingIssue: string | null;
};

export function listRegistryModels(pricingText?: string | undefined): RegistrySnapshot {
  const overlay = readPricingOverlay(pricingText);
  return {
    pricingIssue: overlay.issue,
    models: MODEL_DEFINITIONS.map((definition) => ({
      ...definition,
      pricing: overlay.prices.get(`${definition.provider}:${definition.modelId}`) ?? { ...EMPTY_PRICING },
    })),
  };
}

export function modelsForProvider(provider: ProviderId, pricingText?: string | undefined): RegistryModel[] {
  return listRegistryModels(pricingText).models.filter((model) => model.provider === provider);
}

export function countEnabledModels(models: readonly RegistryModel[], enabled: ReadonlySet<ProviderId>): number {
  return models.filter((model) => enabled.has(model.provider)).length;
}

function readPricingOverlay(text: string | undefined): {
  prices: Map<string, ModelPricing>;
  issue: string | null;
} {
  const prices = new Map<string, ModelPricing>();
  if (!text || text.trim() === "") return { prices, issue: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { prices, issue: "MODEL_PRICING is not valid JSON. Prices stay unset." };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { prices, issue: "MODEL_PRICING must be a JSON object. Prices stay unset." };
  }

  let ignored = false;
  for (const [key, value] of Object.entries(parsed)) {
    const pricing = pricingFromEntry(key, value);
    if (!pricing) {
      ignored = true;
      continue;
    }
    prices.set(key, pricing);
  }

  return {
    prices,
    issue: ignored ? "Some MODEL_PRICING entries were ignored because they did not match the registry." : null,
  };
}

function pricingFromEntry(key: string, value: unknown): ModelPricing | null {
  const separator = key.indexOf(":");
  if (separator <= 0) return null;
  const provider = key.slice(0, separator);
  const modelId = key.slice(separator + 1);
  if (!isProviderId(provider)) return null;
  if (!MODEL_DEFINITIONS.some((model) => model.provider === provider && model.modelId === modelId)) return null;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const inputPerMillion = priceField(record.inputPerMillion);
  const outputPerMillion = priceField(record.outputPerMillion);
  const cachedInputPerMillion = priceField(record.cachedInputPerMillion);
  if (inputPerMillion === "invalid" || outputPerMillion === "invalid" || cachedInputPerMillion === "invalid") {
    return null;
  }
  return { inputPerMillion, outputPerMillion, cachedInputPerMillion };
}

function priceField(value: unknown): string | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || parsePrice(value) === null) return "invalid";
  return value;
}
