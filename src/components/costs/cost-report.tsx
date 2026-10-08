import Link from "next/link";
import type { CostSummary } from "@/lib/budget";
import { formatUsd } from "@/lib/format";

export function CostReport({
  summary,
  projectHref,
  projectName,
}: {
  summary: CostSummary;
  projectHref?: string;
  projectName?: string;
}) {
  return (
    <div className="grid gap-4">
      {projectName ? (
        <h2 className="font-heading text-xl">
          {projectHref ? (
            <Link href={projectHref} className="hover:underline">
              {projectName}
            </Link>
          ) : (
            projectName
          )}
        </h2>
      ) : null}
      {summary.alert ? (
        <p role="status" className="rounded-lg border border-border px-3 py-2 text-sm">
          {summary.alert}
        </p>
      ) : null}
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Figure label="Total project cost" value={formatUsd(summary.actualUsd)} note="Provider charges recorded for this project." />
        <Figure label="Budget" value={summary.limitUsd ? formatUsd(summary.limitUsd) : "No budget"} note="The latest USD limit stored for this project." />
        <Figure
          label="Remaining"
          value={summary.remainingUsd === null ? "No budget" : formatUsd(summary.remainingUsd)}
          note={summary.limitUsd ? "Budget minus the recorded cost." : "No USD budget is stored."}
        />
        <Figure label="Retry cost" value={formatUsd(summary.retryUsd)} note="Calls after the first try of the same model." />
        <Figure label="Escalation cost" value={formatUsd(summary.escalationUsd)} note="Calls sent to a different model." />
      </dl>
      <h3 className="font-heading text-lg">Savings comparison</h3>
      <dl className="grid gap-3 sm:grid-cols-2">
        <Figure
          label="Actual cost"
          value={formatUsd(summary.comparison.actualUsd)}
          note="The provider total above. This figure is measured."
        />
        <Figure
          label="Estimated baseline"
          value={summary.comparison.estimatedBaselineUsd ? formatUsd(summary.comparison.estimatedBaselineUsd) : "Not available"}
          note={summary.comparison.baselineNote}
        />
        <Figure
          label="Projected savings"
          value={summary.comparison.projectedSavingsUsd ? formatUsd(summary.comparison.projectedSavingsUsd) : "Not available"}
          note="Estimated difference between the baseline replay and the actual cost. It is not a measured saving."
        />
        <Figure label="Measured savings" value="Not measured" note={summary.comparison.measuredNote} />
      </dl>
      <div className="grid gap-4 lg:grid-cols-3">
        <Group title="Cost per task" rows={summary.byTask} empty="No task charges yet." />
        <Group title="Cost per model" rows={summary.byModel} empty="No model charges yet." />
        <Group title="Cost per provider" rows={summary.byProvider} empty="No provider charges yet." />
      </div>
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-heading text-2xl tabular-nums">{value}</dd>
      <dd className="mt-2 text-xs leading-5 text-muted-foreground">{note}</dd>
    </div>
  );
}

function Group({ title, rows, empty }: { title: string; rows: CostSummary["byTask"]; empty: string }) {
  return (
    <section className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
      <h3 className="text-sm font-medium">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate">{row.label}</span>
              <span className="tabular-nums text-muted-foreground">{formatUsd(row.amountUsd)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
