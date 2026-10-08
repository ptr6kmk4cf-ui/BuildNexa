import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { MissingProject } from "@/components/projects/missing-project";
import { ProjectStatusBadge } from "@/components/status-badge";
import { PanelSkeleton } from "@/components/states/panel-skeleton";
import { WorkspaceBody } from "@/components/states/workspace-body";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTimestamp, formatUsd } from "@/lib/format";
import { labelBudgetPeriod, labelOptimizationMode, labelPullRequestStatus } from "@/lib/labels";
import { AttachRepositoryForm } from "@/components/github/attach-repository-form";
import { TaskGraph } from "@/components/projects/task-graph";
import { githubNotice } from "@/lib/github/messages";
import { listRepositoryOptions } from "@/server/github";
import { getProject, type ProjectDetail } from "@/server/workspace";

export const metadata = { title: "Project" };

export default function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  return (
    <Suspense fallback={<PanelSkeleton cards={4} />}>
      <ProjectView params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ProjectView({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const notice = githubNotice(query.notice);
  const result = await getProject(projectId);
  if (result.status === "ready" && result.data === null) {
    return <MissingProject />;
  }

  return (
    <WorkspaceBody status={result.status}>
      {notice ? <p className="mb-4 rounded-lg border border-border bg-card px-4 py-3 text-sm">{notice}</p> : null}
      {result.status === "ready" && result.data ? <ProjectShell project={result.data} /> : null}
    </WorkspaceBody>
  );
}

async function ProjectShell({ project }: { project: ProjectDetail }) {
  const linked = new Set(
    project.repositories.map((repository) => repository.githubRepoId).filter((id): id is string => Boolean(id)),
  );
  const available = (await listRepositoryOptions()).filter(
    (repository) => !repository.githubRepoId || !linked.has(repository.githubRepoId),
  );
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
          {labelOptimizationMode(project.optimizationMode)} · Created {formatTimestamp(project.createdAt)} · Updated{" "}
          {formatTimestamp(project.updatedAt)}
        </p>
      </div>
      <section className="mb-6 rounded-xl border border-border bg-card px-5 py-4">
        <h2 className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">Task graph</h2>
        {project.plan ? <p className="mt-2 max-w-3xl text-sm leading-6">{project.plan.summary}</p> : null}
        {project.tasks.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No plan is stored yet. Create one from the new project screen. Planning does not run the tasks.
          </p>
        ) : (
          <div className="mt-4">
            <TaskGraph projectId={project.id} tasks={project.tasks} />
          </div>
        )}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <RecordCard
          title="Repositories"
          description="GitHub repositories attached to this project. Nothing is pushed and no pull request is opened."
          empty="No repositories are attached."
          items={project.repositories.map((repository) => ({
            id: repository.id,
            title: repository.name,
            meta: [
              repository.ownerLogin,
              repository.defaultBranch,
              repository.private ? "Private" : "Public",
              repository.permission,
            ]
              .filter(Boolean)
              .join(" · "),
          }))}
          extra={available.length > 0 ? <AttachRepositoryForm projectId={project.id} repositories={available} /> : null}
        />
        <RecordCard
          title="Budget"
          description="The limit recorded with the plan. Nothing has been spent."
          empty="No budget is set."
          items={project.budgets.map((budget) => ({
            id: budget.id,
            title: formatUsd(budget.limitAmount),
            meta: `${budget.currency} · ${labelBudgetPeriod(budget.period)}`,
          }))}
        />
        <RecordCard
          title="Pull requests"
          description="A plan can include a pull request checklist. This phase does not open one."
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
  extra,
}: {
  title: string;
  description: string;
  empty: string;
  items: Array<{ id: string; title: string; meta: string; badge?: React.ReactNode }>;
  extra?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : null}
        {items.length > 0 ? (
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
        ) : null}
        {extra}
      </CardContent>
    </Card>
  );
}
