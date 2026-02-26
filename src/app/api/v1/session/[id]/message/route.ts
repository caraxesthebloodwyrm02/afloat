import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, isAuthenticated } from "@/lib/auth-middleware";
import {
  getSession,
  updateSession,
  enforceSessionLimits,
  recordTurn,
  acquireSessionLock,
  releaseSessionLock,
} from "@/lib/session-controller";
import { LLMError } from "@/lib/llm";
import { generateMessageResponse } from "@/lib/session-message-adapter";
import { getSessionRateLimiter, checkRateLimit } from "@/lib/rate-limit";
import { MAX_LLM_CALLS } from "@/types/session";
import { createDPR, getChainRef, storeDPR } from "@/lib/provenance";
import type { SafetyVerdict } from "@/lib/provenance";
import type { SessionMessageResponse, ApiError } from "@/types/api";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(request);
  if (!isAuthenticated(authResult)) return authResult;

  const { user } = authResult;
  const safetyVerdicts: SafetyVerdict[] = [];
  let parentRef: { dpr_id: string; chain_hash: string; sequence_number: number } | null = null;

  const authDPR = createDPR({
    decision_type: "gate_verdict",
    action_taken: "authentication_check",
    reasoning_summary: "JWT bearer token validated",
    authority_type: "system_policy",
    actor_id: user.user_id,
    safety_verdicts: [{ gate_id: "jwt_auth", gate_type: "auth", verdict: "pass", latency_ms: 0, confidence: 1.0 }],
  }, null);
  parentRef = getChainRef(authDPR);
  safetyVerdicts.push({ gate_id: "jwt_auth", gate_type: "auth", verdict: "pass", latency_ms: 0, confidence: 1.0 });

  const rateLimitStart = Date.now();
  const rateLimitResponse = await checkRateLimit(
    getSessionRateLimiter(),
    user.user_id
  );
  const rateLimitMs = Date.now() - rateLimitStart;
  if (rateLimitResponse) {
    safetyVerdicts.push({ gate_id: "session_rate_limit", gate_type: "rate_limit", verdict: "block", latency_ms: rateLimitMs, confidence: 1.0 });
    const rlDPR = createDPR({
      decision_type: "gate_verdict",
      action_taken: "rate_limit_enforcement",
      reasoning_summary: "Session rate limit exceeded",
      authority_type: "system_policy",
      actor_id: user.user_id,
      safety_verdicts: safetyVerdicts,
    }, parentRef);
    storeDPR(rlDPR).catch(() => { });
    return rateLimitResponse;
  }
  safetyVerdicts.push({ gate_id: "session_rate_limit", gate_type: "rate_limit", verdict: "pass", latency_ms: rateLimitMs, confidence: 1.0 });

  const { id: sessionId } = await params;

  // Acquire session lock to prevent concurrent LLM calls (race condition)
  const lockAcquired = await acquireSessionLock(sessionId);
  if (!lockAcquired) {
    return NextResponse.json<ApiError>(
      { error: "rate_limit", message: "Request already in progress for this session." },
      { status: 429 }
    );
  }

  try { // session lock scope
    const session = await getSession(sessionId);

    if (!session) {
      return NextResponse.json<ApiError>(
        { error: "not_found", message: "Session not found." },
        { status: 404 }
      );
    }

    if (session.user_id !== user.user_id) {
      return NextResponse.json<ApiError>(
        { error: "forbidden", message: "Access denied." },
        { status: 403 }
      );
    }

    let body: { message?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json<ApiError>(
        { error: "empty_input", message: "Invalid request body." },
        { status: 400 }
      );
    }

    const userMessage = body.message ?? "";

    // Input length validation — prevent token abuse
    const MAX_INPUT_LENGTH = 2000;
    if (userMessage.length > MAX_INPUT_LENGTH) {
      return NextResponse.json<ApiError>(
        { error: "empty_input", message: `Message too long. Maximum ${MAX_INPUT_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const enforcement = enforceSessionLimits(session, userMessage);
    if (!enforcement.allowed) {
      safetyVerdicts.push({ gate_id: "session_enforce", gate_type: "boundary", verdict: "block", latency_ms: 0, confidence: 1.0 });
      const enforceDPR = createDPR({
        decision_type: "gate_verdict",
        action_taken: "session_limit_enforcement",
        input_context: userMessage,
        reasoning_summary: `Session enforcement: ${enforcement.errorCode}`,
        authority_type: "system_policy",
        actor_id: user.user_id,
        safety_verdicts: safetyVerdicts,
      }, parentRef);
      storeDPR(enforceDPR, sessionId).catch(() => { });
      return NextResponse.json<ApiError>(
        { error: enforcement.errorCode!, message: enforcement.errorMessage! },
        { status: enforcement.errorCode === "empty_input" ? 400 : 409 }
      );
    }
    safetyVerdicts.push({ gate_id: "session_enforce", gate_type: "boundary", verdict: "pass", latency_ms: 0, confidence: 1.0 });

    const enforceDPR = createDPR({
      decision_type: "gate_verdict",
      action_taken: "session_limit_check",
      input_context: userMessage,
      reasoning_summary: "Session limits within bounds",
      authority_type: "system_policy",
      actor_id: user.user_id,
      safety_verdicts: safetyVerdicts,
    }, parentRef);
    parentRef = getChainRef(enforceDPR);

    const startTime = Date.now();

    try {
      const llmResponse = await generateMessageResponse(
        userMessage,
        session.conversation_history
      );

      const latencyMs = Date.now() - startTime;
      recordTurn(session, latencyMs, llmResponse.gate_type, llmResponse.brief, userMessage);
      await updateSession(session);

      const turnsRemaining = MAX_LLM_CALLS - session.llm_call_count;

      const generationDPR = createDPR({
        decision_type: "generation",
        action_taken: "llm_response_delivery",
        input_context: userMessage,
        output_content: llmResponse.brief,
        model_id: "gpt-4o-mini",
        model_parameters: { temperature: 0.3, max_tokens: 300 },
        confidence: null,
        reasoning_summary: `Gate: ${llmResponse.gate_type}, turns remaining: ${turnsRemaining}`,
        authority_type: "system_policy",
        actor_id: user.user_id,
        safety_verdicts: safetyVerdicts,
      }, parentRef);

      Promise.all([
        storeDPR(authDPR, sessionId),
        storeDPR(enforceDPR, sessionId),
        storeDPR(generationDPR, sessionId),
      ]).catch((err) => { console.error("[provenance] Failed to store DPR chain:", err); });

      return NextResponse.json<SessionMessageResponse>({
        gate_type: llmResponse.gate_type,
        brief: llmResponse.brief,
        session_status: turnsRemaining > 0 ? "active" : "complete",
        turns_remaining: turnsRemaining,
      });
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      session.llm_call_count += 1;
      session.latency_per_turn.push(latencyMs / 1000);
      session.error =
        error instanceof LLMError ? error.reason : "unknown";
      await updateSession(session);

      const message =
        error instanceof LLMError
          ? error.message
          : "I couldn't process that. Please try again.";

      const errorDPR = createDPR({
        decision_type: "generation",
        action_taken: "llm_error_occurred",
        input_context: userMessage,
        reasoning_summary: `LLM error: ${error instanceof LLMError ? error.reason : "unknown"}`,
        authority_type: "system_policy",
        actor_id: user.user_id,
        safety_verdicts: safetyVerdicts,
      }, parentRef);
      Promise.all([
        storeDPR(authDPR, sessionId),
        storeDPR(enforceDPR, sessionId),
        storeDPR(errorDPR, sessionId),
      ]).catch((err) => { console.error("[provenance] Failed to store DPR chain:", err); });

      return NextResponse.json<ApiError>(
        { error: "llm_error", message },
        { status: 502 }
      );
    }
  } finally {
    await releaseSessionLock(sessionId);
  }
}
