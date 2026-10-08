import { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { PanelSkeleton } from "@/components/states/panel-skeleton";
import { WorkspaceBody } from "@/components/states/workspace-body";
import { EmptyState } from "@/components/states/empty-state";
import { ProjectStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTimestamp, formatUsd } from "@/lib/format";
import { labelAuditAction } from "@/lib/labels";
import { getDashboard } from "@/server/workspace";

export const metadata = {
  title: { absolute: "Dashboard · AI Project Optimizer" },
};

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Dashboard"
        description="Projects, running work, spend, and the latest audit entries from this workspace."
        actions={
          <Link href="/projects/new" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            New project
          </Link>
        }
      />
      <Suspense fallback={<PanelSkeleton cards={4} />}>
        <DashboardPanel />
      </Suspense>
    </>
  );
}

async function DashboardPanel() {
  const result = await getDashboard();
  return (
    <WorkspaceBody status={result.status}>
      {result.status === "ready" ? <DashboardReady data={result.data} /> : null}
    </WorkspaceBody>
  );
}

function DashboardReady({
  data,
}: {
  data: Awaited<ReturnType<typeof getDashboard>> extends infer Result
    ? Result extends { status: "ready"; data: infer Data }
      ? Data
      : never
    : never;
}) {
  const stats = [
    { label: "Projects", value: String(data.projectCount), hint: "Projects on record" },
    { label: "Active executions", value: String(data.activeExecutions), hint: "Runs that are still going" },
    { label: "Completed projects", value: String(data.completedProjects), hint: "Every task in the project completed" },
    { label: "Total AI spend", value: formatUsd(data.recordedSpendUsd), hint: "USD provider charges" },
    { label: "Current budget", value: data.budgetUsd ? formatUsd(data.budgetUsd) : "No budget", hint: "Latest USD limit on each project" },
    {
      label: "Savings",
      value: data.savings.projectedUsd ? formatUsd(data.savings.projectedUsd) : "Not available",
      hint: data.savings.projectedUsd
        ? "Estimated difference against a premium replay. Measured savings: not measured."
        : data.savings.estimatedNote,
    },
  ];

  return (
    <div className="grid gap-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Workspace totals">
        {stats.map((stat) => (
          <Card key={stat.label} size="sm">
            <CardHeader>
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="font-heading text-3xl tabular-nums">{stat.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{stat.hint}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <p className="text-xs text-muted-foreground">{data.savings.measuredNote}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="recent-projects">
          <h2 id="recent-projects" className="mb-3 font-heading text-xl">Projects</h2>
          {data.recentProjects.length === 0 ? (
            <EmptyState
              title="No projects yet"
              description="Connect a repository, describe the objective, and review the plan before anything is saved."
              action={
                <Link href="/projects/new" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                  New project
                </Link>
              }
            />
          ) : (
            <ul className="grid gap-2">
              {data.recentProjects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    className="flex flex-col gap-2 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="font-medium">{project.name}</span>
                    <span className="flex items-center gap-3">
                      <ProjectStatusBadge status={project.status} />
                      <span className="text-xs text-muted-foreground">{formatTimestamp(project.updatedAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="recent-activity">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="recent-activity" className="font-heading text-xl">Recent activity</h2>
            <Link href="/activity" className="text-sm text-primary underline-offset-4 hover:underline">
              All activity
            </Link>
          </div>
          {data.recentActivity.length === 0 ? (
            <EmptyState
              title="No activity yet"
              description="Creating a project, choosing a model, or running a task writes an audit entry here."
            />
          ) : (
            <ul className="grid gap-2">
              {data.recentActivity.map((entry) => (
                <li key={entry.id} className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
                  <p className="text-sm">
                    {labelAuditAction(entry.action)} {entry.entityType}
                    {entry.projectName ? ` in ${entry.projectName}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatTimestamp(entry.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
