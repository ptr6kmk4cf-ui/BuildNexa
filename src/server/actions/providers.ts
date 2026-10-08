"use server";

import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { parseEnabledProviders } from "@/lib/ai/catalog";
import { logger } from "@/lib/logger";
import { saveProviderAvailability } from "@/server/ai";

export type ProviderFormState = {
  message: string | null;
  saved: boolean;
};

export async function saveProviderPreferences(
  _previous: ProviderFormState,
  formData: FormData,
): Promise<ProviderFormState> {
  try {
    const values = formData.getAll("providers").filter((value): value is string => typeof value === "string");
    const enabled = parseEnabledProviders(values);
    if (!enabled) return { message: "Choose only the listed providers.", saved: false };
    const saved = await saveProviderAvailability(enabled);
    if (!saved.ok) return { message: saved.message, saved: false };
    refresh();
    return { message: "Provider availability saved. API keys stay on the server.", saved: true };
  } catch (error) {
    unstable_rethrow(error);
    logger.error("Could not save provider preferences", { error });
    return { message: "Provider availability could not be saved.", saved: false };
  }
}
