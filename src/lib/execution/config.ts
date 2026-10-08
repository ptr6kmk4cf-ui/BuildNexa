export const EXECUTION_CONFIG = {
  maxAttempts: 3,
  timeoutMs: 20_000,
  concurrency: 2,
  maxResultChars: 8_000,
  maxDependencyChars: 2_000,
} as const;
