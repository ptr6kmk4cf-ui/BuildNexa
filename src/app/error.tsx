"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Workspace page error", error.digest ?? "client");
  }, [error]);

  return (
    <div className="rounded-xl border border-border bg-card px-6 py-10">
      <h1 className="font-heading text-2xl">This page could not be shown</h1>
      <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
        The workspace hit an unexpected error. Try the page again. If it keeps failing, check the
        server logs.
        {error.digest ? ` Reference ${error.digest}.` : ""}
      </p>
      <Button className="mt-5" variant="outline" onClick={() => retry()}>
        Try again
      </Button>
    </div>
  );
}
