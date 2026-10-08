import Link from "next/link";
import { EmptyState } from "@/components/states/empty-state";

export default function TaskNotFound() {
  return (
    <EmptyState
      title="That task is not on this project"
      description="The plan may have been removed, or the address is wrong."
      action={
        <Link href="/projects" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Back to projects
        </Link>
      }
    />
  );
}
