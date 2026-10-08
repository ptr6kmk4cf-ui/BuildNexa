import { parsePrice } from "@/lib/ai/cost";

const SCALE = BigInt(1_000_000);

export function addMoney(values: readonly string[]): string | null {
  let total = BigInt(0);
  for (const value of values) {
    const parsed = parsePrice(value);
    if (parsed === null) return null;
    total += parsed;
  }
  return formatScaled(total);
}

export function multiplyMoney(value: string, factor: number): string | null {
  if (!Number.isFinite(factor) || factor < 0 || factor > 1000) return null;
  const parsed = parsePrice(value);
  if (parsed === null) return null;
  const factorScaled = BigInt(Math.round(factor * 1_000_000));
  return formatScaled((parsed * factorScaled) / SCALE);
}

export function compareMoney(left: string, right: string): number | null {
  const leftScaled = parsePrice(left);
  const rightScaled = parsePrice(right);
  if (leftScaled === null || rightScaled === null) return null;
  if (leftScaled < rightScaled) return -1;
  if (leftScaled > rightScaled) return 1;
  return 0;
}

function formatScaled(scaled: bigint): string {
  const whole = scaled / SCALE;
  const fraction = (scaled % SCALE).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction.length > 0 ? `${whole.toString()}.${fraction}` : whole.toString();
}
