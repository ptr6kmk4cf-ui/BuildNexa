-- A live run refreshes heartbeatAt. A crashed run can be replaced once the heartbeat is stale.
ALTER TABLE "ExecutionRun" ADD COLUMN "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- One in-progress run per project. A second start waits or reports that a run is already going.
CREATE UNIQUE INDEX "ExecutionRun_one_running_per_project"
  ON "ExecutionRun"("projectId")
  WHERE "status" = 'RUNNING';
