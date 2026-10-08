import { listRegistryModels } from "@/lib/ai/registry";
import { isProviderId, PROVIDER_IDS, providerLabel, type ProviderId, type RegistryModel } from "@/lib/ai/types";

export type ProviderToggle = {
  id: ProviderId;
  name: string;
  enabled: boolean;
  keyConfigured: boolean;
  modelCount: number;
};

export type CatalogProvider = ProviderToggle & {
  models: RegistryModel[];
};

export type AiCatalog = {
  databaseConfigured: boolean;
  pricingIssue: string | null;
  providers: CatalogProvider[];
};

export function enabledProviderSet(
  rows: ReadonlyArray<{ provider: string; enabled: boolean }> | null | undefined,
): Set<ProviderId> {
  if (!rows || rows.length === 0) return new Set(PROVIDER_IDS);
  const enabled = new Set<ProviderId>();
  for (const row of rows) {
    if (row.enabled && isProviderId(row.provider)) enabled.add(row.provider);
  }
  return enabled;
}

export function assembleCatalog(input: {
  pricingText?: string | undefined;
  preferenceRows?: ReadonlyArray<{ provider: string; enabled: boolean }> | null;
  keys: Record<ProviderId, string | undefined>;
  databaseConfigured: boolean;
}): AiCatalog {
  const snapshot = listRegistryModels(input.pricingText);
  const enabled = enabledProviderSet(input.preferenceRows);
  return {
    databaseConfigured: input.databaseConfigured,
    pricingIssue: snapshot.pricingIssue,
    providers: PROVIDER_IDS.map((id) => {
      const models = snapshot.models.filter((model) => model.provider === id);
      return {
        id,
        name: providerLabel(id),
        enabled: enabled.has(id),
        keyConfigured: Boolean(input.keys[id]?.trim()),
        modelCount: models.length,
        models,
      };
    }),
  };
}

export function parseEnabledProviders(values: readonly string[]): ProviderId[] | null {
  const enabled: ProviderId[] = [];
  for (const value of values) {
    if (!isProviderId(value) || enabled.includes(value)) return null;
    enabled.push(value);
  }
  return enabled;
}
