import Link from "next/link";
import { EmptyState } from "@/components/states/empty-state";

export function SignedOutState() {
  return (
    <EmptyState
      title="Connect GitHub to see your workspace"
      description="Projects, costs, and activity are limited to the signed-in account. In local development, planning a project stores it for the local operator, and this page then shows that operator's records."
      action={
        <Link href="/github" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          GitHub connection
        </Link>
      }
    />
  );
}
