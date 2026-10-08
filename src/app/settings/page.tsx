import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PanelSkeleton } from "@/components/states/panel-skeleton";
import { SetupHint } from "@/components/states/setup-hint";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LOCAL_OPERATOR_NAME } from "@/lib/constants";
import { loadGithubPage } from "@/server/github";
import { getSettings } from "@/server/workspace";

export const metadata = { title: "Settings" };

const databaseLabel = {
  ok: "Connected",
  unconfigured: "Not configured",
  unavailable: "Configured, but unreachable",
} as const;

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        eyebrow="System"
        title="Settings"
        description="Runtime status for this workspace. Connection strings and other secrets stay on the server and are never rendered here."
      />
      <Suspense fallback={<PanelSkeleton cards={2} />}>
        <SettingsPanel />
      </Suspense>
    </>
  );
}

async function SettingsPanel() {
  const [settings, github] = await Promise.all([getSettings(), loadGithubPage()]);
  const githubStatus =
    github.setup.status === "disabled"
      ? "Not configured"
      : github.setup.status === "incomplete"
        ? "Incomplete configuration"
        : github.account
          ? `Connected as ${github.account.login}`
          : "Not connected";

  const rows = [
    { label: "Phase", value: "2, GitHub connection" },
    { label: "Database", value: databaseLabel[settings.database] },
    { label: "GitHub", value: githubStatus },
    { label: "Log level", value: settings.logLevel },
    { label: "Node environment", value: settings.nodeEnv },
    { label: "Workspace operator", value: `${LOCAL_OPERATOR_NAME} (${settings.operatorEmail})` },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <Card>
        <CardHeader>
          <CardTitle>Runtime</CardTitle>
          <CardDescription>
            GitHub OAuth identifies the connected account. Tokens stay on the server. Projects
            created before a connection still belong to the local operator.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4">
            {rows.map((row) => (
              <div key={row.label} className="grid gap-1 border-b border-border pb-3 last:border-0 last:pb-0">
                <dt className="text-xs tracking-[0.14em] text-muted-foreground uppercase">{row.label}</dt>
                <dd className="text-sm">{row.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Database setup</CardTitle>
          <CardDescription>
            Leave DATABASE_URL unset to keep using local mode. Set it only on the server.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SetupHint />
        </CardContent>
      </Card>
    </div>
  );
}
