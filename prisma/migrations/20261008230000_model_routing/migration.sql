-- Routing decisions can name no model when every candidate is unavailable or too weak.
ALTER TABLE "ModelDecision" ALTER COLUMN "modelId" DROP NOT NULL;

ALTER TABLE "ModelDecision" ADD COLUMN "provider" TEXT;
ALTER TABLE "ModelDecision" ADD COLUMN "modelSlug" TEXT;
ALTER TABLE "ModelDecision" ADD COLUMN "optimizationMode" "OptimizationMode" NOT NULL DEFAULT 'BALANCED';
ALTER TABLE "ModelDecision" ADD COLUMN "estimatedCost" DECIMAL(14,6);
ALTER TABLE "ModelDecision" ADD COLUMN "successProbability" DECIMAL(5,4);
ALTER TABLE "ModelDecision" ADD COLUMN "outcome" TEXT NOT NULL DEFAULT 'selected';
ALTER TABLE "ModelDecision" ADD COLUMN "factors" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "ModelDecision" ADD COLUMN "candidates" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "ModelDecision" ADD CONSTRAINT "ModelDecision_success_probability_range"
  CHECK ("successProbability" IS NULL OR ("successProbability" >= 0 AND "successProbability" <= 1));

ALTER TABLE "ModelDecision" ADD CONSTRAINT "ModelDecision_outcome_known"
  CHECK ("outcome" IN ('selected', 'provider_unavailable', 'insufficient_capability', 'unpriced', 'below_threshold'));
