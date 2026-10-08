import { Badge } from "@/components/ui/badge";
import { labelProjectStatus, labelTaskStatus } from "@/lib/labels";

export function ProjectStatusBadge({ status }: { status: string }) {
  return <Badge variant={status === "ACTIVE" ? "default" : "secondary"}>{labelProjectStatus(status)}</Badge>;
}

export function TaskStatusBadge({ status }: { status: string }) {
  const variant = status === "FAILED" ? "destructive" : status === "COMPLETED" ? "default" : "outline";
  return <Badge variant={variant}>{labelTaskStatus(status)}</Badge>;
}
