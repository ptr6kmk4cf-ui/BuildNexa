export function viewerFromSession(input: {
  nodeEnv: string;
  sessionUserId: string | null;
  localOperatorId: string | null;
}): string | null {
  if (input.sessionUserId) return input.sessionUserId;
  if (input.nodeEnv === "production") return null;
  return input.localOperatorId;
}

export function anonymousMayUseLocalOperator(nodeEnv: string): boolean {
  return nodeEnv !== "production";
}

export function canAccessProject(viewerId: string | null, projectUserId: string): boolean {
  return viewerId !== null && viewerId === projectUserId;
}
