import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('In-Memory Session Store - Core Enforcement Logic', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('============================================================', () => {
    describe('CORE TEST: System blocks request when turn limit reached', () => {
      it("MUST return { error: 'session_complete' } when llm_call_count >= max_llm_calls (2)", async () => {
        const {
          createSession,
          enforceSessionLimits,
          getSessionDeadline,
          clearAllSessions,
        } = await import('@/lib/memory-session-store');

        clearAllSessions();

        const session = createSession('test-user-id', 'free_trial');
        session.llm_call_count = 2;

        const deadline = getSessionDeadline(session.session_id)!;
        const result = enforceSessionLimits(
          session,
          'This should be blocked',
          deadline
        );

        expect(result.allowed).toBe(false);
        expect(result.errorCode).toBe('session_complete');
        expect(result.errorMessage).toBe('Session limit reached.');
      });
    });
  });

  describe('============================================================', () => {
    describe('Timer Enforcement (120-second server-side)', () => {
      it("MUST return { error: 'session_timeout' } when session deadline passed", async () => {
        const { createSession, enforceSessionLimits, clearAllSessions } =
          await import('@/lib/memory-session-store');

        clearAllSessions();

        const session = createSession('test-user-id', 'free_trial');
        const expiredDeadline = Date.now() - 1_000;

        const result = enforceSessionLimits(
          session,
          'This should timeout',
          expiredDeadline
        );

        expect(result.allowed).toBe(false);
        expect(result.errorCode).toBe('session_timeout');
        expect(result.errorMessage).toBe('Session time limit reached.');
      });

      it('enforces 120000ms (120s) deadline for trial tier', async () => {
        const { createSession, getSessionDeadline, clearAllSessions } =
          await import('@/lib/memory-session-store');
        const { getTierLimits } = await import('@/types/session');

        clearAllSessions();

        const session = createSession('test-user-id', 'free_trial');
        const limits = getTierLimits('free_trial');

        expect(limits.maxDurationMs).toBe(120_000);
        expect(limits.maxLlmCalls).toBe(2);

        const deadline = getSessionDeadline(session.session_id)!;
        const startTime = new Date(session.start_time).getTime();
        const expectedDeadline = startTime + 120_000;

        expect(deadline).toBe(expectedDeadline);
      });
    });
  });

  describe('============================================================', () => {
    describe('Empty Input Handling', () => {
      it('MUST reject empty messages with empty_input error', async () => {
        const {
          createSession,
          enforceSessionLimits,
          getSessionDeadline,
          clearAllSessions,
        } = await import('@/lib/memory-session-store');

        clearAllSessions();

        const session = createSession('test-user-id', 'free_trial');
        const deadline = getSessionDeadline(session.session_id)!;

        const result = enforceSessionLimits(session, '', deadline);

        expect(result.allowed).toBe(false);
        expect(result.errorCode).toBe('empty_input');
        expect(result.errorMessage).toBe(
          "Please describe what you're stuck on."
        );
      });

      it('MUST reject whitespace-only messages', async () => {
        const {
          createSession,
          enforceSessionLimits,
          getSessionDeadline,
          clearAllSessions,
        } = await import('@/lib/memory-session-store');

        clearAllSessions();

        const session = createSession('test-user-id', 'free_trial');
        const deadline = getSessionDeadline(session.session_id)!;

        const result = enforceSessionLimits(session, '   \n\t  ', deadline);

        expect(result.allowed).toBe(false);
        expect(result.errorCode).toBe('empty_input');
      });
    });
  });

  describe('============================================================', () => {
    describe('Turn Counter Correctness Across Multiple Calls', () => {
      it('allows request when llm_call_count = 0 (first turn)', async () => {
        const {
          createSession,
          enforceSessionLimits,
          getSessionDeadline,
          clearAllSessions,
        } = await import('@/lib/memory-session-store');

        clearAllSessions();
        const session = createSession('test-user-id', 'free_trial');
        const deadline = getSessionDeadline(session.session_id)!;

        const result = enforceSessionLimits(session, 'First message', deadline);

        expect(result.allowed).toBe(true);
        expect(result.errorCode).toBeUndefined();
      });

      it('allows request when llm_call_count = 1 (second turn)', async () => {
        const {
          createSession,
          enforceSessionLimits,
          getSessionDeadline,
          clearAllSessions,
        } = await import('@/lib/memory-session-store');

        clearAllSessions();
        const session = createSession('test-user-id', 'free_trial');
        session.llm_call_count = 1;
        const deadline = getSessionDeadline(session.session_id)!;

        const result = enforceSessionLimits(
          session,
          'Follow-up question',
          deadline
        );

        expect(result.allowed).toBe(true);
      });

      it('BLOCKS request when llm_call_count = 2 (third turn)', async () => {
        const {
          createSession,
          enforceSessionLimits,
          getSessionDeadline,
          clearAllSessions,
        } = await import('@/lib/memory-session-store');

        clearAllSessions();
        const session = createSession('test-user-id', 'free_trial');
        session.llm_call_count = 2;
        const deadline = getSessionDeadline(session.session_id)!;

        const result = enforceSessionLimits(
          session,
          'Third message - should fail',
          deadline
        );

        expect(result.allowed).toBe(false);
        expect(result.errorCode).toBe('session_complete');
      });
    });
  });
});

describe('In-Memory Session Store (Phase 2 Testing)', () => {
  describe('Turn Limit Enforcement', () => {
    it('allows first turn (llm_call_count = 0)', async () => {
      const {
        createSession,
        enforceSessionLimits,
        getSessionDeadline,
        clearAllSessions,
      } = await import('@/lib/memory-session-store');

      clearAllSessions();
      const session = createSession('user-123', 'free_trial');
      const deadline = getSessionDeadline(session.session_id)!;

      const result = enforceSessionLimits(session, 'Hello', deadline);

      expect(result.allowed).toBe(true);
      expect(result.errorCode).toBeUndefined();
    });

    it('allows second turn (llm_call_count = 1)', async () => {
      const {
        createSession,
        enforceSessionLimits,
        getSessionDeadline,
        clearAllSessions,
      } = await import('@/lib/memory-session-store');

      clearAllSessions();
      const session = createSession('user-456', 'free_trial');
      session.llm_call_count = 1;
      const deadline = getSessionDeadline(session.session_id)!;

      const result = enforceSessionLimits(
        session,
        'Follow-up question',
        deadline
      );

      expect(result.allowed).toBe(true);
    });

    it('BLOCKS third turn (llm_call_count = 2) with session_complete error', async () => {
      const {
        createSession,
        enforceSessionLimits,
        getSessionDeadline,
        clearAllSessions,
      } = await import('@/lib/memory-session-store');

      clearAllSessions();
      const session = createSession('user-789', 'free_trial');
      session.llm_call_count = 2;
      const deadline = getSessionDeadline(session.session_id)!;

      const result = enforceSessionLimits(
        session,
        'This should be blocked',
        deadline
      );

      expect(result.allowed).toBe(false);
      expect(result.errorCode).toBe('session_complete');
      expect(result.errorMessage).toBe('Session limit reached.');
    });
  });

  describe('Timer Enforcement (120-second server-side)', () => {
    it('allows requests within deadline', async () => {
      const { createSession, enforceSessionLimits, clearAllSessions } =
        await import('@/lib/memory-session-store');

      clearAllSessions();
      const session = createSession('user-timer-1', 'free_trial');
      const futureDeadline = Date.now() + 60_000;

      const result = enforceSessionLimits(
        session,
        'Test message',
        futureDeadline
      );

      expect(result.allowed).toBe(true);
    });

    it('BLOCKS requests past deadline with session_timeout error', async () => {
      const { createSession, enforceSessionLimits, clearAllSessions } =
        await import('@/lib/memory-session-store');

      clearAllSessions();
      const session = createSession('user-timer-2', 'free_trial');
      const expiredDeadline = Date.now() - 1_000;

      const result = enforceSessionLimits(
        session,
        'Too late message',
        expiredDeadline
      );

      expect(result.allowed).toBe(false);
      expect(result.errorCode).toBe('session_timeout');
      expect(result.errorMessage).toBe('Session time limit reached.');
    });

    it('enforces 120000ms (120s) deadline for trial tier', async () => {
      const { createSession, getSessionDeadline, clearAllSessions } =
        await import('@/lib/memory-session-store');
      const { getTierLimits } = await import('@/types/session');

      clearAllSessions();
      const session = createSession('user-120s', 'free_trial');
      const limits = getTierLimits('free_trial');

      expect(limits.maxDurationMs).toBe(120_000);

      const deadline = getSessionDeadline(session.session_id)!;
      const startTime = new Date(session.start_time).getTime();
      const expectedDeadline = startTime + 120_000;

      expect(deadline).toBe(expectedDeadline);
    });
  });

  describe('Empty Input Handling', () => {
    it('rejects empty string', async () => {
      const {
        createSession,
        enforceSessionLimits,
        getSessionDeadline,
        clearAllSessions,
      } = await import('@/lib/memory-session-store');

      clearAllSessions();
      const session = createSession('user-empty', 'free_trial');
      const deadline = getSessionDeadline(session.session_id)!;

      const result = enforceSessionLimits(session, '', deadline);

      expect(result.allowed).toBe(false);
      expect(result.errorCode).toBe('empty_input');
    });

    it('rejects whitespace-only string', async () => {
      const {
        createSession,
        enforceSessionLimits,
        getSessionDeadline,
        clearAllSessions,
      } = await import('@/lib/memory-session-store');

      clearAllSessions();
      const session = createSession('user-whitespace', 'free_trial');
      const deadline = getSessionDeadline(session.session_id)!;

      const result = enforceSessionLimits(session, '   \n\t  ', deadline);

      expect(result.allowed).toBe(false);
      expect(result.errorCode).toBe('empty_input');
    });
  });
});

describe('Tier Limits Contract', () => {
  it('free_trial tier: max 2 LLM calls, 120000ms duration', async () => {
    const { getTierLimits } = await import('@/types/session');

    const trial = getTierLimits('free_trial');

    expect(trial.maxLlmCalls).toBe(2);
    expect(trial.maxDurationMs).toBe(120_000);
  });

  it('pro tier: max 8 LLM calls, 1800000ms (30 min) duration', async () => {
    const { getTierLimits } = await import('@/types/session');

    const pro = getTierLimits('pro');

    expect(pro.maxLlmCalls).toBe(8);
    expect(pro.maxDurationMs).toBe(1_800_000);
  });

  it('unknown tier falls back to starter limits', async () => {
    const { getTierLimits } = await import('@/types/session');

    const unknown = getTierLimits('unknown-tier');

    expect(unknown.maxLlmCalls).toBe(4);
    expect(unknown.maxDurationMs).toBe(300_000);
  });
});
