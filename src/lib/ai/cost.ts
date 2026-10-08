import type { CostQuote, ModelPricing, TokenCounts } from "@/lib/ai/types";

const PRICE_SCALE = BigInt(1_000_000);
const PRICE_PATTERN = /^(?:0|[1-9]\d{0,6})(?:\.\d{1,6})?$/;

export function calculateCost(pricing: ModelPricing, usage: TokenCounts): CostQuote {
  if (!validUsage(usage)) {
    return { currency: "USD", amount: null, priced: false, reason: "invalid_usage" };
  }
  if (!pricing.inputPerMillion || !pricing.outputPerMillion) {
    return { currency: "USD", amount: null, priced: false, reason: "pricing_unconfigured" };
  }
  if (usage.cachedInputTokens > 0 && !pricing.cachedInputPerMillion) {
    return { currency: "USD", amount: null, priced: false, reason: "pricing_unconfigured" };
  }

  const inputPrice = parsePrice(pricing.inputPerMillion);
  const outputPrice = parsePrice(pricing.outputPerMillion);
  const cachedPrice = pricing.cachedInputPerMillion ? parsePrice(pricing.cachedInputPerMillion) : BigInt(0);
  if (inputPrice === null || outputPrice === null || cachedPrice === null) {
    return { currency: "USD", amount: null, priced: false, reason: "pricing_unconfigured" };
  }

  const uncachedInput = usage.inputTokens - usage.cachedInputTokens;
  const amount = roundDiv(
    lineCost(uncachedInput, inputPrice) +
      lineCost(usage.cachedInputTokens, cachedPrice) +
      lineCost(usage.outputTokens, outputPrice),
    PRICE_SCALE,
  );

  return { currency: "USD", amount: formatScaled(amount), priced: true };
}

function validUsage(usage: TokenCounts): boolean {
  return (
    isTokenCount(usage.inputTokens) &&
    isTokenCount(usage.outputTokens) &&
    isTokenCount(usage.cachedInputTokens) &&
    usage.cachedInputTokens <= usage.inputTokens
  );
}

function isTokenCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 100_000_000;
}

export function parsePrice(value: string): bigint | null {
  if (!PRICE_PATTERN.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const digits = `${whole}${fraction.padEnd(6, "0")}`;
  return BigInt(digits);
}

function lineCost(tokens: number, pricePerMillionScaled: bigint): bigint {
  return BigInt(tokens) * pricePerMillionScaled;
}

function roundDiv(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder * BigInt(2) >= denominator) return quotient + BigInt(1);
  return quotient;
}

function formatScaled(scaled: bigint): string {
  const whole = scaled / PRICE_SCALE;
  const fraction = (scaled % PRICE_SCALE).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction.length > 0 ? `${whole.toString()}.${fraction}` : whole.toString();
}
