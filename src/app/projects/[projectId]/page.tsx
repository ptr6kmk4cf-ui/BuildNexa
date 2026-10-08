import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { MissingProject } from "@/components/projects/missing-project";
import { ProjectStatusBadge, TaskStatusBadge } from "@/components/status-badge";
import { PanelSkeleton } from "@/components/states/panel-skeleton";
import { WorkspaceBody } from "@/components/states/workspace-body";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTimestamp, formatUsd } from "@/lib/format";
import { labelBudgetPeriod, labelPullRequestStatus, labelTaskPriority } from "@/lib/labels";
import { getProject, type ProjectDetail } from "@/server/workspace";

export const metadata = { title: "Project" };

export default function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  return (
    <Suspense fallback={<PanelSkeleton cards={4} />}>
      <ProjectView params={params} />
    </Suspense>
  );
}

async function ProjectView({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const result = await getProject(projectId);
  if (result.status === "ready" && result.data === null) {
    return <MissingProject />;
  }

  return (
    <WorkspaceBody status={result.status}>
      {result.status === "ready" && result.data ? <ProjectShell project={result.data} /> : null}
    </WorkspaceBody>
  );
}

function ProjectShell({ project }: { project: ProjectDetail }) {
  return (
    <>
      <PageHeader
        eyebrow={project.slug}
        title={project.name}
        description={project.description ?? "No description yet."}
        actions={<ProjectStatusBadge status={project.status} />}
      />
      <div className="mb-6 rounded-xl border border-border bg-card px-5 py-4">
        <h2 className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">Objective</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 whitespace-pre-wrap">
          {project.objective ?? "No objective has been written for this project."}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Created {formatTimestamp(project.createdAt)} · Updated {formatTimestamp(project.updatedAt)}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <RecordCard
          title="Repositories"
          description="Code this project will change. GitHub is not connected in this phase."
          empty="No repositories are attached."
          items={project.repositories.map((repository) => ({
            id: repository.id,
            title: repository.name,
            meta: repository.url ?? `Branch ${repository.defaultBranch}`,
          }))}
        />
        <RecordCard
          title="Tasks"
          description="Broken out of the objective in a later phase."
          empty="No tasks are stored yet."
          items={project.tasks.map((task) => ({
            id: task.id,
            title: task.title,
            meta: `${labelTaskPriority(task.priority)} priority`,
            badge: <TaskStatusBadge status={task.status} />,
          }))}
        />
        <RecordCard
          title="Budget"
          description="Limits that later runs should stay inside."
          empty="No budget is set."
          items={project.budgets.map((budget) => ({
            id: budget.id,
            title: formatUsd(budget.limitAmount),
            meta: `${budget.currency} · ${labelBudgetPeriod(budget.period)}`,
          }))}
        />
        <RecordCard
          title="Pull requests"
          description="Opened by the optimizer later. This phase does not talk to GitHub."
          empty="No pull requests are recorded."
          items={project.pullRequests.map((pullRequest) => ({
            id: pullRequest.id,
            title: pullRequest.title,
            meta: pullRequest.url ?? labelPullRequestStatus(pullRequest.status),
          }))}
        />
      </div>
    </>
  );
}

function RecordCard({
  title,
  description,
  empty,
  items,
}: {
  title: string;
  description: string;
  empty: string;
  items: Array<{ id: string; title: string; meta: string; badge?: React.ReactNode }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="grid gap-3">
            {items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.meta}</p>
                </div>
                {item.badge}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
