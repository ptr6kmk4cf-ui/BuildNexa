import { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { ProjectStatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/states/empty-state";
import { PanelSkeleton } from "@/components/states/panel-skeleton";
import { WorkspaceBody } from "@/components/states/workspace-body";
import { excerpt, formatTimestamp } from "@/lib/format";
import { listProjects } from "@/server/workspace";

export const metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Projects"
        description="Plan a software change into a task graph. A connected repository can supply metadata. Nothing is executed or pushed from this screen."
        actions={
          <Link href="/projects/new" className={buttonVariants()}>
            New project
          </Link>
        }
      />
      <Suspense fallback={<PanelSkeleton cards={2} />}>
        <ProjectList />
      </Suspense>
    </>
  );
}

async function ProjectList() {
  const result = await listProjects();

  return (
    <WorkspaceBody status={result.status}>
      {result.status === "ready" && result.data.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Start with a goal, a budget, and an optimization mode. The planner writes the task graph and does not call a model."
        />
      ) : null}
      {result.status === "ready" && result.data.length > 0 ? (
        <ul className="grid gap-3">
          {result.data.map((project) => {
            const summary = excerpt(project.objective) ?? excerpt(project.description);
            return (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="block rounded-xl bg-card px-5 py-4 ring-1 ring-foreground/10 transition-colors hover:bg-accent"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="font-heading text-xl">{project.name}</h2>
                      {summary ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{summary}</p> : null}
                    </div>
                    <ProjectStatusBadge status={project.status} />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {project.taskCount} tasks · {project.repositoryCount} repositories · Updated{" "}
                    {formatTimestamp(project.updatedAt)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </WorkspaceBody>
  );
}
