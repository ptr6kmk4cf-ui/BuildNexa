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
        description="Choose which model providers are available, and keep projects, repositories, and cost on record. This phase does not route work, call a model from the workspace, push code, or open a pull request."
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
  data: {
    projectCount: number;
    taskCount: number;
    enabledModelCount: number;
    recordedSpendUsd: string;
    recentProjects: Array<{ id: string; name: string; status: string; updatedAt: string }>;
    recentActivity: Array<{
      id: string;
      action: string;
      entityType: string;
      createdAt: string;
      projectName: string | null;
    }>;
  };
}) {
  const stats = [
    { label: "Projects", value: String(data.projectCount), hint: "Objectives on record" },
    { label: "Tasks", value: String(data.taskCount), hint: "Not generated in this phase" },
    { label: "Enabled models", value: String(data.enabledModelCount), hint: "Registry models for enabled providers" },
    { label: "Recorded spend", value: formatUsd(data.recordedSpendUsd), hint: "USD cost records" },
  ];

  return (
    <div className="grid gap-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-heading text-xl">Recent projects</h2>
          {data.recentProjects.length === 0 ? (
            <EmptyState
              title="No projects yet"
              description="Create a project when you know the objective. Provider choices are saved separately in settings."
              action={
                <Link href="/projects" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                  Go to projects
                </Link>
              }
            />
          ) : (
            <ul className="grid gap-2">
              {data.recentProjects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10"
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
        <section>
          <h2 className="mb-3 font-heading text-xl">Recent activity</h2>
          {data.recentActivity.length === 0 ? (
            <EmptyState
              title="The audit log is empty"
              description="Creating a project writes the first entry. Later phases will log model choices, attempts, and checks here."
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
