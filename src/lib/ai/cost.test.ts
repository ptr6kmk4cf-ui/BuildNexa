import { describe, expect, it } from "vitest";
import { calculateCost } from "@/lib/ai/cost";
import type { ModelPricing } from "@/lib/ai/types";

const priced: ModelPricing = {
  inputPerMillion: "2.5",
  outputPerMillion: "10",
  cachedInputPerMillion: "0.5",
};

describe("cost calculation", () => {
  it("prices input, cached input, and output from configured per-million rates", () => {
    expect(
      calculateCost(priced, { inputTokens: 1_000_000, outputTokens: 0, cachedInputTokens: 0 }),
    ).toEqual({ currency: "USD", amount: "2.5", priced: true });

    expect(
      calculateCost(priced, { inputTokens: 1_000, outputTokens: 500, cachedInputTokens: 400 }),
    ).toEqual({ currency: "USD", amount: "0.0067", priced: true });
  });

  it("stays unpriced when a required rate is missing", () => {
    expect(
      calculateCost(
        { inputPerMillion: "2.5", outputPerMillion: null, cachedInputPerMillion: null },
        { inputTokens: 10, outputTokens: 10, cachedInputTokens: 0 },
      ),
    ).toEqual({ currency: "USD", amount: null, priced: false, reason: "pricing_unconfigured" });

    expect(
      calculateCost(
        { inputPerMillion: "2.5", outputPerMillion: "10", cachedInputPerMillion: null },
        { inputTokens: 10, outputTokens: 1, cachedInputTokens: 4 },
      ),
    ).toEqual({ currency: "USD", amount: null, priced: false, reason: "pricing_unconfigured" });
  });

  it("rejects usage that cannot be billed", () => {
    expect(
      calculateCost(priced, { inputTokens: 4, outputTokens: 1, cachedInputTokens: 5 }),
    ).toEqual({ currency: "USD", amount: null, priced: false, reason: "invalid_usage" });
  });
});
