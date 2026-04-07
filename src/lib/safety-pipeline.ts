import {
  preCheckGate,
  type PreCheckResult,
  detectAndRedactPII,
  type PIIDetectionResult,
  evaluateSafetyGradient,
  failClosedSafetyCheck,
  type SafetyEvaluation,
} from './safety';

export interface SafetyPipelineInput {
  userMessage: string;
  tier: string;
  messageCount: number;
  sessionDurationMs: number;
}

export interface SafetyPipelineResult {
  allowed: boolean;
  blocked_by: 'pre_check' | 'safety_gradient' | null;
  reason: string | null;
  pre_check: PreCheckResult;
  pii: PIIDetectionResult;
  safety_gradient: SafetyEvaluation;
  sanitized_message: string;
}

export function runSafetyPipeline(
  input: SafetyPipelineInput
): SafetyPipelineResult {
  // Stage 1: Pre-Check Gate
  const preCheck = preCheckGate(input.userMessage);
  if (preCheck.blocked) {
    return {
      allowed: false,
      blocked_by: 'pre_check',
      reason: preCheck.reason_code,
      pre_check: preCheck,
      pii: {
        pii_found: false,
        types_detected: [],
        type_counts: {},
        redacted_text: input.userMessage,
      },
      safety_gradient: { allowed: true },
      sanitized_message: input.userMessage,
    };
  }

  // Stage 2: PII Shield (non-blocking — always continues)
  const pii = detectAndRedactPII(preCheck.sanitized_input);

  // Stage 3: Safety Gradient (existing, fail-closed)
  const gradient = failClosedSafetyCheck(() =>
    evaluateSafetyGradient(
      input.tier,
      input.messageCount,
      input.sessionDurationMs
    )
  );
  if (!gradient.allowed) {
    return {
      allowed: false,
      blocked_by: 'safety_gradient',
      reason: gradient.reason ?? null,
      pre_check: preCheck,
      pii,
      safety_gradient: gradient,
      sanitized_message: pii.redacted_text,
    };
  }

  return {
    allowed: true,
    blocked_by: null,
    reason: null,
    pre_check: preCheck,
    pii,
    safety_gradient: gradient,
    sanitized_message: pii.redacted_text,
  };
}
