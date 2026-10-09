import { describe, expect, it } from "vitest";
import { readLogLevel, redact, redactString } from "@/lib/logger";

describe("logging", () => {
  it("redacts database URLs and secret-shaped keys", () => {
    expect(redactString("down postgresql://user:supersecret@localhost/db")).toBe(
      "down postgresql://[redacted]",
    );
    expect(redactString("leaked gho_supersecrettokenvalue client_secret=abc")).toBe(
      "leaked [redacted] client_secret=[redacted]",
    );
    expect(redactString("openai sk-supersecretvalue123 gemini AIzaSyexamplekeyvalue12 groq gsk_supersecretvalue123")).toBe(
      "openai [redacted] gemini [redacted] groq [redacted]",
    );
    expect(
      redact({
        password: "supersecret",
        nested: { api_key: "abcd", note: "postgres://user:supersecret@localhost/db" },
      }),
    ).toEqual({
      password: "[redacted]",
      nested: { api_key: "[redacted]", note: "postgresql://[redacted]" },
    });
  });

  it("redacts Error messages", () => {
    const value = redact(new Error("boom postgresql://user:secret@localhost/db"));
    expect(value).toEqual({
      name: "Error",
      message: "boom postgresql://[redacted]",
    });
  });

  it("falls back to info for an unknown level", () => {
    expect(readLogLevel("verbose")).toBe("info");
    expect(readLogLevel("warn")).toBe("warn");
  });
});
