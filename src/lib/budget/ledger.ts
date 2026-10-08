import { multiplyMoney } from "@/lib/routing/money";
import { BUDGET_RESERVES } from "@/lib/budget/config";
import { formatScaled, scaleMoney } from "@/lib/budget/money";
import type { CostKind, SpendDecision } from "@/lib/budget/types";

export type BudgetLedger = {
  limitScaled: bigint;
  authorizeOverBudget: boolean;
  blocked: boolean;
  exceeded: boolean;
  pools: Record<CostKind, bigint>;
  spent: Record<CostKind, bigint>;
};

const ZERO = BigInt(0);

const ZERO_SPENT = (): Record<CostKind, bigint> => ({
  initial: ZERO,
  retry: ZERO,
  debug: ZERO,
  escalation: ZERO,
  verification: ZERO,
});

export function createBudgetLedger(limitUsd: string, authorizeOverBudget = false): BudgetLedger | null {
  const limit = scaleMoney(limitUsd);
  if (limit === null || limit <= ZERO) return null;
  const retry = share(limitUsd, BUDGET_RESERVES.retry);
  const debug = share(limitUsd, BUDGET_RESERVES.debug);
  const escalation = share(limitUsd, BUDGET_RESERVES.escalation);
  const verification = share(limitUsd, BUDGET_RESERVES.verification);
  if (retry === null || debug === null || escalation === null || verification === null) return null;
  const reserved = retry + debug + escalation + verification;
  if (reserved > limit) return null;
  return {
    limitScaled: limit,
    authorizeOverBudget,
    blocked: false,
    exceeded: false,
    pools: {
      initial: limit - reserved,
      retry,
      debug,
      escalation,
      verification,
    },
    spent: ZERO_SPENT(),
  };
}

export function approveSpend(ledger: BudgetLedger, kind: CostKind, amountUsd: string): SpendDecision {
  const amount = scaleMoney(amountUsd);
  if (amount === null || amount < ZERO) {
    return { ok: false, reason: "insufficient_budget", message: "This call has no price estimate, so it was not sent." };
  }
  if (ledger.authorizeOverBudget || ledger.pools[kind] >= amount) {
    ledger.pools[kind] -= amount;
    return { ok: true };
  }
  const used = ledger.limitScaled - poolTotal(ledger);
  if (used <= ZERO) {
    return {
      ok: false,
      reason: "insufficient_budget",
      message: "The project budget cannot cover this call. Part of the budget is reserved for retries, debugging, escalation, and verification.",
    };
  }
  return {
    ok: false,
    reason: "budget_exhausted",
    message: "The remaining budget cannot cover this call.",
  };
}

export function commitSpend(ledger: BudgetLedger, kind: CostKind, reservedUsd: string, actualUsd: string | null): void {
  const reserved = scaleMoney(reservedUsd);
  if (reserved === null) return;
  ledger.pools[kind] += reserved;
  if (actualUsd === null) {
    ledger.blocked = true;
    return;
  }
  const actual = scaleMoney(actualUsd);
  if (actual === null) {
    ledger.blocked = true;
    return;
  }
  if (!ledger.authorizeOverBudget && ledger.pools[kind] < actual) {
    ledger.spent[kind] += actual;
    ledger.pools[kind] -= actual;
    ledger.exceeded = true;
    ledger.blocked = true;
    return;
  }
  ledger.pools[kind] -= actual;
  ledger.spent[kind] += actual;
}

export function ledgerSpentUsd(ledger: BudgetLedger, kind?: CostKind): string {
  if (kind) return formatScaled(ledger.spent[kind]);
  return formatScaled(spentTotal(ledger));
}

export function poolRemainingUsd(ledger: BudgetLedger, kind: CostKind): string {
  return formatScaled(ledger.pools[kind]);
}

function share(limitUsd: string, fraction: number): bigint | null {
  const text = multiplyMoney(limitUsd, fraction);
  if (!text) return null;
  return scaleMoney(text);
}

function poolTotal(ledger: BudgetLedger): bigint {
  return ledger.pools.initial + ledger.pools.retry + ledger.pools.debug + ledger.pools.escalation + ledger.pools.verification;
}

function spentTotal(ledger: BudgetLedger): bigint {
  return ledger.spent.initial + ledger.spent.retry + ledger.spent.debug + ledger.spent.escalation + ledger.spent.verification;
}
