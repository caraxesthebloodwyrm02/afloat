/**
 * Safety Gradient Layer
 *
 * Inspired by Grid's BoundaryContract and Anthropic RSP 3.0 fail-closed defaults.
 * Provides graduated safety checks proportional to tier capability.
 */

export interface SafetyEvaluation {
  allowed: boolean;
  reason?: string;
}

const MIN_MESSAGE_INTERVAL_MS = 5_000; // 5 seconds between messages

/**
 * Evaluates safety gradient based on tier and session behavior.
 * - Trial tier: passes through (low capability, low risk)
 * - Continuous tier: checks for rapid-fire abuse patterns
 */
export function evaluateSafetyGradient(
  tier: string,
  messageCount: number,
  sessionDurationMs: number
): SafetyEvaluation {
  // Trial tier — minimal capability, minimal safety overhead
  if (tier === "trial") {
    return { allowed: true };
  }

  // Continuous tier — check for rapid-fire message patterns
  if (tier === "continuous" && messageCount > 1) {
    const avgIntervalMs = sessionDurationMs / messageCount;
    if (avgIntervalMs < MIN_MESSAGE_INTERVAL_MS) {
      return {
        allowed: false,
        reason: "Rate of messages exceeds safety threshold. Please slow down between messages.",
      };
    }
  }

  return { allowed: true };
}

/**
 * Fail-closed safety wrapper. If the evaluation function throws,
 * access is denied by default (RSP 3.0 fail-closed principle).
 */
export function failClosedSafetyCheck(
  evaluationFn: () => SafetyEvaluation
): SafetyEvaluation {
  try {
    return evaluationFn();
  } catch {
    return {
      allowed: false,
      reason: "Safety check failed — access denied (fail-closed).",
    };
  }
}
