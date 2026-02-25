import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, isAuthenticated } from "@/lib/auth-middleware";
import {
  getSession,
  updateSession,
  enforceSessionLimits,
  recordTurn,
} from "@/lib/session-controller";
import { callLLMWithRetry, LLMError } from "@/lib/llm";
import { getSessionRateLimiter, checkRateLimit } from "@/lib/rate-limit";
import { MAX_LLM_CALLS } from "@/types/session";
import type { SessionMessageResponse, ApiError } from "@/types/api";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(request);
  if (!isAuthenticated(authResult)) return authResult;

  const { user } = authResult;

  const rateLimitResponse = await checkRateLimit(
    getSessionRateLimiter(),
    user.user_id
  );
  if (rateLimitResponse) return rateLimitResponse;

  const { id: sessionId } = await params;
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

  const enforcement = enforceSessionLimits(session, userMessage);
  if (!enforcement.allowed) {
    return NextResponse.json<ApiError>(
      { error: enforcement.errorCode!, message: enforcement.errorMessage! },
      { status: enforcement.errorCode === "empty_input" ? 400 : 200 }
    );
  }

  const startTime = Date.now();

  try {
    const llmResponse = await callLLMWithRetry(
      userMessage,
      session.conversation_history
    );

    const latencyMs = Date.now() - startTime;
    recordTurn(session, latencyMs, llmResponse.gate_type, llmResponse.brief, userMessage);
    await updateSession(session);

    const turnsRemaining = MAX_LLM_CALLS - session.llm_call_count;

    return NextResponse.json<SessionMessageResponse>({
      gate_type: llmResponse.gate_type,
      brief: llmResponse.brief,
      session_status: turnsRemaining > 0 ? "active" : "complete",
      turns_remaining: turnsRemaining,
    });
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    session.latency_per_turn.push(latencyMs / 1000);
    session.error =
      error instanceof LLMError ? error.reason : "unknown";
    await updateSession(session);

    const message =
      error instanceof LLMError
        ? error.message
        : "I couldn't process that. Please try again.";

    return NextResponse.json<ApiError>(
      { error: "llm_error", message },
      { status: 502 }
    );
  }
}
