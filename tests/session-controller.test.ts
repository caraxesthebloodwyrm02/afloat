import { describe, it, expect } from 'vitest';
import { enforceSessionLimits } from '@/lib/session-controller';
import type { SessionState } from '@/types/session';

function makeSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    session_id: 'test-session-id',
    user_id: 'test-user-id',
    tier: 'starter',
    start_time: new Date().toISOString(),
    llm_call_count: 0,
    gate_type: null,
    latency_per_turn: [],
    conversation_history: [],
    session_completed: null,
    user_proceeded: null,
    error: null,
    ...overrides,
  };
}

describe('enforceSessionLimits', () => {
  it('allows a valid first message', () => {
    const session = makeSession();
    const result = enforceSessionLimits(
      session,
      'Should I attend this meeting?'
    );
    expect(result.allowed).toBe(true);
  });

  it('rejects empty input', () => {
    const session = makeSession();
    const result = enforceSessionLimits(session, '');
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe('empty_input');
  });

  it('rejects whitespace-only input', () => {
    const session = makeSession();
    const result = enforceSessionLimits(session, '   ');
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe('empty_input');
  });

  it('rejects when max LLM calls reached', () => {
    const session = makeSession({ llm_call_count: 4 });
    const result = enforceSessionLimits(session, 'follow-up question');
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe('session_complete');
  });

  it('allows second message when only 1 LLM call used', () => {
    const session = makeSession({ llm_call_count: 1 });
    const result = enforceSessionLimits(session, 'follow-up question');
    expect(result.allowed).toBe(true);
  });

  it('rejects when session has timed out', () => {
    const pastTime = new Date(Date.now() - 310_000).toISOString();
    const session = makeSession({ start_time: pastTime });
    const result = enforceSessionLimits(session, 'Am I too late?');
    expect(result.allowed).toBe(false);
    expect(result.errorCode).toBe('session_timeout');
  });

  it('allows message within time window', () => {
    const recentTime = new Date(Date.now() - 60_000).toISOString();
    const session = makeSession({ start_time: recentTime });
    const result = enforceSessionLimits(session, 'Still within time');
    expect(result.allowed).toBe(true);
  });
});
