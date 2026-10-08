import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PlanForm } from "@/components/projects/plan-form";
import { PanelSkeleton } from "@/components/states/panel-skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
        description="Describe the software change. The planner turns it into a task graph with dependencies, and then stops. It does not select a model, edit the repository, or open a pull request."
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan the work</CardTitle>
        <CardDescription>
          Savings keeps the graph short. Balanced follows the delivery order. Quality adds planning and documentation.
          The budget is recorded for a later phase.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PlanForm repositories={repositories} defaultRepositoryId={requested} />
      </CardContent>
    </Card>
  );
}
