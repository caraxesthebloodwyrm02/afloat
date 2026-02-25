export type DecisionType =
  | "classification"
  | "generation"
  | "refusal"
  | "gate_verdict"
  | "consent_change"
  | "data_operation"
  | "escalation"
  | "circuit_breaker";

export type AuthorityType =
  | "human_consent"
  | "system_policy"
  | "autonomous_threshold"
  | "emergency_override";

export type SafetyVerdictResult = "pass" | "block" | "escalate" | "warn";

export interface SafetyVerdict {
  gate_id: string;
  gate_type: "boundary" | "guardrail" | "refusal" | "preparedness" | "rate_limit" | "auth" | "consent";
  verdict: SafetyVerdictResult;
  latency_ms: number;
  confidence: number;
}

export interface DecisionProvenanceRecord {
  dpr_id: string;
  parent_dpr_id: string | null;
  chain_hash: string;

  timestamp: string;
  sequence_number: number;

  decision_type: DecisionType;
  action_taken: string;
  output_hash: string;

  input_context_hash: string;
  model_id: string | null;
  model_parameters: Record<string, unknown> | null;
  confidence: number | null;
  reasoning_summary: string;

  authority_type: AuthorityType;
  actor_id: string;
  consent_reference: string | null;

  safety_verdicts: SafetyVerdict[];
  risk_tier: string | null;
  jurisdiction: string | null;

  signature: string;
  provenance_version: string;
}

export interface DPRCreateInput {
  decision_type: DecisionType;
  action_taken: string;
  output_content?: string;
  input_context?: string;
  model_id?: string | null;
  model_parameters?: Record<string, unknown> | null;
  confidence?: number | null;
  reasoning_summary: string;
  authority_type: AuthorityType;
  actor_id: string;
  consent_reference?: string | null;
  safety_verdicts?: SafetyVerdict[];
  risk_tier?: string | null;
  jurisdiction?: string | null;
}
