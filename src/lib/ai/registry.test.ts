import { describe, expect, it } from "vitest";
import { assembleCatalog, enabledProviderSet, parseEnabledProviders } from "@/lib/ai/catalog";
import { countEnabledModels, listRegistryModels } from "@/lib/ai/registry";
import { PROVIDER_IDS } from "@/lib/ai/types";

const secret = "sk-supersecretvalue123";

describe("model registry", () => {
  it("ships capability metadata and no invented prices", () => {
    const snapshot = listRegistryModels();
    expect(snapshot.pricingIssue).toBeNull();
    expect(snapshot.models.length).toBeGreaterThan(0);
    for (const model of snapshot.models) {
      expect(PROVIDER_IDS).toContain(model.provider);
      expect(model.contextWindow).toBeGreaterThan(0);
      expect(model.coding).toBeGreaterThanOrEqual(0);
      expect(model.pricing).toEqual({
        inputPerMillion: null,
        outputPerMillion: null,
        cachedInputPerMillion: null,
      });
    }
    expect(snapshot.models.find((model) => model.modelId === "gpt-4.1")?.toolSupport).toBe(true);
  });

  it("applies configured prices and ignores values that are not in the registry", () => {
    const snapshot = listRegistryModels(
      JSON.stringify({
        "openai:gpt-4.1": {
          inputPerMillion: "1.25",
          outputPerMillion: "5",
          cachedInputPerMillion: "0.25",
        },
        "openai:not-a-model": { inputPerMillion: secret, outputPerMillion: "1" },
      }),
    );
    expect(snapshot.pricingIssue).toBe("Some MODEL_PRICING entries were ignored because they did not match the registry.");
    expect(snapshot.pricingIssue).not.toContain(secret);
    expect(JSON.stringify(snapshot.models)).not.toContain(secret);
    expect(snapshot.models.find((model) => model.modelId === "gpt-4.1")?.pricing.inputPerMillion).toBe("1.25");
    expect(snapshot.models.find((model) => model.modelId === "gpt-4o")?.pricing.outputPerMillion).toBeNull();
  });

  it("does not echo a broken pricing document", () => {
    const snapshot = listRegistryModels(`{"openai:gpt-4.1": ${secret}`);
    expect(snapshot.pricingIssue).toBe("MODEL_PRICING is not valid JSON. Prices stay unset.");
    expect(JSON.stringify(snapshot)).not.toContain(secret);
    expect(snapshot.models[0]?.pricing.inputPerMillion).toBeNull();
  });

  it("keeps API keys out of the settings catalog", () => {
    const catalog = assembleCatalog({
      databaseConfigured: true,
      keys: {
        openai: secret,
        anthropic: " ",
        gemini: undefined,
        mistral: undefined,
        deepseek: undefined,
        xai: undefined,
      },
      preferenceRows: [
        { provider: "openai", enabled: true },
        { provider: "anthropic", enabled: false },
        { provider: "gemini", enabled: true },
      ],
    });
    expect(JSON.stringify(catalog)).not.toContain(secret);
    expect(catalog.providers.find((provider) => provider.id === "openai")).toMatchObject({
      keyConfigured: true,
      enabled: true,
    });
    expect(catalog.providers.find((provider) => provider.id === "anthropic")?.keyConfigured).toBe(false);
    expect(catalog.providers.find((provider) => provider.id === "gemini")?.enabled).toBe(true);
    expect(catalog.providers.find((provider) => provider.id === "xai")?.name).toBe("Grok");
    expect(catalog.providers.find((provider) => provider.id === "mistral")).toMatchObject({
      keyConfigured: false,
      enabled: false,
      modelCount: 2,
    });
    expect(catalog.providers.map((provider) => provider.id)).toEqual([
      "openai",
      "anthropic",
      "gemini",
      "mistral",
      "deepseek",
      "xai",
    ]);
  });

  it("treats a missing preference row as enabled and a saved empty set as disabled", () => {
    const models = listRegistryModels().models;
    expect(countEnabledModels(models, enabledProviderSet([]))).toBe(models.length);
    expect(countEnabledModels(models, enabledProviderSet(PROVIDER_IDS.map((provider) => ({ provider, enabled: false }))))).toBe(0);
    expect(parseEnabledProviders(["openai", "gemini"])).toEqual(["openai", "gemini"]);
    expect(parseEnabledProviders(["openai", "other"])).toBeNull();
  });
});
