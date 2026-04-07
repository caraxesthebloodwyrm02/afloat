import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as endSessionPOST } from '@/app/api/v1/memory-session/[id]/end/route';
import { POST as messagePOST } from '@/app/api/v1/memory-session/[id]/message/route';
import { POST as startSessionPOST } from '@/app/api/v1/memory-session/start/route';
import {
  clearAllSessions,
  createSession,
  getSession,
  getSessions,
} from '@/lib/memory-session-store';

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe('memory session routes', () => {
  beforeEach(() => {
    clearAllSessions();
    vi.restoreAllMocks();
  });

  describe('POST /api/v1/memory-session/start', () => {
    it('creates a trial session with published limits', async () => {
      const response = await startSessionPOST();
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.tier).toBe('free_trial');
      expect(body.max_duration_ms).toBe(120_000);
      expect(body.max_turns).toBe(2);
      expect(typeof body.session_id).toBe('string');
      expect(getSession(body.session_id)).not.toBeNull();
    });
  });

  describe('POST /api/v1/memory-session/[id]/message', () => {
    it('returns 404 when the session does not exist', async () => {
      const request = new NextRequest(
        'http://localhost/api/v1/memory-session/missing/message',
        {
          method: 'POST',
          body: JSON.stringify({ message: 'hello' }),
        }
      );

      const response = await messagePOST(request, makeParams('missing'));
      expect(response.status).toBe(404);
    });

    it('returns 404 when the deadline is missing', async () => {
      const session = createSession('memory-user', 'free_trial');
      getSessions().set(session.session_id, {
        ...getSessions().get(session.session_id)!,
        deadline: undefined as unknown as number,
      });

      const request = new NextRequest(
        `http://localhost/api/v1/memory-session/${session.session_id}/message`,
        {
          method: 'POST',
          body: JSON.stringify({ message: 'hello' }),
        }
      );

      const response = await messagePOST(
        request,
        makeParams(session.session_id)
      );
      expect(response.status).toBe(404);
    });

    it('returns 400 for invalid JSON', async () => {
      const session = createSession('memory-user', 'free_trial');
      const request = new NextRequest(
        `http://localhost/api/v1/memory-session/${session.session_id}/message`,
        {
          method: 'POST',
          body: '{',
        }
      );

      const response = await messagePOST(
        request,
        makeParams(session.session_id)
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe('empty_input');
    });

    it('returns 400 for empty input after normalization', async () => {
      const session = createSession('memory-user', 'free_trial');
      const request = new NextRequest(
        `http://localhost/api/v1/memory-session/${session.session_id}/message`,
        {
          method: 'POST',
          body: JSON.stringify({
            history: [{ role: 'user', content: 'prior' }],
          }),
        }
      );

      const response = await messagePOST(
        request,
        makeParams(session.session_id)
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe('empty_input');
    });

    it('returns 409 when the session deadline has expired', async () => {
      vi.useFakeTimers();
      const now = new Date('2026-03-31T00:00:00.000Z');
      vi.setSystemTime(now);

      try {
        const session = createSession('memory-user', 'free_trial');
        vi.setSystemTime(new Date(now.getTime() + 120_001));

        const request = new NextRequest(
          `http://localhost/api/v1/memory-session/${session.session_id}/message`,
          {
            method: 'POST',
            body: JSON.stringify({ message: 'too late' }),
          }
        );

        const response = await messagePOST(
          request,
          makeParams(session.session_id)
        );
        expect(response.status).toBe(409);
        expect((await response.json()).error).toBe('session_timeout');
      } finally {
        vi.useRealTimers();
      }
    });

    it('returns 409 when the session turn limit is reached', async () => {
      const session = createSession('memory-user', 'free_trial');
      const stored = getSessions().get(session.session_id)!;
      stored.llm_call_count = 2;

      const request = new NextRequest(
        `http://localhost/api/v1/memory-session/${session.session_id}/message`,
        {
          method: 'POST',
          body: JSON.stringify({ message: 'third turn' }),
        }
      );

      const response = await messagePOST(
        request,
        makeParams(session.session_id)
      );
      expect(response.status).toBe(409);
      expect((await response.json()).error).toBe('session_complete');
    });

    it('records a turn and returns an active placeholder response', async () => {
      const session = createSession('memory-user', 'free_trial');
      const request = new NextRequest(
        `http://localhost/api/v1/memory-session/${session.session_id}/message`,
        {
          method: 'POST',
          body: JSON.stringify({
            message: 'Need help debugging routing',
            history: [
              { role: 'user', content: 'old user' },
              { role: 'assistant', content: 'old assistant' },
            ],
            deep_read: true,
            openai_override: 'force',
          }),
        }
      );

      const response = await messagePOST(
        request,
        makeParams(session.session_id)
      );
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.gate_type).toBe('unclassified');
      expect(body.session_status).toBe('active');
      expect(body.turns_remaining).toBe(1);

      const stored = getSession(session.session_id)!;
      expect(stored.llm_call_count).toBe(1);
      expect(stored.gate_type).toBe('unclassified');
      expect(stored.conversation_history).toEqual([
        { role: 'user', content: 'Need help debugging routing' },
        {
          role: 'assistant',
          content: 'This is a placeholder response. LLM not connected yet.',
        },
      ]);
    });

    it('marks the session complete on the final allowed turn', async () => {
      const session = createSession('memory-user', 'free_trial');
      const stored = getSessions().get(session.session_id)!;
      stored.llm_call_count = 1;

      const request = new NextRequest(
        `http://localhost/api/v1/memory-session/${session.session_id}/message`,
        {
          method: 'POST',
          body: JSON.stringify({ message: 'second turn' }),
        }
      );

      const response = await messagePOST(
        request,
        makeParams(session.session_id)
      );
      expect(response.status).toBe(200);
      expect((await response.json()).session_status).toBe('complete');
    });
  });

  describe('POST /api/v1/memory-session/[id]/end', () => {
    it('returns 404 when the session does not exist', async () => {
      const request = new NextRequest(
        'http://localhost/api/v1/memory-session/missing/end',
        { method: 'POST' }
      );

      const response = await endSessionPOST(request, makeParams('missing'));
      expect(response.status).toBe(404);
    });

    it('ends the session and deletes it from the store', async () => {
      const session = createSession('memory-user', 'free_trial');
      const request = new NextRequest(
        `http://localhost/api/v1/memory-session/${session.session_id}/end`,
        { method: 'POST' }
      );

      const response = await endSessionPOST(
        request,
        makeParams(session.session_id)
      );
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.session_id).toBe(session.session_id);
      expect(body.session_completed).toBe(true);
      expect(getSession(session.session_id)).toBeNull();
    });
  });
});
