import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PlanWizard } from "@/components/projects/plan-wizard";
import { PanelSkeleton } from "@/components/states/panel-skeleton";
import { listRepositoryOptions } from "@/server/github";
import { idSchema } from "@/lib/validation";

export const metadata = { title: "New project" };

export default function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ repository?: string }>;
}) {
  return (
    <>
      <PageHeader
        eyebrow="Planner"
        title="New project"
        description="Connect a repository, describe the objective, choose a budget and a mode, review the plan, then start."
      />
      <Suspense fallback={<PanelSkeleton cards={1} />}>
        <NewProjectForm searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function NewProjectForm({
  searchParams,
}: {
  searchParams: Promise<{ repository?: string }>;
}) {
  const query = await searchParams;
  const requested = idSchema.safeParse(query.repository).success ? query.repository : undefined;
  const repositories = await listRepositoryOptions();

  return <PlanWizard repositories={repositories} defaultRepositoryId={requested} />;
}
