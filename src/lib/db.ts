import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { withTimeout } from "@/lib/async";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaUrl?: string;
};

export type DatabaseInitResult = {
  configured: boolean;
  connected: boolean;
};

export function getPrisma(): PrismaClient | null {
  const url = getServerEnv().DATABASE_URL;
  if (!url) return null;

  if (globalForPrisma.prisma && globalForPrisma.prismaUrl === url) {
    return globalForPrisma.prisma;
  }

  void globalForPrisma.prisma?.$disconnect();

  const client = new PrismaClient({
    datasourceUrl: url,
    log: [],
  });
  globalForPrisma.prisma = client;
  globalForPrisma.prismaUrl = url;
  return client;
}

export async function initializeDatabase(): Promise<DatabaseInitResult> {
  if (!getServerEnv().DATABASE_URL) {
    return { configured: false, connected: false };
  }

  const prisma = getPrisma();
  if (!prisma) {
    return { configured: false, connected: false };
  }

  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, 2000);
    return { configured: true, connected: true };
  } catch (error) {
    logger.error("Database connection failed", { error });
    return { configured: true, connected: false };
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (globalForPrisma.prisma) {
    await globalForPrisma.prisma.$disconnect();
  }
  globalForPrisma.prisma = undefined;
  globalForPrisma.prismaUrl = undefined;
}
