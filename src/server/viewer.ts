import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { LOCAL_OPERATOR_EMAIL } from "@/lib/constants";
import { getServerEnv } from "@/lib/env";
import type { RateLimiter } from "@/lib/security/rate-limit";
import { canAccessProject, viewerFromSession } from "@/lib/security/viewer";
import { currentGithubUserId } from "@/server/github";

export async function resolveViewer(prisma: Pick<PrismaClient, "user">): Promise<string | null> {
  const sessionUserId = await currentGithubUserId();
  const nodeEnv = getServerEnv().NODE_ENV;
  let localOperatorId: string | null = null;
  if (!sessionUserId && nodeEnv !== "production") {
    const user = await prisma.user.findUnique({
      where: { email: LOCAL_OPERATOR_EMAIL },
      select: { id: true },
    });
    localOperatorId = user?.id ?? null;
  }
  return viewerFromSession({ nodeEnv, sessionUserId, localOperatorId });
}

export async function authorizeOwnedProject(
  prisma: PrismaClient,
  projectId: string,
  limiter: RateLimiter,
): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  const viewerId = await resolveViewer(prisma);
  if (!limiter.allow(viewerId ?? "anonymous")) {
    return { ok: false, message: "Too many requests. Wait a few minutes and try again." };
  }
  if (!viewerId) {
    return { ok: false, message: "Connect GitHub before changing a project." };
  }
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: viewerId },
    select: { userId: true },
  });
  if (!project || !canAccessProject(viewerId, project.userId)) {
    return { ok: false, message: "That project could not be found." };
  }
  return { ok: true, userId: viewerId };
}
