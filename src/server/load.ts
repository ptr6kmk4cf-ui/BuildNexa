import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { io } from "next/cache";
import { getPrisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export type LoadState<T> =
  | { status: "ready"; data: T }
  | { status: "unconfigured" }
  | { status: "unavailable" };

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
