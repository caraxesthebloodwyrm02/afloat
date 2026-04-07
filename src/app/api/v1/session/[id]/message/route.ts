import { requireAuth, isAuthenticated } from '@/lib/auth-middleware';
import { LLMError } from '@/lib/llm';
import type { SafetyVerdict } from '@/lib/provenance';
import { createDPR, getChainRef, storeDPR } from '@/lib/provenance';
import { checkRateLimit, getSessionRateLimiter } from '@/lib/rate-limit';
import {
  acquireSessionLock,
  enforceSessionLimits,
  getSession,
  recordTurn,
  releaseSessionLock,
  updateSession,
} from '@/lib/session-controller';
import { detectAndRedactPII } from '@/lib/safety';
import { runSafetyPipeline } from '@/lib/safety-pipeline';
import { recordSafetyEvent } from '@/lib/safety-telemetry';
import { generateMessageResponse } from '@/lib/session-message-adapter';
import { auditAction } from '@/lib/audit';
import { getUser } from '@/lib/data-layer';
import {
  buildLLMRoutingContext,
  normalizeSessionMessageRequestBody,
} from '@/lib/session-message-request';
import type {
  ApiError,
  SessionMessageRequestBody,
  SessionMessageResponse,
} from '@/types/api';
import { getTierLimits } from '@/types/session';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (!isAuthenticated(authResult)) return authResult;

  const { user } = authResult;
  const safetyVerdicts: SafetyVerdict[] = [];
  let parentRef: {
    dpr_id: string;
    chain_hash: string;
    sequence_number: number;
  } | null = null;

  const authDPR = createDPR(
    {
      decision_type: 'gate_verdict',
      action_taken: 'authentication_check',
      reasoning_summary: 'JWT bearer token validated',
      authority_type: 'system_policy',
      actor_id: user.user_id,
      safety_verdicts: [
        {
          gate_id: 'jwt_auth',
          gate_type: 'auth',
          verdict: 'pass',
          latency_ms: 0,
          confidence: 1.0,
        },
      ],
    },
    null
  );
  parentRef = getChainRef(authDPR);
  safetyVerdicts.push({
    gate_id: 'jwt_auth',
    gate_type: 'auth',
    verdict: 'pass',
    latency_ms: 0,
    confidence: 1.0,
  });

  const rateLimitStart = Date.now();
  const rateLimitResponse = await checkRateLimit(
    getSessionRateLimiter(),
    user.user_id
  );
  const rateLimitMs = Date.now() - rateLimitStart;
  if (rateLimitResponse) {
    safetyVerdicts.push({
      gate_id: 'session_rate_limit',
      gate_type: 'rate_limit',
      verdict: 'block',
      latency_ms: rateLimitMs,
      confidence: 1.0,
    });
    const rlDPR = createDPR(
      {
        decision_type: 'gate_verdict',
        action_taken: 'rate_limit_enforcement',
        reasoning_summary: 'Session rate limit exceeded',
        authority_type: 'system_policy',
        actor_id: user.user_id,
        safety_verdicts: safetyVerdicts,
      },
      parentRef
    );
    storeDPR(rlDPR).catch(() => {});
    return rateLimitResponse;
  }
  safetyVerdicts.push({
    gate_id: 'session_rate_limit',
    gate_type: 'rate_limit',
    verdict: 'pass',
    latency_ms: rateLimitMs,
    confidence: 1.0,
  });

  const { id: sessionId } = await params;

  // Acquire session lock to prevent concurrent LLM calls (race condition)
  const lockAcquired = await acquireSessionLock(sessionId);
  if (!lockAcquired) {
    return NextResponse.json<ApiError>(
      {
        error: 'rate_limit',
        message: 'Request already in progress for this session.',
      },
      { status: 429 }
    );
  }

  try {
    // session lock scope
    const session = await getSession(sessionId);

    if (!session) {
      return NextResponse.json<ApiError>(
        { error: 'not_found', message: 'Session not found.' },
        { status: 404 }
      );
    }

    if (session.user_id !== user.user_id) {
      return NextResponse.json<ApiError>(
        { error: 'forbidden', message: 'Access denied.' },
        { status: 403 }
      );
    }

    let body: SessionMessageRequestBody | null;
    try {
      body = (await request.json()) as SessionMessageRequestBody;
    } catch {
      return NextResponse.json<ApiError>(
        { error: 'empty_input', message: 'Invalid request body.' },
        { status: 400 }
      );
    }

    const normalizedRequest = normalizeSessionMessageRequestBody(body);
    const userMessage = normalizedRequest.message;
    const clientHistory = normalizedRequest.history;

    const enforcement = enforceSessionLimits(session, userMessage);
    if (!enforcement.allowed) {
      safetyVerdicts.push({
        gate_id: 'session_enforce',
        gate_type: 'boundary',
        verdict: 'block',
        latency_ms: 0,
        confidence: 1.0,
      });
      const enforceDPR = createDPR(
        {
          decision_type: 'gate_verdict',
          action_taken: 'session_limit_enforcement',
          input_context: userMessage,
          reasoning_summary: `Session enforcement: ${enforcement.errorCode}`,
          authority_type: 'system_policy',
          actor_id: user.user_id,
          safety_verdicts: safetyVerdicts,
        },
        parentRef
      );
      storeDPR(enforceDPR, sessionId).catch(() => {});
      return NextResponse.json<ApiError>(
        { error: enforcement.errorCode!, message: enforcement.errorMessage! },
        { status: enforcement.errorCode === 'empty_input' ? 400 : 409 }
      );
    }
    safetyVerdicts.push({
      gate_id: 'session_enforce',
      gate_type: 'boundary',
      verdict: 'pass',
      latency_ms: 0,
      confidence: 1.0,
    });

    // Unified Safety Pipeline
    const sessionElapsedMs =
      Date.now() - new Date(session.start_time).getTime();
    const pipeline = runSafetyPipeline({
      userMessage,
      tier: session.tier,
      messageCount: session.llm_call_count,
      sessionDurationMs: sessionElapsedMs,
    });

    // Fire-and-forget telemetry
    recordSafetyEvent({
      event_type: 'pipeline_result',
      pre_check_flags: pipeline.pre_check.flags,
      pii_found: pipeline.pii.pii_found,
      pii_types: pipeline.pii.type_counts,
      blocked_by: pipeline.blocked_by,
    }).catch(() => {});

    // Add safety verdicts to DPR chain
    safetyVerdicts.push({
      gate_id: 'pre_check',
      gate_type: 'guardrail',
      verdict: pipeline.pre_check.blocked ? 'block' : 'pass',
      latency_ms: 0,
      confidence: 1.0,
    });
    if (pipeline.pii.pii_found) {
      safetyVerdicts.push({
        gate_id: 'pii_shield',
        gate_type: 'guardrail',
        verdict: 'warn',
        latency_ms: 0,
        confidence: 1.0,
      });
    }

    if (!pipeline.allowed) {
      if (pipeline.blocked_by === 'pre_check') {
        return NextResponse.json<ApiError>(
          {
            error: 'empty_input',
            message: pipeline.reason ?? 'Input validation failed',
          },
          { status: 400 }
        );
      }
      return NextResponse.json<ApiError>(
        {
          error: 'rate_limit',
          message: pipeline.reason ?? 'Rate limit exceeded',
        },
        { status: 429 }
      );
    }

    const enforceDPR = createDPR(
      {
        decision_type: 'gate_verdict',
        action_taken: 'session_limit_check',
        input_context: userMessage,
        reasoning_summary: 'Session limits within bounds',
        authority_type: 'system_policy',
        actor_id: user.user_id,
        safety_verdicts: safetyVerdicts,
      },
      parentRef
    );
    parentRef = getChainRef(enforceDPR);

    const startTime = Date.now();

    try {
      // Use sanitized message from safety pipeline
      const safeLLMInput = pipeline.sanitized_message;
      const safeHistory = clientHistory.map((entry) => ({
        role: entry.role,
        content: detectAndRedactPII(entry.content).redacted_text,
      }));

      const userRecord = await getUser(user.user_id);

      const llmResponse = await generateMessageResponse(
        safeLLMInput,
        safeHistory,
        buildLLMRoutingContext(user.user_id, userRecord, normalizedRequest)
      );

      const latencyMs = Date.now() - startTime;
      recordTurn(
        session,
        latencyMs,
        llmResponse.gate_type,
        llmResponse.brief,
        userMessage
      );
      await updateSession(session);

      await auditAction(request, user, {
        action: 'update',
        resource_type: 'session_log',
        resource_id: sessionId,
        outcome: 'success',
        metadata: {
          turn: session.llm_call_count,
          gate_type: llmResponse.gate_type,
        },
      });

      const turnsRemaining =
        getTierLimits(session.tier).maxLlmCalls - session.llm_call_count;

      const generationDPR = createDPR(
        {
          decision_type: 'generation',
          action_taken: 'llm_response_delivery',
          input_context: userMessage,
          output_content: llmResponse.brief,
          model_id: llmResponse.model_id,
          model_parameters: {
            ...llmResponse.model_parameters,
            provider: llmResponse.provider,
            routing_trace: llmResponse.routing_trace,
          },
          confidence: null,
          reasoning_summary:
            `Gate: ${llmResponse.gate_type}, turns remaining: ${turnsRemaining}, ` +
            `provider: ${llmResponse.provider}, model: ${llmResponse.model_id}`,
          authority_type: 'system_policy',
          actor_id: user.user_id,
          safety_verdicts: safetyVerdicts,
        },
        parentRef
      );

      Promise.all([
        storeDPR(authDPR, sessionId),
        storeDPR(enforceDPR, sessionId),
        storeDPR(generationDPR, sessionId),
      ]).catch((err) => {
        console.error('[provenance] Failed to store DPR chain:', err);
      });

      return NextResponse.json<SessionMessageResponse>({
        gate_type: llmResponse.gate_type,
        brief: llmResponse.brief,
        session_status: turnsRemaining > 0 ? 'active' : 'complete',
        turns_remaining: turnsRemaining,
      });
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      session.llm_call_count += 1;
      session.latency_per_turn.push(latencyMs / 1000);
      session.error = error instanceof LLMError ? error.reason : 'unknown';
      await updateSession(session);

      const message =
        error instanceof LLMError
          ? error.message
          : "I couldn't process that. Please try again.";

      const errorDPR = createDPR(
        {
          decision_type: 'generation',
          action_taken: 'llm_error_occurred',
          input_context: userMessage,
          reasoning_summary: `LLM error: ${error instanceof LLMError ? error.reason : 'unknown'}`,
          authority_type: 'system_policy',
          actor_id: user.user_id,
          safety_verdicts: safetyVerdicts,
        },
        parentRef
      );
      Promise.all([
        storeDPR(authDPR, sessionId),
        storeDPR(enforceDPR, sessionId),
        storeDPR(errorDPR, sessionId),
      ]).catch((err) => {
        console.error('[provenance] Failed to store DPR chain:', err);
      });

      return NextResponse.json<ApiError>(
        { error: 'llm_error', message },
        { status: 502 }
      );
    }
  } finally {
    await releaseSessionLock(sessionId);
  }
}
