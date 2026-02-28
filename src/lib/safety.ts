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

// --- Pre-Check Gate (synthesized from GRID detectors/pre_check.py + mycelium/safety.py) ---

export interface PreCheckResult {
  blocked: boolean;
  reason_code: string | null;
  sanitized_input: string;
  flags: string[];
}

// Control chars to strip (from GRID safety.py line 106)
// Preserves \t (0x09), \n (0x0a), \r (0x0d)
const CONTROL_CHAR_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

// Prompt injection preambles — proportional to ASL-1
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(all\s+)?above\s+instructions/i,
  /disregard\s+(all\s+)?previous/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /system\s*prompt\s*:/i,
  /\[system\]/i,
  /pretend\s+you\s+are/i,
  /override\s+(your\s+)?(safety|rules|instructions)/i,
];

const MAX_INPUT_LENGTH = 2000;

export function preCheckGate(input: string): PreCheckResult {
  const flags: string[] = [];

  if (!input || !input.trim()) {
    return { blocked: false, reason_code: null, sanitized_input: input, flags };
  }

  if (input.length > MAX_INPUT_LENGTH) {
    return { blocked: true, reason_code: "INPUT_TOO_LONG", sanitized_input: input, flags };
  }

  // Sanitize control characters
  const sanitized = input.replace(CONTROL_CHAR_RE, "");
  if (sanitized.length !== input.length) {
    flags.push("control_chars_removed");
  }

  // Prompt injection detection
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sanitized.trim())) {
      return { blocked: true, reason_code: "PROMPT_INJECTION_DETECTED", sanitized_input: sanitized, flags };
    }
  }

  return { blocked: false, reason_code: null, sanitized_input: sanitized, flags };
}

// --- PII Shield (synthesized from GRID mycelium/safety.py + privacy/engine.py) ---

export interface PIIDetectionResult {
  pii_found: boolean;
  types_detected: string[];
  type_counts: Record<string, number>;
  redacted_text: string;
}

// Patterns adapted from GRID _PII_PATTERNS (safety.py lines 83-99)
// Intentionally excludes IP addresses — meeting notes often contain version numbers
const PII_PATTERNS: Record<string, RegExp> = {
  email_address:          /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone_number:           /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  social_security_number: /\b\d{3}-\d{2}-\d{4}\b/g,
  credit_card_number:     /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
};

export function detectAndRedactPII(text: string): PIIDetectionResult {
  const types_detected: string[] = [];
  const type_counts: Record<string, number> = {};
  let redacted = text;

  for (const [piiType, pattern] of Object.entries(PII_PATTERNS)) {
    const matches = text.match(new RegExp(pattern.source, pattern.flags));
    if (matches && matches.length > 0) {
      types_detected.push(piiType);
      type_counts[piiType] = matches.length;
      redacted = redacted.replace(new RegExp(pattern.source, pattern.flags), "[REDACTED]");
    }
  }

  return { pii_found: types_detected.length > 0, types_detected, type_counts, redacted_text: redacted };
}
