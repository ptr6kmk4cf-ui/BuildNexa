-- CreateEnum
CREATE TYPE "OptimizationMode" AS ENUM ('SAVINGS', 'BALANCED', 'QUALITY');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('ANALYSIS', 'PLANNING', 'ARCHITECTURE', 'CODING', 'REFACTORING', 'DEBUGGING', 'TESTING', 'DOCUMENTATION', 'SECURITY', 'REVIEW');

-- CreateEnum
CREATE TYPE "TaskDifficulty" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "optimizationMode" "OptimizationMode" NOT NULL DEFAULT 'BALANCED';

-- CreateTable
CREATE TABLE "ProjectPlan" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT,
    "goal" TEXT NOT NULL,
    "optimizationMode" "OptimizationMode" NOT NULL,
    "summary" TEXT NOT NULL,
    "contextRequests" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectPlan_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "planId" TEXT,
ADD COLUMN "planKey" TEXT,
ADD COLUMN "type" "TaskType" NOT NULL DEFAULT 'ANALYSIS',
ADD COLUMN "difficulty" "TaskDifficulty" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN "complexity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "expectedOutput" TEXT NOT NULL DEFAULT '',
ADD COLUMN "verificationCriteria" TEXT NOT NULL DEFAULT '',
ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "ProjectPlan_projectId_createdAt_idx" ON "ProjectPlan"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectPlan_userId_idx" ON "ProjectPlan"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_planId_planKey_key" ON "Task"("planId", "planKey");

-- CreateIndex
CREATE INDEX "Task_planId_sequence_idx" ON "Task"("planId", "sequence");

-- AddForeignKey
ALTER TABLE "ProjectPlan" ADD CONSTRAINT "ProjectPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPlan" ADD CONSTRAINT "ProjectPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ProjectPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Complexity stays on the 1–5 scale used by the planner.
ALTER TABLE "Task" ADD CONSTRAINT "Task_complexity_range" CHECK ("complexity" >= 1 AND "complexity" <= 5);
