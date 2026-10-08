import { Skeleton } from "@/components/ui/skeleton";

export function PanelSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="grid gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading workspace data</span>
      <Skeleton className="h-8 w-40" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: cards }, (_, index) => (
          <Skeleton key={index} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
