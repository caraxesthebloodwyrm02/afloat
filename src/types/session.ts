export type GateType =
  | "meeting_triage"
  | "priority_decision"
  | "quick_briefing"
  | "context_gate_resolution"
  | "out_of_scope"
  | "unclassified";

export interface SessionState {
  session_id: string;
  user_id: string;
  start_time: string;
  llm_call_count: number;
  gate_type: GateType | null;
  latency_per_turn: number[];
  conversation_history: Array<{ role: "user" | "assistant"; content: string }>;
  session_completed: boolean | null;
  user_proceeded: boolean | null;
  error: string | null;
}

export interface SessionLog {
  session_id: string;
  start_time: string;
  end_time: string;
  turns: number;
  gate_type: GateType | null;
  user_proceeded: boolean;
  session_completed: boolean;
  latency_per_turn: number[];
  error: string | null;
}

export const MAX_LLM_CALLS = 2;
export const MAX_DURATION_MS = 120_000;
