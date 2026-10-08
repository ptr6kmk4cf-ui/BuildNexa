export { VERIFICATION_CONFIG } from "@/lib/verification/config";
export { decideEscalation } from "@/lib/verification/decide";
export { commandLine, detectChecks, isAllowedVerificationCommand } from "@/lib/verification/detect";
export { checkFromProcess, failedWithoutChecks, interpretChecks, unknownVerification, unresolvedReport } from "@/lib/verification/interpret";
export { createWorkspaceVerifier, readProjectChecks, spawnCommand } from "@/lib/verification/runner";
export type {
  CheckKind,
  EscalationDecision,
  EscalationInput,
  EscalationModel,
  PlannedCheck,
  TaskVerification,
  VerificationCheck,
  VerificationOutcome,
} from "@/lib/verification/types";
export { CHECK_KINDS, VERIFICATION_OUTCOMES } from "@/lib/verification/types";
