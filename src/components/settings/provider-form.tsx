"use client";

import { useActionState } from "react";
import { saveProviderPreferences, type ProviderFormState } from "@/server/actions/providers";
import type { ProviderToggle } from "@/lib/ai/catalog";
import { Button } from "@/components/ui/button";

export function ProviderForm({
  providers,
  databaseConfigured,
}: {
  providers: ProviderToggle[];
  databaseConfigured: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveProviderPreferences, {
    message: null,
    saved: false,
  } satisfies ProviderFormState);

  return (
    <form action={formAction} className="grid gap-4">
      <fieldset className="grid gap-3">
        <legend className="sr-only">Providers available in this workspace</legend>
        {providers.map((provider) => (
          <label
            key={provider.id}
            className="flex items-start gap-3 rounded-lg border border-border px-3 py-3"
          >
            <input
              type="checkbox"
              name="providers"
              value={provider.id}
              defaultChecked={provider.enabled}
              className="mt-1 size-4 accent-primary"
            />
            <span className="grid gap-1">
              <span className="text-sm font-medium">{provider.name}</span>
              <span className="text-xs text-muted-foreground">
                {provider.enabled ? "Enabled" : "Disabled"} · {provider.modelCount} models ·{" "}
                {provider.keyConfigured ? "Key configured on the server" : "No API key on the server"}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      {state.message ? (
        <p role="alert" className={state.saved ? "text-sm" : "text-sm text-destructive"}>
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {databaseConfigured
            ? "Saving changes which providers this workspace may use. It does not call them."
            : "PostgreSQL is required before this choice can be saved."}
        </p>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Saving..." : "Save providers"}
        </Button>
      </div>
    </form>
  );
}
