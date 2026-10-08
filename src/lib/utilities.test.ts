import { describe, expect, it } from "vitest";
import { withTimeout } from "@/lib/async";
import { excerpt, formatTimestamp, formatUsd } from "@/lib/format";
import { slugify } from "@/lib/slug";

describe("core utilities", () => {
  it("slugifies names", () => {
    expect(slugify("AI Project Optimizer")).toBe("ai-project-optimizer");
    expect(slugify("Café Plans")).toBe("cafe-plans");
    expect(slugify("   ")).toBe("project");
    const clipped = slugify(Array.from({ length: 20 }, () => "ab").join(" "));
    expect(clipped.endsWith("-")).toBe(false);
    expect(clipped.length).toBeLessThanOrEqual(48);
  });

  it("formats money and timestamps", () => {
    expect(formatUsd("12.5")).toBe("$12.50");
    expect(formatUsd("nope")).toBe("Invalid amount");
    expect(formatTimestamp("not-a-date")).toBe("Unknown time");
    expect(excerpt("short")).toBe("short");
    expect(excerpt("a".repeat(20), 10)).toBe("aaaaaaa...");
  });

  it("times out a hanging promise", async () => {
    await expect(withTimeout(new Promise(() => {}), 10)).rejects.toThrow(/timed out/);
    await expect(withTimeout(Promise.resolve("ok"), 50)).resolves.toBe("ok");
  });
});
