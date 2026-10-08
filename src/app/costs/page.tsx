import { Suspense } from "react";
import Link from "next/link";
import { CostReport } from "@/components/costs/cost-report";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { PanelSkeleton } from "@/components/states/panel-skeleton";
import { WorkspaceBody } from "@/components/states/workspace-body";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTimestamp, formatUsd } from "@/lib/format";
import { labelBudgetPeriod } from "@/lib/labels";
import { getCosts } from "@/server/workspace";

export const metadata = { title: "Costs" };

export default function CostsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Spend"
        title="Costs"
        description="Actual provider charges are kept apart from estimated baselines. A comparison is labeled as an estimate unless a premium run was really executed. This page does not call a provider."
      />
      <Suspense fallback={<PanelSkeleton cards={2} />}>
        <CostPanel />
      </Suspense>
    </>
  );
}

async function CostPanel() {
  const result = await getCosts();

  return (
    <WorkspaceBody status={result.status}>
      {result.status === "ready" ? (
        <div className="grid gap-6">
          <section className="grid gap-3 sm:grid-cols-2">
            <Card size="sm">
              <CardHeader>
                <CardDescription>Actual cost</CardDescription>
                <CardTitle className="font-heading text-3xl tabular-nums">{formatUsd(result.data.totalUsd)}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{result.data.recordCount} cost records, USD provider charges only.</p>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardDescription>Budgets</CardDescription>
                <CardTitle className="font-heading text-3xl tabular-nums">{result.data.budgets.length}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Each limit keeps a reserve for retries, debugging, escalation, and verification.</p>
              </CardContent>
            </Card>
          </section>
          {result.data.projects.length === 0 && result.data.recent.length === 0 ? (
            <EmptyState
              title="No spend has been recorded"
              description="Plan a project with a budget, then run its tasks. Charges appear here after a priced model call. Local project checks are stored with a zero provider charge."
            />
          ) : (
            <>
              {result.data.projects.map((project) => (
                <CostReport
                  key={project.projectId}
                  summary={project}
                  projectName={project.projectName}
                  projectHref={`/projects/${project.projectId}`}
                />
              ))}
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Budgets</CardTitle>
                    <CardDescription>The ceiling a project is allowed to spend.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {result.data.budgets.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No budgets yet.</p>
                    ) : (
                      <ul className="grid gap-3">
                        {result.data.budgets.map((budget) => (
                          <li key={budget.id} className="flex items-center justify-between gap-3 text-sm">
                            <Link href={`/projects/${budget.projectId}`} className="font-medium hover:underline">
                              {budget.projectName}
                            </Link>
                            <span className="text-muted-foreground">
                              {formatUsd(budget.limitAmount)} · {labelBudgetPeriod(budget.period)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Recent charges</CardTitle>
                    <CardDescription>Individual cost records, newest first.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {result.data.recent.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No charges yet.</p>
                    ) : (
                      <ul className="grid gap-3">
                        {result.data.recent.map((record) => (
                          <li key={record.id} className="flex items-center justify-between gap-3 text-sm">
                            <span>
                              {record.projectName}
                              <span className="text-muted-foreground"> · {record.kind.toLowerCase()}</span>
                            </span>
                            <span className="text-muted-foreground">
                              {record.currency === "USD" ? formatUsd(record.amount) : `${record.amount} ${record.currency}`}
                              {" · "}
                              {formatTimestamp(record.createdAt)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      ) : null}
    </WorkspaceBody>
  );
}
