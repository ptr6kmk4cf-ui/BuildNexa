import { Suspense } from "react";
import { MissingProject } from "@/components/projects/missing-project";
import { ProjectWorkspace } from "@/components/projects/project-workspace";
import { PanelSkeleton } from "@/components/states/panel-skeleton";
import { WorkspaceBody } from "@/components/states/workspace-body";
import { githubNotice } from "@/lib/github/messages";
import { getProject } from "@/server/workspace";

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
      {notice ? <p role="status" className="mb-4 rounded-lg border border-border bg-card px-4 py-3 text-sm">{notice}</p> : null}
      {result.status === "ready" && result.data ? <ProjectWorkspace project={result.data} /> : null}
    </WorkspaceBody>
  );
}
