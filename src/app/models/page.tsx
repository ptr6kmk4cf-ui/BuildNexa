import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { PanelSkeleton } from "@/components/states/panel-skeleton";
import { WorkspaceBody } from "@/components/states/workspace-body";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsd } from "@/lib/format";
import { listModelCatalog } from "@/server/workspace";

export const metadata = { title: "Models" };

export default function ModelsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Models"
        description="Providers and models are records the optimizer will be allowed to choose from. No vendor is connected in this phase, and nothing here is called."
      />
      <Suspense fallback={<PanelSkeleton cards={2} />}>
        <ModelCatalog />
      </Suspense>
    </>
  );
}

async function ModelCatalog() {
  const result = await listModelCatalog();

  return (
    <WorkspaceBody status={result.status}>
      {result.status === "ready" && result.data.length === 0 ? (
        <EmptyState
          title="No providers are registered"
          description="When a later phase adds a provider, its models, context windows, and prices will list here. This screen does not store API keys."
        />
      ) : null}
      {result.status === "ready" && result.data.length > 0 ? (
        <div className="grid gap-4">
          {result.data.map((provider) => (
            <Card key={provider.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {provider.name}
                  <Badge variant={provider.enabled ? "default" : "outline"}>
                    {provider.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </CardTitle>
                <CardDescription>{provider.slug}</CardDescription>
              </CardHeader>
              <CardContent>
                {provider.models.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No models under this provider.</p>
                ) : (
                  <ul className="grid gap-3">
                    {provider.models.map((model) => (
                      <li key={model.id} className="flex flex-col gap-1 border-b border-border pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-medium">{model.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {model.slug}
                            {model.contextWindow ? ` · ${model.contextWindow.toLocaleString("en-US")} token context` : ""}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          In {model.inputPricePerMillion ? formatUsd(model.inputPricePerMillion) : "unset"} / Out{" "}
                          {model.outputPricePerMillion ? formatUsd(model.outputPricePerMillion) : "unset"} per million
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </WorkspaceBody>
  );
}
