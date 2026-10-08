-- Phase 8 stores independent check results for a task.
-- The model reply is still not applied to the repository.

CREATE TYPE "VerificationOutcome" AS ENUM ('PASS', 'FAIL', 'PARTIAL', 'UNKNOWN');
CREATE TYPE "VerificationCheckKind" AS ENUM ('TEST', 'LINT', 'TYPECHECK', 'BUILD');

ALTER TABLE "Verification" ADD COLUMN "outcome" "VerificationOutcome";
ALTER TABLE "Verification" ADD COLUMN "stopReason" TEXT;
ALTER TABLE "Verification" ADD COLUMN "command" TEXT;
ALTER TABLE "Verification" ADD COLUMN "output" TEXT;
ALTER TABLE "Verification" ADD COLUMN "exitCode" INTEGER;
ALTER TABLE "Verification" ADD COLUMN "durationMs" INTEGER;
ALTER TABLE "Verification" ADD COLUMN "errors" TEXT;
ALTER TABLE "Verification" ADD COLUMN "costUsd" DECIMAL(14,6);

CREATE TABLE "VerificationCheck" (
    "id" TEXT NOT NULL,
    "verificationId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" "VerificationCheckKind" NOT NULL,
    "command" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "exitCode" INTEGER,
    "durationMs" INTEGER NOT NULL,
    "errors" TEXT,
    "outcome" "VerificationOutcome" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationCheck_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Verification_taskId_createdAt_idx" ON "Verification"("taskId", "createdAt");
CREATE INDEX "VerificationCheck_verificationId_createdAt_idx" ON "VerificationCheck"("verificationId", "createdAt");
CREATE INDEX "VerificationCheck_taskId_createdAt_idx" ON "VerificationCheck"("taskId", "createdAt");

ALTER TABLE "VerificationCheck" ADD CONSTRAINT "VerificationCheck_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "Verification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationCheck" ADD CONSTRAINT "VerificationCheck_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
