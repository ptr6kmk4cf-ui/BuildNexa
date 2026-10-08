import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { PanelSkeleton } from "@/components/states/panel-skeleton";
import { WorkspaceBody } from "@/components/states/workspace-body";
import { formatTimestamp } from "@/lib/format";
import { labelAuditAction } from "@/lib/labels";
import { getActivity } from "@/server/workspace";

export const metadata = { title: "Activity" };

export default function ActivityPage() {
  return (
    <>
      <PageHeader
        eyebrow="Audit"
        title="Activity"
        description="Changes in this workspace are written to the audit log. The log is the record of who changed which project, not a feed of model output."
      />
      <Suspense fallback={<PanelSkeleton cards={3} />}>
        <ActivityList />
      </Suspense>
    </>
  );
}

async function ActivityList() {
  const result = await getActivity({ limit: 50 });

  return (
    <WorkspaceBody status={result.status}>
      {result.status === "ready" && result.data.length === 0 ? (
        <EmptyState
          title="No activity yet"
          description="Creating a project writes the first audit entry. Choosing models adds a routing entry. Attempts and verifications are still not run."
        />
      ) : null}
      {result.status === "ready" && result.data.length > 0 ? (
        <ol className="grid gap-2">
          {result.data.map((entry) => (
            <li key={entry.id} className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
              <p className="text-sm">
                <span className="font-medium">{labelAuditAction(entry.action)}</span> {entry.entityType}
                {entry.projectName ? ` · ${entry.projectName}` : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {entry.actorName ?? "Workspace"} · {formatTimestamp(entry.createdAt)}
                {entry.entityId ? ` · ${entry.entityId}` : ""}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
    </WorkspaceBody>
  );
}
