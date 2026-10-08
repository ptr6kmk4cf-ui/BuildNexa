import Link from "next/link";
import { EmptyState } from "@/components/states/empty-state";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState
      title="That page is not in this workspace"
      description="The link may be outdated, or the project record is not in the database."
      action={
        <Link href="/" className={buttonVariants()}>
          Back to dashboard
        </Link>
      }
    />
  );
}
