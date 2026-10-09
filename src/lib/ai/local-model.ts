import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ProviderId, TokenCounts } from "@/lib/ai/types";
import type { ServerEnv } from "@/lib/env";

const USAGE: TokenCounts = { inputTokens: 12, outputTokens: 24, cachedInputTokens: 0 };

type ProviderKeyEnv = Pick<
  ServerEnv,
  | "NODE_ENV"
  | "OPENAI_API_KEY"
  | "ANTHROPIC_API_KEY"
  | "GEMINI_API_KEY"
  | "MISTRAL_API_KEY"
  | "DEEPSEEK_API_KEY"
  | "XAI_API_KEY"
>;

export function localModelEnabled(env: ProviderKeyEnv): boolean {
  if (env.NODE_ENV === "production") return false;
  if (process.env.LOCAL_MODEL !== "1") return false;
  return (
    !env.OPENAI_API_KEY &&
    !env.ANTHROPIC_API_KEY &&
    !env.GEMINI_API_KEY &&
    !env.MISTRAL_API_KEY &&
    !env.DEEPSEEK_API_KEY &&
    !env.XAI_API_KEY
  );
}

export function providerKeysForRun(env: ProviderKeyEnv): Record<ProviderId, string | undefined> {
  return {
    openai: localModelEnabled(env) ? "local" : env.OPENAI_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
    gemini: env.GEMINI_API_KEY,
    mistral: env.MISTRAL_API_KEY,
    deepseek: env.DEEPSEEK_API_KEY,
    xai: env.XAI_API_KEY,
  };
}

export function localModelResult(messages: readonly { role: string; content: string }[]): { text: string; usage: TokenCounts } {
  const system = messages.find((message) => message.role === "system")?.content ?? "";
  if (system.includes("one JSON object")) {
    const steps = messages.filter((message) => message.role === "assistant").length;
    const text = steps === 0
      ? JSON.stringify({ tool: "create_file", path: "OPTIMIZER.md", content: "Noted by the local model inside the sandbox.\n" })
      : JSON.stringify({ tool: "done", summary: "Added OPTIMIZER.md in the sandbox." });
    return { text, usage: USAGE };
  }
  return {
    text: "Local model result. No remote provider is configured, so this reply was written on this machine and was not billed.",
    usage: USAGE,
  };
}

export async function localCheckDirectory(): Promise<string> {
  const directory = path.join(tmpdir(), "ai-project-optimizer-local-checks");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "package.json"), `${JSON.stringify({
    name: "local-checks",
    private: true,
    scripts: {
      test: "node -e \"process.stdout.write('local-test-ok')\"",
      lint: "node -e \"process.stdout.write('local-lint-ok')\"",
      typecheck: "node -e \"process.stdout.write('local-typecheck-ok')\"",
      build: "node -e \"process.stdout.write('local-build-ok')\"",
    },
  }, null, 2)}\n`);
  return directory;
}
