import Link from "next/link";
import { AttachRepositoryForm } from "@/components/github/attach-repository-form";
import { PageHeader } from "@/components/layout/page-header";
import { CostReport } from "@/components/costs/cost-report";
import { LiveRefresh } from "@/components/projects/live-refresh";
import { RouteTasksForm } from "@/components/projects/route-tasks-form";
import { RunTasksForm } from "@/components/projects/run-tasks-form";
import { TaskGraph } from "@/components/projects/task-graph";
import { ProjectStatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isProviderId, providerLabel } from "@/lib/ai/types";
import { excerpt, formatTimestamp, formatUsd } from "@/lib/format";
import { labelBudgetPeriod, labelExecutionState, labelOptimizationMode, labelPullRequestStatus } from "@/lib/labels";
import { addMoney } from "@/lib/routing/money";
import { listRepositoryOptions } from "@/server/github";
import type { ProjectDetail } from "@/server/workspace";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "tasks", label: "Tasks" },
  { id: "execution", label: "Execution" },
  { id: "costs", label: "Costs" },
  { id: "models", label: "Models" },
  { id: "pull-requests", label: "Pull Requests" },
  { id: "logs", label: "Logs" },
] as const;

export async function ProjectWorkspace({ project }: { project: ProjectDetail }) {
  const linked = new Set(
    project.repositories.map((repository) => repository.githubRepoId).filter((id): id is string => Boolean(id)),
  );
  const available = (await listRepositoryOptions()).filter(
    (repository) => !repository.githubRepoId || !linked.has(repository.githubRepoId),
  );
  const running = project.runs.some((run) => run.active);
  const models = modelRows(project);

  return (
    <>
      <PageHeader
        eyebrow={project.slug}
        title={project.name}
        description={project.description ?? excerpt(project.objective, 200) ?? "No description yet."}
        actions={<ProjectStatusBadge status={project.status} />}
      />
      <nav aria-label="Project sections" className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="shrink-0 rounded-full border border-border px-3 py-1 text-sm hover:bg-accent"
          >
            {section.label}
          </a>
        ))}
      </nav>
      <LiveRefresh active={running} />

      <section id="overview" className="mt-6 scroll-mt-6 grid gap-4">
        <h2 className="font-heading text-xl">Overview</h2>
        <div className="rounded-xl border border-border bg-card px-5 py-4">
          <h3 className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">Objective</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 whitespace-pre-wrap">
            {project.objective ?? "No objective has been written for this project."}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            {labelOptimizationMode(project.optimizationMode)} · Created {formatTimestamp(project.createdAt)} · Updated{" "}
            {formatTimestamp(project.updatedAt)}
          </p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Tasks" value={String(project.tasks.length)} />
          <Stat label="Budget" value={project.spend.limitUsd ? formatUsd(project.spend.limitUsd) : "No budget"} />
          <Stat label="Total project cost" value={formatUsd(project.spend.actualUsd)} />
          <Stat label="Remaining" value={project.spend.remainingUsd === null ? "No budget" : formatUsd(project.spend.remainingUsd)} />
        </dl>
        <Card>
          <CardHeader>
            <CardTitle>Repositories</CardTitle>
            <CardDescription>GitHub repositories attached to this project.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {project.repositories.length === 0 ? (
              <p className="text-sm text-muted-foreground">No repositories are attached.</p>
            ) : (
              <ul className="grid gap-3">
                {project.repositories.map((repository) => (
                  <li key={repository.id}>
                    <p className="text-sm font-medium">{repository.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[repository.ownerLogin, repository.defaultBranch, repository.private ? "Private" : "Public", repository.permission]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {available.length > 0 ? <AttachRepositoryForm projectId={project.id} repositories={available} /> : null}
          </CardContent>
        </Card>
      </section>

      <section id="tasks" className="mt-10 scroll-mt-6 grid gap-4">
        <h2 className="font-heading text-xl">Tasks</h2>
        <p className="text-sm text-muted-foreground">
          <span aria-hidden="true">✓ </span>completed
          <span aria-hidden="true"> · ● </span>running
          <span aria-hidden="true"> · ○ </span>queued
          <span aria-hidden="true"> · ⚠ </span>failed
          <span aria-hidden="true"> · ↗ </span>escalated
        </p>
        {project.tasks.length === 0 ? (
          <EmptyState
            title="No tasks yet"
            description="Plan a project from the new project screen. Planning records the task graph and does not call a model."
            action={
              <Link href="/projects/new" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                Plan a project
              </Link>
            }
          />
        ) : (
          <>
            {project.plan ? <p className="max-w-3xl text-sm leading-6">{project.plan.summary}</p> : null}
            <TaskGraph
              projectId={project.id}
              tasks={project.tasks.map((task) => ({
                id: task.id,
                planKey: task.planKey,
                title: task.title,
                type: task.type,
                status: task.status,
                priority: task.priority,
                complexity: task.complexity,
                dependsOn: task.dependsOn,
                modelLabel: task.routing?.modelName ?? (task.routing ? "No model" : null),
                executionState: task.execution?.state ?? null,
                escalated: task.execution?.escalated ?? false,
              }))}
              runActive={running}
            />
          </>
        )}
      </section>

      <section id="execution" className="mt-10 scroll-mt-6 grid gap-4">
        <h2 className="font-heading text-xl">Execution</h2>
        {project.tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">There is nothing to run until the project has tasks.</p>
        ) : (
          <RunTasksForm projectId={project.id} />
        )}
        {project.runs.length === 0 ? (
          <EmptyState title="No runs yet" description="Start a run from this section after a model has been chosen for the tasks." />
        ) : (
          <ul className="grid gap-2">
            {project.runs.map((run) => (
              <li key={run.id} className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
                <span className="font-medium">
                  {run.status === "RUNNING" && !run.active ? "Interrupted" : labelExecutionState(run.status)}
                </span>
                {run.cancelRequested ? " · Cancel requested" : ""}
                <span className="mt-1 block text-xs text-muted-foreground">
                  Started {formatTimestamp(run.createdAt)}
                  {run.finishedAt ? ` · Finished ${formatTimestamp(run.finishedAt)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        {project.tasks.length > 0 ? (
          <RouteTasksForm projectId={project.id} hasDecisions={project.tasks.some((task) => task.routing)} />
        ) : null}
      </section>

      <section id="costs" className="mt-10 scroll-mt-6 grid gap-4">
        <h2 className="font-heading text-xl">Costs</h2>
        <p className="text-sm text-muted-foreground">
          {project.budgets[0]
            ? `${formatUsd(project.budgets[0].limitAmount)} · ${project.budgets[0].currency} · ${labelBudgetPeriod(project.budgets[0].period)}`
            : "No budget is set."}
        </p>
        {project.spend.actualUsd === "0" && !project.spend.limitUsd ? (
          <EmptyState title="No cost records" description="A finished model call writes its actual cost here." />
        ) : (
          <CostReport summary={project.spend} />
        )}
      </section>

      <section id="models" className="mt-10 scroll-mt-6 grid gap-4">
        <h2 className="font-heading text-xl">Models</h2>
        {models.length === 0 ? (
          <EmptyState title="No model chosen" description="Choose models from Execution. Routing records the decision and does not call the model." />
        ) : (
          <ul className="grid gap-2">
            {models.map((model) => (
              <li key={model.key} className="rounded-xl border border-border bg-card px-4 py-3">
                <p className="text-sm font-medium">{model.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {model.provider} · {model.tasks} {model.tasks === 1 ? "task" : "tasks"}
                  {model.estimated ? ` · Estimated ${formatUsd(model.estimated)}` : ""}
                  {model.actual ? ` · Actual ${formatUsd(model.actual)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="pull-requests" className="mt-10 scroll-mt-6 grid gap-4">
        <h2 className="font-heading text-xl">Pull Requests</h2>
        {project.pullRequests.length === 0 ? (
          <EmptyState
            title="No pull requests"
            description="Pull request status appears here when a pull request is recorded for this project. This workspace does not open one on its own."
          />
        ) : (
          <ul className="grid gap-2">
            {project.pullRequests.map((pullRequest) => (
              <li key={pullRequest.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
                <div>
                  <p className="text-sm font-medium">
                    {pullRequest.externalNumber ? `#${pullRequest.externalNumber} ` : ""}
                    {pullRequest.title}
                  </p>
                  {pullRequest.url ? (
                    <a href={pullRequest.url} className="text-xs text-primary underline-offset-4 hover:underline">
                      Open on GitHub
                    </a>
                  ) : null}
                </div>
                <Badge variant="outline">{labelPullRequestStatus(pullRequest.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="logs" className="mt-10 scroll-mt-6 grid gap-4">
        <h2 className="font-heading text-xl">Logs</h2>
        {project.logs.length === 0 ? (
          <EmptyState title="No logs yet" description="Run tasks to record each attempt, check, and stop reason." />
        ) : (
          <ol className="grid gap-2">
            {project.logs.map((entry) => (
              <li key={entry.id} className="rounded-xl border border-border bg-card px-4 py-3">
                <p className="text-sm">
                  <Link href={`/projects/${project.id}/tasks/${entry.taskId}`} className="font-medium text-primary underline-offset-4 hover:underline">
                    {entry.taskTitle}
                  </Link>
                  {" · "}
                  {labelExecutionState(entry.state)}
                  {entry.attempt > 0 ? ` · Attempt ${entry.attempt}` : ""}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{entry.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatTimestamp(entry.createdAt)}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <dt className="text-xs tracking-[0.14em] text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 font-heading text-2xl tabular-nums">{value}</dd>
    </div>
  );
}

function modelRows(project: ProjectDetail) {
  const rows = new Map<string, { key: string; name: string; provider: string; tasks: number; estimated: string[]; actual: string[] }>();
  for (const task of project.tasks) {
    const source = task.execution?.modelName || task.execution?.modelSlug ? task.execution : task.routing;
    if (!source?.modelName && !source?.modelSlug) continue;
    const providerId = source.provider;
    const provider = providerId && isProviderId(providerId) ? providerLabel(providerId) : providerId ?? "Unknown provider";
    const name = source.modelName ?? source.modelSlug ?? "Model";
    const key = `${provider}:${source.modelSlug ?? name}`;
    const current = rows.get(key) ?? { key, name, provider, tasks: 0, estimated: [], actual: [] };
    current.tasks += 1;
    if (task.routing?.estimatedCostUsd) current.estimated.push(task.routing.estimatedCostUsd);
    if (task.execution?.actualCostUsd) current.actual.push(task.execution.actualCostUsd);
    rows.set(key, current);
  }
  return [...rows.values()].map((row) => ({
    key: row.key,
    name: row.name,
    provider: row.provider,
    tasks: row.tasks,
    estimated: row.estimated.length > 0 ? addMoney(row.estimated) : null,
    actual: row.actual.length > 0 ? addMoney(row.actual) : null,
  }));
}
