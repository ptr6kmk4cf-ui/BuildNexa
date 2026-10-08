import { UnavailableState } from "@/components/states/unavailable-state";
import { UnconfiguredState } from "@/components/states/unconfigured-state";

export function WorkspaceBody({
  status,
  unconfigured,
  children,
}: {
  status: "ready" | "unconfigured" | "unavailable";
  unconfigured?: React.ReactNode;
  children: React.ReactNode;
}) {
  if (status === "unconfigured") return unconfigured ?? <UnconfiguredState />;
  if (status === "unavailable") return <UnavailableState />;
  return children;
}
