-- Phase 9 stores what a run actually spent, split by initial work, retries,
-- debugging, escalation, and local verification. The approved budget is unchanged.

CREATE TYPE "CostKind" AS ENUM ('INITIAL', 'RETRY', 'DEBUG', 'ESCALATION', 'VERIFICATION');

ALTER TABLE "CostRecord" ADD COLUMN "kind" "CostKind" NOT NULL DEFAULT 'INITIAL';
ALTER TABLE "CostRecord" ADD COLUMN "taskId" TEXT;
ALTER TABLE "CostRecord" ADD COLUMN "inputTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CostRecord" ADD COLUMN "outputTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CostRecord" ADD COLUMN "cachedInputTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CostRecord" ADD COLUMN "toolCalls" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CostRecord" ADD COLUMN "durationMs" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "TokenUsage" ADD COLUMN "cachedInputTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TokenUsage" ADD COLUMN "toolCalls" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "TaskExecution" ADD COLUMN "cachedInputTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TaskExecution" ADD COLUMN "toolCalls" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ExecutionRun" ADD COLUMN "authorizeOverBudget" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "CostRecord_taskId_idx" ON "CostRecord"("taskId");
CREATE INDEX "CostRecord_kind_idx" ON "CostRecord"("kind");

ALTER TABLE "CostRecord" ADD CONSTRAINT "CostRecord_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
