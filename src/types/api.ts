export type ApiErrorCode =
  | "session_complete"
  | "session_timeout"
  | "empty_input"
  | "llm_error"
  | "rate_limit"
  | "unauthorized"
  | "not_found"
  | "forbidden"
  | "server_error";

export interface ApiError {
  error: ApiErrorCode;
  message: string;
}

export interface SessionStartResponse {
  session_id: string;
  tier: string;
  max_duration_ms: number;
  max_turns: number;
}

export interface SessionMessageResponse {
  gate_type: string;
  brief: string;
  session_status: "active" | "complete";
  turns_remaining: number;
}

export interface SessionEndResponse {
  session_id: string;
  session_completed: boolean;
}

export interface HealthResponse {
  status: "ok";
  timestamp: string;
  version: string;
}
