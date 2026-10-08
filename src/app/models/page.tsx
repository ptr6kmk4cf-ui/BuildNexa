import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { PanelSkeleton } from "@/components/states/panel-skeleton";
import { WorkspaceBody } from "@/components/states/workspace-body";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadAiCatalog } from "@/server/ai";

export const metadata = { title: "Models" };

export default function ModelsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Models"
        description="The registry lists each model's context window, capability ratings, and any prices you configured. API keys stay on the server. This page does not call a provider or choose a model."
      />
      <Suspense fallback={<PanelSkeleton cards={2} />}>
        <ModelCatalog />
      </Suspense>
    </>
  );
}

async function ModelCatalog() {
  const result = await loadAiCatalog();
  if (result.status === "unavailable") {
    return <WorkspaceBody status="unavailable">{null}</WorkspaceBody>;
  }

  const { providers, pricingIssue } = result.data;

  return (
    <div className="grid gap-4">
      {pricingIssue ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {pricingIssue}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Prices stay unset until MODEL_PRICING names a registry model. Capability numbers are local planning ratings from 0 to 5.
        </p>
      )}
      {providers.length === 0 ? (
        <EmptyState
          title="No providers are registered"
          description="The model registry is empty. Add a model definition before a later phase can choose one."
        />
      ) : (
        providers.map((provider) => (
          <Card key={provider.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {provider.name}
                <Badge variant={provider.enabled ? "default" : "outline"}>
                  {provider.enabled ? "Enabled" : "Disabled"}
                </Badge>
                <Badge variant="outline">{provider.keyConfigured ? "Key on server" : "No key"}</Badge>
              </CardTitle>
              <CardDescription>
                {provider.enabled
                  ? "Available for a later selection phase."
                  : "Turned off in settings. The registry entry stays visible."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {provider.models.length === 0 ? (
                <p className="text-sm text-muted-foreground">No models under this provider.</p>
              ) : (
                <ul className="grid gap-4">
                  {provider.models.map((model) => (
                    <li key={model.modelId} className="border-b border-border pb-4 last:border-0 last:pb-0">
                      <p className="text-sm font-medium">{model.displayName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{model.modelId}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Context {model.contextWindow.toLocaleString("en-US")} · Coding {model.coding} · Reasoning{" "}
                        {model.reasoning} · Planning {model.planning} · Debugging {model.debugging} · Research{" "}
                        {model.research} · Speed {model.speed} · Reliability {model.reliability} ·{" "}
                        {model.toolSupport ? "Tools" : "No tools"} · {model.streaming ? "Streaming" : "No streaming"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        In {priceLabel(model.pricing.inputPerMillion)} · Out {priceLabel(model.pricing.outputPerMillion)} ·
                        Cached {priceLabel(model.pricing.cachedInputPerMillion)} per million tokens
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function priceLabel(value: string | null): string {
  return value ? `${value} USD` : "unset";
}
