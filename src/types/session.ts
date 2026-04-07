export type GateType =
  | 'meeting_triage'
  | 'priority_decision'
  | 'quick_briefing'
  | 'context_gate_resolution'
  | 'out_of_scope'
  | 'unclassified';

export interface SessionState {
  session_id: string;
  user_id: string;
  tier: string;
  start_time: string;
  llm_call_count: number;
  gate_type: GateType | null;
  latency_per_turn: number[];
  conversation_history: Array<{ role: 'user' | 'assistant'; content: string }>;
  session_completed: boolean | null;
  user_proceeded: boolean | null;
  error: string | null;
}

export interface SessionLog {
  session_id: string;
  user_id: string;
  tier: string;
  start_time: string;
  end_time: string;
  turns: number;
  gate_type: GateType | null;
  user_proceeded: boolean;
  session_completed: boolean;
  latency_per_turn: number[];
  error: string | null;
}

export const MAX_LLM_CALLS = 4;
export const MAX_DURATION_MS = 300_000;

export interface TierLimits {
  maxLlmCalls: number;
  maxDurationMs: number;
}

export const TIER_LIMITS: Record<string, TierLimits> = {
  free_trial: { maxLlmCalls: 2, maxDurationMs: 120_000 },
  starter: { maxLlmCalls: 4, maxDurationMs: 300_000 },
  pro: { maxLlmCalls: 8, maxDurationMs: 1_800_000 },
};

export type SubscriptionTier = 'free_trial' | 'starter' | 'pro';

export const FREE_TRIAL_MAX_SESSIONS = 5;

export function getTierLimits(tier: string): TierLimits {
  return TIER_LIMITS[tier] ?? TIER_LIMITS['starter'];
}
