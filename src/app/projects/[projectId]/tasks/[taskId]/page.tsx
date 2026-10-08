import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { TaskStatusBadge } from "@/components/status-badge";
import { PanelSkeleton } from "@/components/states/panel-skeleton";
import { WorkspaceBody } from "@/components/states/workspace-body";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { labelOptimizationMode, labelRoutingOutcome, labelTaskDifficulty, labelTaskPriority, labelTaskType } from "@/lib/labels";
import { getPlannedTask, type PlannedTaskDetail } from "@/server/plan";

export const metadata = { title: "Task" };

export default function TaskPage({
  params,
}: {
  params: Promise<{ projectId: string; taskId: string }>;
}) {
  return (
    <Suspense fallback={<PanelSkeleton cards={2} />}>
      <TaskView params={params} />
    </Suspense>
  );
}

async function TaskView({
  params,
}: {
  params: Promise<{ projectId: string; taskId: string }>;
}) {
  const { projectId, taskId } = await params;
  const result = await getPlannedTask(projectId, taskId);
  if (result.status === "ready" && result.data === null) notFound();

  return (
    <WorkspaceBody status={result.status}>
      {result.status === "ready" && result.data ? <TaskBody task={result.data} /> : null}
    </WorkspaceBody>
  );
}

function TaskBody({ task }: { task: PlannedTaskDetail }) {

  const fields = [
    { label: "Type", value: labelTaskType(task.type) },
    { label: "Priority", value: labelTaskPriority(task.priority) },
    { label: "Difficulty", value: labelTaskDifficulty(task.difficulty) },
    { label: "Estimated complexity", value: `${task.complexity} of 5` },
    { label: "Id", value: task.planKey ?? task.id },
  ];

  return (
    <>
      <PageHeader
        eyebrow={task.projectName}
        title={task.title}
        description="This task is part of the plan. It has not been executed, and no model has been selected for it."
        actions={<TaskStatusBadge status={task.status} />}
      />
      <p className="mb-6 text-sm">
        <Link href={`/projects/${task.projectId}`} className="text-primary underline-offset-4 hover:underline">
          Back to the task graph
        </Link>
      </p>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Task</CardTitle>
            <CardDescription>{task.description ?? "No description was stored."}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <dl className="grid gap-3 sm:grid-cols-2">
              {fields.map((field) => (
                <div key={field.label}>
                  <dt className="text-xs tracking-[0.14em] text-muted-foreground uppercase">{field.label}</dt>
                  <dd className="mt-1 text-sm">{field.value}</dd>
                </div>
              ))}
            </dl>
            <section>
              <h2 className="text-sm font-medium">Expected output</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {task.expectedOutput || "No expected output was stored."}
              </p>
            </section>
            <section>
              <h2 className="text-sm font-medium">Verification criteria</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {task.verificationCriteria || "No verification criteria were stored."}
              </p>
            </section>
          </CardContent>
        </Card>
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Dependencies</CardTitle>
              <CardDescription>Work that must finish before this task can start.</CardDescription>
            </CardHeader>
            <CardContent>
              {task.dependencies.length === 0 ? (
                <p className="text-sm text-muted-foreground">This task starts the plan.</p>
              ) : (
                <ul className="grid gap-2">
                  {task.dependencies.map((dependency) => (
                    <li key={dependency.id}>
                      <Link
                        href={`/projects/${task.projectId}/tasks/${dependency.id}`}
                        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {dependency.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Model decision</CardTitle>
              <CardDescription>
                {task.decision
                  ? task.decision.estimateNote
                  : "No model has been chosen. Routing does not run the task or change a repository."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {task.decision ? (
                <>
                  <p className="text-sm">
                    {labelRoutingOutcome(task.decision.outcome)}
                    {task.decision.modelName ? ` · ${task.decision.modelName}` : ""}
                    {task.decision.modelSlug ? ` (${task.decision.modelSlug})` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {labelOptimizationMode(task.decision.mode)}
                    {task.decision.estimatedCostUsd ? ` · Estimated $${task.decision.estimatedCostUsd}` : ""}
                    {task.decision.successProbability !== null
                      ? ` · Success estimate ${Math.round(task.decision.successProbability * 100)}%`
                      : ""}
                  </p>
                  <ul className="grid gap-2">
                    {task.decision.factors.map((factor) => (
                      <li key={factor.name} className="text-sm leading-6">
                        {factor.detail}
                      </li>
                    ))}
                  </ul>
                  {task.decision.candidates.length > 0 ? (
                    <ul className="grid gap-2 border-t border-border pt-3">
                      {task.decision.candidates.map((candidate) => (
                        <li key={candidate.modelId} className="text-xs text-muted-foreground">
                          {candidate.displayName}
                          {candidate.eligible ? " · eligible" : ""}
                          {candidate.detail ? ` · ${candidate.detail}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Choose models from the project page to record a decision.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Context to open later</CardTitle>
              <CardDescription>
                Path hints for a future retrieval step. These files were not read while planning.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {task.context ? (
                <>
                  <p className="text-sm leading-6">{task.context.reason}</p>
                  {task.context.repositoryFullName ? (
                    <p className="text-xs text-muted-foreground">
                      {task.context.repositoryFullName}
                      {task.context.defaultBranch ? ` · ${task.context.defaultBranch}` : ""}
                    </p>
                  ) : null}
                  <ul className="flex flex-wrap gap-2">
                    {task.context.pathHints.map((hint) => (
                      <li key={hint}>
                        <Badge variant="outline">{hint}</Badge>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">This task has no file hints.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
