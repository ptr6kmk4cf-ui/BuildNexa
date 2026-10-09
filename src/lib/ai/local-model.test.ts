import { afterEach, describe, expect, it } from "vitest";
import { localModelEnabled, localModelResult, providerKeysForRun } from "@/lib/ai/local-model";

const empty = {
  OPENAI_API_KEY: undefined,
  ANTHROPIC_API_KEY: undefined,
  GEMINI_API_KEY: undefined,
  MISTRAL_API_KEY: undefined,
  DEEPSEEK_API_KEY: undefined,
  XAI_API_KEY: undefined,
};

afterEach(() => {
  delete process.env.LOCAL_MODEL;
});

describe("local model", () => {
  it("stays off in production and when a provider key exists", () => {
    process.env.LOCAL_MODEL = "1";
    expect(localModelEnabled({ NODE_ENV: "production", ...empty })).toBe(false);
    expect(localModelEnabled({ NODE_ENV: "development", ...empty, OPENAI_API_KEY: "sk-real" })).toBe(false);
    expect(localModelEnabled({ NODE_ENV: "development", ...empty, MISTRAL_API_KEY: "mistral-real" })).toBe(false);
    expect(providerKeysForRun({ NODE_ENV: "production", ...empty }).openai).toBeUndefined();
  });

  it("answers sandbox tool calls and plain tasks when it is enabled", () => {
    process.env.LOCAL_MODEL = "1";
    const env = { NODE_ENV: "development" as const, ...empty };
    expect(localModelEnabled(env)).toBe(true);
    expect(providerKeysForRun(env).openai).toBe("local");
    const tool = localModelResult([
      { role: "system", content: "Edit the repository only by returning one JSON object for a single tool." },
      { role: "user", content: "Branch apo/test." },
    ]);
    expect(JSON.parse(tool.text)).toMatchObject({ tool: "create_file", path: "OPTIMIZER.md" });
    const done = localModelResult([
      { role: "system", content: "one JSON object" },
      { role: "assistant", content: tool.text },
      { role: "user", content: "Created OPTIMIZER.md." },
    ]);
    expect(JSON.parse(done.text)).toMatchObject({ tool: "done" });
    expect(localModelResult([{ role: "system", content: "Complete one planned software task." }, { role: "user", content: "Task: Write a note." }]).text).toContain("Local model result");
  });
});
