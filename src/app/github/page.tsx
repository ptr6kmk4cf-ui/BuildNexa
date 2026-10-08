import { Suspense } from "react";
import Link from "next/link";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { SetupHint } from "@/components/states/setup-hint";
import { PanelSkeleton } from "@/components/states/panel-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { describePermissions } from "@/lib/github/permissions";
import { githubErrorMessage, githubNotice } from "@/lib/github/messages";
import { disconnectGithub, refreshGithubRepositories } from "@/server/actions/github";
import { loadGithubPage } from "@/server/github";
import { idSchema } from "@/lib/validation";

export const metadata = { title: "GitHub" };

export default function GithubPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; repository?: string }>;
}) {
  return (
    <Suspense fallback={<PanelSkeleton cards={3} />}>
      <GithubPanel searchParams={searchParams} />
    </Suspense>
  );
}

async function GithubPanel({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; repository?: string }>;
}) {
  const query = await searchParams;
  const page = await loadGithubPage();
  const error = githubErrorMessage(query.error);
  const notice = githubNotice(query.notice);
  const selected = idSchema.safeParse(query.repository).success ? query.repository : undefined;
  const repositoryChoices = page.repositories.map((repository) => ({
    id: repository.id,
    fullName: repository.fullName,
    defaultBranch: repository.defaultBranch,
    private: repository.private,
    githubRepoId: repository.githubRepoId,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Source"
        title="GitHub"
        description="Connect an account, choose a repository you can access, and attach it to a project. This phase only reads repository metadata. It does not create branches, push commits, or open pull requests."
        actions={
          page.account ? (
            <CreateProjectDialog repositories={repositoryChoices} defaultRepositoryId={selected} />
          ) : null
        }
      />
      {error ? (
        <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mb-4 rounded-lg border border-border bg-card px-4 py-3 text-sm">{notice}</p>
      ) : null}

      {page.setup.status === "disabled" ? <DisabledGithub /> : null}
      {page.setup.status === "incomplete" ? <IncompleteGithub missing={page.setup.missing} issues={page.setup.issues} /> : null}
      {page.setup.status === "ready" && !page.databaseConfigured ? <DatabaseRequired /> : null}
      {page.setup.status === "ready" && page.databaseConfigured && !page.account ? <ConnectGithub /> : null}
      {page.account ? (
        <ConnectedGithub
          login={page.account.login}
          accountType={page.account.accountType}
          githubUserId={page.account.githubUserId}
          installationId={page.account.installationId}
          scopes={page.account.scopes}
          repositories={page.repositories}
        />
      ) : null}
    </>
  );
}

function DisabledGithub() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>GitHub is not configured</CardTitle>
        <CardDescription>
          The app runs without a GitHub app. Add server environment variables when you want the
          connect button to reach GitHub. No token is stored until authorization succeeds.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Create a GitHub OAuth app. Set the callback URL to the value of GITHUB_CALLBACK_URL.</li>
          <li>
            The local default is{" "}
            <code className="font-mono text-xs text-foreground">http://127.0.0.1:43123/api/github/callback</code>.
          </li>
          <li>Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, APP_SECRET, and TOKEN_ENCRYPTION_KEY on the server.</li>
          <li>Apply the database migration, then use Connect GitHub.</li>
        </ol>
      </CardContent>
    </Card>
  );
}

function IncompleteGithub({ missing, issues }: { missing: string[]; issues: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>GitHub configuration is incomplete</CardTitle>
        <CardDescription>
          Authorization stays disabled so a partial setup cannot store a token.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        {missing.length > 0 ? <p>Missing: {missing.join(", ")}</p> : null}
        {issues.map((issue) => (
          <p key={issue}>{issue}</p>
        ))}
      </CardContent>
    </Card>
  );
}

function DatabaseRequired() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>PostgreSQL is required to save a connection</CardTitle>
        <CardDescription>
          GitHub credentials are present, but there is nowhere to store the encrypted token yet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SetupHint />
      </CardContent>
    </Card>
  );
}

function ConnectGithub() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No GitHub account connected</CardTitle>
        <CardDescription>
          You will be sent to GitHub to approve read access to your account and repositories. The
          access token stays on the server, encrypted, and is never sent to the browser.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <a className={buttonVariants()} href="/api/github/connect">
          Connect GitHub
        </a>
      </CardContent>
    </Card>
  );
}

function ConnectedGithub({
  login,
  accountType,
  githubUserId,
  installationId,
  scopes,
  repositories,
}: {
  login: string;
  accountType: string;
  githubUserId: string;
  installationId: string | null;
  scopes: string[];
  repositories: Array<{
    id: string;
    fullName: string;
    ownerLogin: string;
    name: string;
    defaultBranch: string;
    private: boolean;
    permissions: { admin: boolean; maintain: boolean; push: boolean; triage: boolean; pull: boolean };
    githubRepoId: string;
  }>;
}) {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Connected account</CardTitle>
          <CardDescription>
            {login} · {accountType} · GitHub id {githubUserId}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Detail label="Installation" value={installationId ?? "OAuth account, no installation id"} />
            <Detail label="Scopes" value={scopes.length > 0 ? scopes.join(", ") : "None reported"} />
          </dl>
          <div className="flex flex-wrap gap-2">
            <form action={refreshGithubRepositories}>
              <Button type="submit" variant="outline">
                Refresh repositories
              </Button>
            </form>
            <form action={disconnectGithub}>
              <Button type="submit" variant="destructive">
                Disconnect GitHub
              </Button>
            </form>
          </div>
          <p className="text-sm text-muted-foreground">
            Disconnect deletes the encrypted token and the cached repository list. Projects keep the
            name and branch already recorded.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Connected repositories</CardTitle>
          <CardDescription>
            Repositories this authorization can access. Open one for owner, id, branch, and permissions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {repositories.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No repositories are cached yet. Refresh to ask GitHub again.
            </p>
          ) : (
            <ul className="grid gap-3">
              {repositories.map((repository) => (
                <li key={repository.id} className="rounded-lg border border-border px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <Link href={`/github/repositories/${repository.id}`} className="text-sm font-medium hover:underline">
                        {repository.fullName}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {repository.ownerLogin} / {repository.name} · {repository.defaultBranch} ·{" "}
                        {repository.private ? "Private" : "Public"} · {describePermissions(repository.permissions)}
                      </p>
                    </div>
                    <Link
                      href={`/github?repository=${repository.id}`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Use for a project
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs tracking-[0.14em] text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  );
}
