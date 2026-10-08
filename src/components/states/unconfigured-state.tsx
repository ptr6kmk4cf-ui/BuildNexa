import { EmptyState } from "@/components/states/empty-state";
import { SetupHint } from "@/components/states/setup-hint";

export function UnconfiguredState({
  title = "PostgreSQL is not configured",
  description = "The app is running in local mode. Records stay empty until DATABASE_URL points at a database and the migration has been applied.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <EmptyState title={title} description={description}>
      <SetupHint />
    </EmptyState>
  );
}
