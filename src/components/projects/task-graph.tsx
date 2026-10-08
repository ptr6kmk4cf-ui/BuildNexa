import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { groupByDependencyDepth } from "@/lib/planner";
import { labelTaskPriority, labelTaskType } from "@/lib/labels";

export type GraphTask = {
  id: string;
  planKey: string | null;
  title: string;
  type: string;
  priority: string;
  complexity: number;
  dependsOn: string[];
  modelLabel?: string | null;
};

export function TaskGraph({ projectId, tasks }: { projectId: string; tasks: GraphTask[] }) {
  const levels = groupByDependencyDepth(
    tasks.map((task) => ({ ...task, dependencies: task.dependsOn })),
  );

  return (
    <ol className="grid gap-2" aria-label="Task plan">
      {levels.map((level, index) => (
        <li key={level.map((task) => task.id).join("-")} className="grid gap-2">
          {index > 0 ? (
            <p aria-hidden="true" className="text-center text-lg leading-none text-muted-foreground">
              ↓
            </p>
          ) : null}
          <ul className={level.length > 1 ? "grid gap-3 sm:grid-cols-2" : "mx-auto grid w-full max-w-xl gap-3"}>
            {level.map((task) => (
              <li key={task.id}>
                <Link
                  href={`/projects/${projectId}/tasks/${task.id}`}
                  className="block h-full rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-accent"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{task.title}</span>
                    <Badge variant="outline">{labelTaskType(task.type)}</Badge>
                  </span>
                  <span className="mt-2 block text-xs text-muted-foreground">
                    {labelTaskPriority(task.priority)} priority · Complexity {task.complexity} of 5
                    {task.modelLabel ? ` · ${task.modelLabel}` : ""}
                    {task.planKey ? ` · ${task.planKey}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
