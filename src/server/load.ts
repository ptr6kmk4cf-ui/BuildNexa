import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { io } from "next/cache";
import { getPrisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveViewer } from "@/server/viewer";

export type LoadState<T> =
  | { status: "ready"; data: T }
  | { status: "unconfigured" }
  | { status: "unavailable" }
  | { status: "signedOut" };

export async function readWorkspace<T>(
  load: (prisma: PrismaClient) => Promise<T>,
): Promise<LoadState<T>> {
  await io();
  const prisma = getPrisma();
  if (!prisma) return { status: "unconfigured" };

  try {
    const data = await load(prisma);
    return { status: "ready", data };
  } catch (error) {
    logger.error("Database query failed", { error });
    return { status: "unavailable" };
  }
}

export async function readScopedWorkspace<T>(
  load: (prisma: PrismaClient, viewerId: string) => Promise<T>,
): Promise<LoadState<T>> {
  await io();
  const prisma = getPrisma();
  if (!prisma) return { status: "unconfigured" };

  try {
    const viewerId = await resolveViewer(prisma);
    if (!viewerId) return { status: "signedOut" };
    return { status: "ready", data: await load(prisma, viewerId) };
  } catch (error) {
    logger.error("Database query failed", { error });
    return { status: "unavailable" };
  }
}
