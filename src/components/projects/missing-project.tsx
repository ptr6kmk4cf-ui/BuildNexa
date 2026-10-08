import Link from "next/link";
import { EmptyState } from "@/components/states/empty-state";
import { buttonVariants } from "@/components/ui/button";

export function MissingProject() {
  return (
    <EmptyState
      title="This project is not on record"
      description="The id does not match a project in the database, or the address is not a valid record id."
      action={
        <Link href="/projects" className={buttonVariants()}>
          All projects
        </Link>
      }
    />
  );
}
