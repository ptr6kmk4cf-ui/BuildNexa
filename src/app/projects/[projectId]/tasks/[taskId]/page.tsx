import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { TaskStatusBadge } from "@/components/status-badge";
import { PanelSkeleton } from "@/components/states/panel-skeleton";
import { WorkspaceBody } from "@/components/states/workspace-body";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { labelExecutionState, labelOptimizationMode, labelRoutingOutcome, labelTaskDifficulty, labelTaskPriority, labelTaskType, labelVerificationOutcome } from "@/lib/labels";
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
        description={
          task.execution
            ? "The stored reply came from the selected model. It was not run as a command, and the repository was not changed."
            : "This task is part of the plan. Run it from the project page after a model has been chosen."
        }
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
                    {successEstimateLabel(task.decision.successProbability)}
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
                        <li key={`${candidate.provider}:${candidate.modelId}`} className="text-xs text-muted-foreground">
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
              <CardTitle>Execution</CardTitle>
              <CardDescription>
                {task.execution
                  ? "Tokens, cost, and the stored reply from the latest run."
                  : "No run is stored yet. A model reply is not treated as success until the project checks pass."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {task.execution ? (
                <>
                  <p className="text-sm">
                    {labelExecutionState(task.execution.state)}
                    {task.execution.escalated ? " · Escalated" : ""}
                    {task.execution.modelName ? ` · ${task.execution.modelName}` : ""}
                    {task.execution.modelSlug ? ` (${task.execution.modelSlug})` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {task.execution.provider ? `${task.execution.provider} · ` : ""}
                    {countPhrase(task.execution.attemptCount, "attempt", "attempts")} · {task.execution.durationMs} ms · {countPhrase(task.execution.inputTokens, "input token", "input tokens")} · {countPhrase(task.execution.outputTokens, "output token", "output tokens")}
                    {task.execution.estimatedCostUsd ? ` · Estimated $${task.execution.estimatedCostUsd}` : ""}
                    {task.execution.actualCostUsd ? ` · Actual $${task.execution.actualCostUsd}` : ""}
                  </p>
                  {task.execution.error ? <p className="text-sm text-destructive">{task.execution.error}</p> : null}
                  {task.execution.ignoredCommand ? (
                    <p className="text-sm text-muted-foreground">The reply looked like a shell command. It was stored and not run.</p>
                  ) : null}
                  {task.execution.result ? (
                    <p className="text-sm leading-6 whitespace-pre-wrap">{task.execution.result}</p>
                  ) : null}
                  {task.execution.logs.length > 0 ? (
                    <ul className="grid gap-2 border-t border-border pt-3">
                      {task.execution.logs.map((entry) => (
                        <li key={entry.id} className="text-xs text-muted-foreground">
                          {labelExecutionState(entry.state)} · {entry.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Run tasks from the project page to call the selected model.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Verification</CardTitle>
              <CardDescription>
                {task.verifications.length > 0
                  ? "Independent project checks. A model reply is not enough to call the task complete."
                  : "No verification is stored yet. Tests, lint, type checking, and the production build run from the project configuration."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {task.verifications.length === 0 ? (
                <p className="text-sm text-muted-foreground">Run tasks from the project page. The checks use the scripts in this project, not commands from the model.</p>
              ) : (
                task.verifications.map((verification, index) => (
                  <section key={verification.id} className="grid gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0">
                    <p className="text-sm">
                      Attempt {index + 1}
                      {verification.outcome ? ` · ${labelVerificationOutcome(verification.outcome)}` : ""}
                      {verification.durationMs !== null ? ` · ${verification.durationMs} ms` : ""}
                      {verification.costUsd ? ` · $${verification.costUsd}` : ""}
                    </p>
                    {verification.summary ? <p className="text-sm leading-6 text-muted-foreground">{verification.summary}</p> : null}
                    {verification.errors ? <p className="text-sm text-destructive whitespace-pre-wrap">{verification.errors}</p> : null}
                    {verification.stopReason ? <p className="text-sm">Stopped because {verification.stopReason}</p> : null}
                    {verification.checks.map((check) => (
                      <div key={check.id} className="grid gap-1 rounded-lg border border-border px-3 py-2">
                        <p className="text-xs text-muted-foreground">
                          {labelVerificationOutcome(check.outcome)} · {check.command}
                          {check.exitCode === null ? "" : ` · exit ${check.exitCode}`} · {check.durationMs} ms
                        </p>
                        {check.errors ? <p className="text-sm text-destructive whitespace-pre-wrap">{check.errors}</p> : null}
                        {check.output ? <p className="text-xs leading-5 whitespace-pre-wrap text-muted-foreground">{check.output}</p> : null}
                      </div>
                    ))}
                  </section>
                ))
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

function successEstimateLabel(probability: number | null): string {
  if (probability === null || !Number.isFinite(probability)) return "";
  return ` · Success estimate ${Math.round(probability * 100)}%`;
}

function countPhrase(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
