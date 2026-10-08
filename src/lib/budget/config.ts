export const BUDGET_PRESETS_USD = ["5", "25", "50", "100"] as const;

// Shares of the approved budget that the first model call cannot spend.
export const BUDGET_RESERVES = {
  retry: 0.15,
  debug: 0.1,
  escalation: 0.15,
  verification: 0.1,
} as const;

export const BUDGET_ALERTS = [
  { fraction: 1, message: "The project budget has been used." },
  { fraction: 0.8, message: "80% of your project budget has been used." },
  { fraction: 0.5, message: "50% of your project budget has been used." },
] as const;
