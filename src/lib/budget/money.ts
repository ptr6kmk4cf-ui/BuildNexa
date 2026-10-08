import { parsePrice } from "@/lib/ai/cost";

const SCALE = BigInt(1_000_000);
const ZERO = BigInt(0);

export function scaleMoney(value: string): bigint | null {
  return parsePrice(value);
}

export function formatScaled(scaled: bigint): string {
  const negative = scaled < ZERO;
  const absolute = negative ? -scaled : scaled;
  const whole = absolute / SCALE;
  const fraction = (absolute % SCALE).toString().padStart(6, "0").replace(/0+$/, "");
  const text = fraction.length > 0 ? `${whole.toString()}.${fraction}` : whole.toString();
  return negative ? `-${text}` : text;
}

export function subtractMoney(left: string, right: string): string | null {
  const leftScaled = scaleMoney(left);
  const rightScaled = scaleMoney(right);
  if (leftScaled === null || rightScaled === null) return null;
  return formatScaled(leftScaled - rightScaled);
}
