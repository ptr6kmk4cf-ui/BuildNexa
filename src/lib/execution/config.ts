export const EXECUTION_CONFIG = {
  maxAttempts: 3,
  timeoutMs: 20_000,
  concurrency: 2,
  maxResultChars: 8_000,
  maxDependencyChars: 2_000,
  maxPromptChars: 30_000,
  outputTokens: 4_096,
  staleRunMs: 45_000,
  saveTimeoutMs: 60_000,
} as const;
