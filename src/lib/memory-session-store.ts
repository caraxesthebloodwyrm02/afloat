import { v4 as uuidv4 } from "uuid";
import type { SessionState, GateType } from "@/types/session";
import { getTierLimits } from "@/types/session";

type InMemorySession = SessionState & {
  deadline: number;
};

const sessions = new Map<string, InMemorySession>();

export function clearAllSessions(): void {
  sessions.clear();
}

export function getSessions(): Map<string, InMemorySession> {
  return sessions;
}

export function createSession(userId: string, tier: string = "trial"): SessionState {
  const limits = getTierLimits(tier);
  const now = Date.now();
  const session: InMemorySession = {
    session_id: uuidv4(),
    user_id: userId,
    tier,
    start_time: new Date(now).toISOString(),
    llm_call_count: 0,
    gate_type: null,
    latency_per_turn: [],
    conversation_history: [],
    session_completed: null,
    user_proceeded: null,
    error: null,
    deadline: now + limits.maxDurationMs,
  };

  sessions.set(session.session_id, session);
  return session;
}

export function getSession(sessionId: string): SessionState | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  
  const result: SessionState = {
    session_id: session.session_id,
    user_id: session.user_id,
    tier: session.tier,
    start_time: session.start_time,
    llm_call_count: session.llm_call_count,
    gate_type: session.gate_type,
    latency_per_turn: session.latency_per_turn,
    conversation_history: session.conversation_history,
    session_completed: session.session_completed,
    user_proceeded: session.user_proceeded,
    error: session.error,
  };
  return result;
}

export function getSessionDeadline(sessionId: string): number | null {
  const session = sessions.get(sessionId);
  return session?.deadline ?? null;
}

export function updateSession(session: SessionState): void {
  const existing = sessions.get(session.session_id);
  if (!existing) return;

  const limits = getTierLimits(session.tier);
  const updated: InMemorySession = {
    ...session,
    deadline: new Date(session.start_time).getTime() + limits.maxDurationMs,
  };
  sessions.set(session.session_id, updated);
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export interface EnforcementResult {
  allowed: boolean;
  errorCode?: "session_complete" | "session_timeout" | "empty_input";
  errorMessage?: string;
}

export function enforceSessionLimits(
  session: SessionState,
  userMessage: string,
  deadline: number
): EnforcementResult {
  if (!userMessage || !userMessage.trim()) {
    return {
      allowed: false,
      errorCode: "empty_input",
      errorMessage: "Please describe what you're stuck on.",
    };
  }

  const now = Date.now();
  if (now > deadline) {
    return {
      allowed: false,
      errorCode: "session_timeout",
      errorMessage: "Session time limit reached.",
    };
  }

  const limits = getTierLimits(session.tier);
  if (session.llm_call_count >= limits.maxLlmCalls) {
    return {
      allowed: false,
      errorCode: "session_complete",
      errorMessage: "Session limit reached.",
    };
  }

  return { allowed: true };
}

export function recordTurn(
  session: SessionState,
  latencyMs: number,
  gateType: GateType,
  assistantBrief: string,
  userMessage: string
): void {
  session.llm_call_count += 1;
  session.latency_per_turn.push(latencyMs / 1000);
  if (!session.gate_type) {
    session.gate_type = gateType;
  }
  session.conversation_history.push(
    { role: "user", content: userMessage },
    { role: "assistant", content: assistantBrief }
  );
}

export function endSession(sessionId: string): { session_completed: boolean } | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  
  const limits = getTierLimits(session.tier);
  const elapsed = Date.now() - new Date(session.start_time).getTime();
  
  session.session_completed = elapsed <= limits.maxDurationMs;
  return { session_completed: session.session_completed };
}