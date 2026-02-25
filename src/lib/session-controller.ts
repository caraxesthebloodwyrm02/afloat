import { v4 as uuidv4 } from "uuid";
import { getRedis } from "./redis";
import type { SessionState, GateType } from "@/types/session";
import { MAX_LLM_CALLS, MAX_DURATION_MS } from "@/types/session";

const SESSION_PREFIX = "session:";
const SESSION_LOCK_PREFIX = "session_lock:";
const SESSION_TTL_SECONDS = 150; // slightly longer than 120s to allow final writes

export async function createSession(userId: string): Promise<SessionState> {
  const redis = getRedis();
  const session: SessionState = {
    session_id: uuidv4(),
    user_id: userId,
    start_time: new Date().toISOString(),
    llm_call_count: 0,
    gate_type: null,
    latency_per_turn: [],
    conversation_history: [],
    session_completed: null,
    user_proceeded: null,
    error: null,
  };

  await redis.set(`${SESSION_PREFIX}${session.session_id}`, JSON.stringify(session), {
    ex: SESSION_TTL_SECONDS,
  });

  return session;
}

export async function getSession(sessionId: string): Promise<SessionState | null> {
  const redis = getRedis();
  const data = await redis.get<string>(`${SESSION_PREFIX}${sessionId}`);
  if (!data) return null;
  return typeof data === "string" ? JSON.parse(data) : data as unknown as SessionState;
}

export async function updateSession(session: SessionState): Promise<void> {
  const redis = getRedis();
  const ttlMs = MAX_DURATION_MS - (Date.now() - new Date(session.start_time).getTime());
  const ttlSeconds = Math.max(Math.ceil(ttlMs / 1000) + 30, 10);

  // Strip conversation_history before persisting — user text must not be written to the data layer (DF-01)
  const { conversation_history: _stripped, ...persistable } = session;
  const toStore = { ...persistable, conversation_history: [] };

  await redis.set(`${SESSION_PREFIX}${session.session_id}`, JSON.stringify(toStore), {
    ex: ttlSeconds,
  });
}

export async function deleteSession(sessionId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`${SESSION_PREFIX}${sessionId}`);
  await redis.del(`${SESSION_LOCK_PREFIX}${sessionId}`);
}

export async function acquireSessionLock(sessionId: string): Promise<boolean> {
  const redis = getRedis();
  const result = await redis.set(`${SESSION_LOCK_PREFIX}${sessionId}`, "1", {
    nx: true,
    ex: 10, // auto-release after 10s to prevent deadlocks
  });
  return result === "OK";
}

export async function releaseSessionLock(sessionId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`${SESSION_LOCK_PREFIX}${sessionId}`);
}

export interface EnforcementResult {
  allowed: boolean;
  errorCode?: "session_complete" | "session_timeout" | "empty_input";
  errorMessage?: string;
}

export function enforceSessionLimits(
  session: SessionState,
  userMessage: string
): EnforcementResult {
  if (!userMessage || !userMessage.trim()) {
    return {
      allowed: false,
      errorCode: "empty_input",
      errorMessage: "Please describe what you're stuck on.",
    };
  }

  const elapsed = Date.now() - new Date(session.start_time).getTime();
  if (elapsed > MAX_DURATION_MS) {
    return {
      allowed: false,
      errorCode: "session_timeout",
      errorMessage: "Session time limit reached.",
    };
  }

  if (session.llm_call_count >= MAX_LLM_CALLS) {
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
  // NOTE: conversation_history is maintained in-memory only for the API call.
  // It is NOT written to the data layer — see updateSession which strips it.
  session.conversation_history.push(
    { role: "user", content: userMessage },
    { role: "assistant", content: assistantBrief }
  );
}
