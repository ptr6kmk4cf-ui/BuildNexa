export const SANDBOX_LIMITS = {
  memoryBytes: 512 * 1024 * 1024,
  cpuMax: "50000 100000",
  pidsMax: 64,
  timeoutMs: 120_000,
  maxOutputChars: 16_000,
  maxFileBytes: 1_000_000,
  maxSearchFiles: 400,
  maxToolSteps: 6,
} as const;

export type SandboxLimits = {
  memoryBytes: number;
  cpuMax: string;
  pidsMax: number;
  timeoutMs: number;
};
