import "server-only";
import { io } from "next/cache";
import type { PrismaClient } from "@/generated/prisma/client";
import { createAIProvider } from "@/lib/ai";
import { assembleCatalog, enabledProviderSet, type AiCatalog } from "@/lib/ai/catalog";
import { countEnabledModels, listRegistryModels } from "@/lib/ai/registry";
import { PROVIDER_IDS, type AIProvider, type ProviderId } from "@/lib/ai/types";
import { LOCAL_OPERATOR_EMAIL, LOCAL_OPERATOR_NAME } from "@/lib/constants";
import { getPrisma } from "@/lib/db";
import { getServerEnv, type ServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { anonymousMayUseLocalOperator } from "@/lib/security/viewer";
import { currentGithubUserId } from "@/server/github";

export async function loadAiCatalog(): Promise<{ status: "ready"; data: AiCatalog } | { status: "unavailable" }> {
  await io();
  const env = getServerEnv();
  const prisma = getPrisma();
  if (!prisma) {
    return {
      status: "ready",
      data: assembleCatalog({
        pricingText: env.MODEL_PRICING,
        keys: keysFrom(env),
        databaseConfigured: false,
      }),
    };
  }

  try {
    const preferenceRows = await readPreferenceRows(prisma);
    return {
      status: "ready",
      data: assembleCatalog({
        pricingText: env.MODEL_PRICING,
        preferenceRows,
        keys: keysFrom(env),
        databaseConfigured: true,
      }),
    };
  } catch (error) {
    logger.error("Could not load provider preferences", { error });
    return { status: "unavailable" };
  }
}

export async function readEnabledProviderIds(prisma: PrismaClient): Promise<Set<ProviderId>> {
  return enabledProviderSet(await readPreferenceRows(prisma));
}

export function enabledModelCount(enabled: ReadonlySet<ProviderId>): number {
  return countEnabledModels(listRegistryModels(getServerEnv().MODEL_PRICING).models, enabled);
}

export async function saveProviderAvailability(
  enabled: readonly ProviderId[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  await io();
  const prisma = getPrisma();
  if (!prisma) {
    return { ok: false, message: "Connect PostgreSQL before saving which providers are available." };
  }

  const enabledSet = new Set(enabled);
  if (!anonymousMayUseLocalOperator(getServerEnv().NODE_ENV)) {
    const sessionUserId = await currentGithubUserId();
    if (!sessionUserId) {
      return { ok: false, message: "Connect GitHub before changing provider availability." };
    }
  }
  try {
    const owner = await preferenceOwner(prisma, true);
    if (!owner) return { ok: false, message: "Provider availability could not be saved." };
    await prisma.$transaction(async (tx) => {
      for (const provider of PROVIDER_IDS) {
        await tx.providerPreference.upsert({
          where: { userId_provider: { userId: owner.id, provider } },
          create: { userId: owner.id, provider, enabled: enabledSet.has(provider) },
          update: { enabled: enabledSet.has(provider) },
        });
      }
      await tx.auditLog.create({
        data: {
          userId: owner.id,
          action: "UPDATE",
          entityType: "ProviderPreference",
          entityId: owner.id,
          metadata: Object.fromEntries(PROVIDER_IDS.map((provider) => [provider, enabledSet.has(provider)])),
        },
      });
    });
    return { ok: true };
  } catch (error) {
    logger.error("Could not save provider preferences", { error });
    return { ok: false, message: "Provider availability could not be saved." };
  }
}

export function providerFor(
  id: ProviderId,
  overrides?: { fetch?: typeof fetch; timeoutMs?: number },
): AIProvider {
  const env = getServerEnv();
  return createAIProvider(id, {
    apiKey: keysFrom(env)[id],
    pricingText: env.MODEL_PRICING,
    fetch: overrides?.fetch,
    timeoutMs: overrides?.timeoutMs,
  });
}

function keysFrom(env: ServerEnv): Record<ProviderId, string | undefined> {
  return {
    openai: env.OPENAI_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
    gemini: env.GEMINI_API_KEY,
    mistral: env.MISTRAL_API_KEY,
    groq: env.GROQ_API_KEY,
    deepseek: env.DEEPSEEK_API_KEY,
    xai: env.XAI_API_KEY,
  };
}

async function readPreferenceRows(prisma: PrismaClient) {
  const owner = await preferenceOwner(prisma, false);
  if (!owner) return [];
  return prisma.providerPreference.findMany({
    where: { userId: owner.id },
    select: { provider: true, enabled: true },
  });
}

async function preferenceOwner(prisma: PrismaClient, create: boolean): Promise<{ id: string } | null> {
  // Provider on/off is one workspace setting, stored on the local operator.
  // A GitHub session does not get a separate switch. Production still requires
  // a session before this function will write it.
  if (!create) {
    return prisma.user.findUnique({ where: { email: LOCAL_OPERATOR_EMAIL }, select: { id: true } });
  }
  return prisma.user.upsert({
    where: { email: LOCAL_OPERATOR_EMAIL },
    update: {},
    create: { email: LOCAL_OPERATOR_EMAIL, name: LOCAL_OPERATOR_NAME },
    select: { id: true },
  });
}
