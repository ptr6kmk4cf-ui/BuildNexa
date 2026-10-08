import { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { PanelSkeleton } from "@/components/states/panel-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { describePermissions } from "@/lib/github/permissions";
import { repositoryDetailForCurrentUser } from "@/server/github";
import { idSchema } from "@/lib/validation";

export const metadata = { title: "Repository" };

export default function RepositoryPage({
  params,
}: {
  params: Promise<{ repositoryId: string }>;
}) {
  return (
    <Suspense fallback={<PanelSkeleton cards={2} />}>
      <RepositoryView params={params} />
    </Suspense>
  );
}

async function RepositoryView({ params }: { params: Promise<{ repositoryId: string }> }) {
  const { repositoryId } = await params;
  if (!idSchema.safeParse(repositoryId).success) {
    return <MissingRepository />;
  }
  const detail = await repositoryDetailForCurrentUser(repositoryId);
  if (!detail) return <MissingRepository />;

  const { repository, account } = detail;
  const rows = [
    { label: "Owner", value: repository.ownerLogin },
    { label: "Repository", value: repository.name },
    { label: "Full name", value: repository.fullName },
    { label: "Default branch", value: repository.defaultBranch },
    { label: "Repository id", value: repository.githubRepoId },
    { label: "Visibility", value: repository.private ? "Private" : "Public" },
    { label: "Permissions", value: describePermissions(repository.permissions) },
    { label: "Account", value: `${account.login} (${account.accountType})` },
    { label: "Account id", value: account.githubUserId },
    { label: "Installation", value: account.installationId ?? "Not sent by GitHub" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Repository"
        title={repository.fullName}
        description={repository.description ?? "No description was returned by GitHub."}
        actions={
          <Link href={`/github?repository=${repository.id}`} className={buttonVariants()}>
            Use for a project
          </Link>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            {rows.map((row) => (
              <div key={row.label}>
                <dt className="text-xs tracking-[0.14em] text-muted-foreground uppercase">{row.label}</dt>
                <dd className="mt-1 text-sm">{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm">
            <a className="underline underline-offset-4" href={repository.htmlUrl}>
              Open on GitHub
            </a>
          </p>
        </CardContent>
      </Card>
    </>
  );
}

function MissingRepository() {
  return (
    <EmptyState
      title="This repository is not on your connection"
      description="It is missing, the id is not valid, or it belongs to a different GitHub account."
      action={
        <Link href="/github" className={buttonVariants()}>
          GitHub
        </Link>
      }
    />
  );
}
