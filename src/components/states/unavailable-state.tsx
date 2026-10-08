import { RetryButton } from "@/components/states/retry-button";
import { EmptyState } from "@/components/states/empty-state";

export function UnavailableState() {
  return (
    <EmptyState
      title="The database could not be reached"
      description="PostgreSQL is configured, but this page could not query it. Confirm the server is running and that the initial migration has been applied."
      action={<RetryButton />}
    />
  );
}
