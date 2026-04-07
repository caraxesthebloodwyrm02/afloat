import { NextRequest, NextResponse } from 'next/server';
import {
  getSession,
  getSessionDeadline,
  enforceSessionLimits,
  recordTurn,
  updateSession,
} from '@/lib/memory-session-store';
import { normalizeSessionMessageRequestBody } from '@/lib/session-message-request';
import { getTierLimits } from '@/types/session';
import type {
  ApiError,
  SessionMessageRequestBody,
  SessionMessageResponse,
} from '@/types/api';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const session = getSession(sessionId);

  if (!session) {
    return NextResponse.json<ApiError>(
      { error: 'not_found', message: 'Session not found.' },
      { status: 404 }
    );
  }

  const deadline = getSessionDeadline(sessionId);
  if (deadline === null) {
    return NextResponse.json<ApiError>(
      { error: 'not_found', message: 'Session deadline not found.' },
      { status: 404 }
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

  const enforcement = enforceSessionLimits(session, userMessage, deadline);
  if (!enforcement.allowed) {
    const status = enforcement.errorCode === 'empty_input' ? 400 : 409;
    return NextResponse.json<ApiError>(
      { error: enforcement.errorCode!, message: enforcement.errorMessage! },
      { status }
    );
  }

  const startTime = Date.now();

  const placeholderGateType = 'unclassified' as const;
  const placeholderBrief =
    'This is a placeholder response. LLM not connected yet.';

  const latencyMs = Date.now() - startTime;

  recordTurn(
    session,
    latencyMs,
    placeholderGateType,
    placeholderBrief,
    userMessage
  );
  updateSession(session);

  const turnsRemaining =
    getTierLimits(session.tier).maxLlmCalls - session.llm_call_count;
  const sessionStatus = turnsRemaining > 0 ? 'active' : 'complete';

  return NextResponse.json<SessionMessageResponse>({
    gate_type: placeholderGateType,
    brief: placeholderBrief,
    session_status: sessionStatus,
    turns_remaining: turnsRemaining,
  });
}
