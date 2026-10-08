export const VERIFICATION_CONFIG = {
  maxAttempts: 3,
  maxSameModelRetries: 1,
  commandTimeoutMs: 120_000,
  maxOutputChars: 8_000,
  maxErrorChars: 2_000,
  minRetryProbability: 0.1,
  minEscalationGain: 0.08,
  maxEscalationMultiple: 8,
} as const;
