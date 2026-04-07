import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetUser = vi.fn<(userId: string) => Promise<unknown>>();
const mockUpdateUser = vi.fn<(user: unknown) => Promise<void>>();
const mockGenerateMessageResponse = vi.fn<
  (
    userMessage: string,
    history: Array<{ role: string; content: string }>,
    routingContext?: {
      user_id?: string;
      allow_routing_memory?: boolean;
      deep_read_override?: boolean;
      openai_override?: 'auto' | 'force' | 'never';
    }
  ) => Promise<unknown>
>();
const mockGetSession = vi.fn<(sessionId: string) => Promise<unknown>>();
const mockAcquireSessionLock = vi.fn<(sessionId: string) => Promise<boolean>>(
  async () => true
);
const mockReleaseSessionLock = vi.fn<(sessionId: string) => Promise<void>>(
  async () => {}
);
const mockUpdateSession = vi.fn<(session: unknown) => Promise<void>>(
  async () => {}
);
const mockRecordTurn =
  vi.fn<
    (
      session: unknown,
      latencyMs: number,
      gateType: string,
      brief: string,
      userMessage: string
    ) => void
  >();

vi.mock('@/lib/auth-middleware', () => ({
  requireAuth: vi.fn(async () => ({
    user: { user_id: 'smoke-user' },
  })),
  isAuthenticated: vi.fn(() => true),
}));

vi.mock('@/lib/data-layer', () => ({
  getUser: (userId: string) => mockGetUser(userId),
  updateUser: (user: unknown) => mockUpdateUser(user),
}));

vi.mock('@/lib/audit', () => ({
  auditAction: vi.fn(async () => {}),
}));

vi.mock('@/lib/rate-limit', () => ({
  getSessionRateLimiter: () => ({}),
  checkRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/session-message-adapter', () => ({
  generateMessageResponse: (
    userMessage: string,
    history: Array<{ role: string; content: string }>,
    routingContext?: {
      user_id?: string;
      allow_routing_memory?: boolean;
      deep_read_override?: boolean;
      openai_override?: 'auto' | 'force' | 'never';
    }
  ) => mockGenerateMessageResponse(userMessage, history, routingContext),
}));

vi.mock('@/lib/session-controller', () => ({
  acquireSessionLock: (sessionId: string) => mockAcquireSessionLock(sessionId),
  releaseSessionLock: (sessionId: string) => mockReleaseSessionLock(sessionId),
  getSession: (sessionId: string) => mockGetSession(sessionId),
  updateSession: (session: unknown) => mockUpdateSession(session),
  recordTurn: (
    session: unknown,
    latencyMs: number,
    gateType: string,
    brief: string,
    userMessage: string
  ) => mockRecordTurn(session, latencyMs, gateType, brief, userMessage),
  enforceSessionLimits: vi.fn(() => ({ allowed: true })),
}));

vi.mock('@/lib/provenance', () => ({
  createDPR: vi.fn(() => ({
    dpr_id: 'smoke',
    chain_hash: 'hash',
    sequence_number: 1,
  })),
  getChainRef: vi.fn(() => ({
    dpr_id: 'smoke',
    chain_hash: 'hash',
    sequence_number: 1,
  })),
  storeDPR: vi.fn(async () => {}),
}));

vi.mock('@/lib/safety-pipeline', () => ({
  runSafetyPipeline: vi.fn(() => ({
    allowed: true,
    sanitized_message: 'sanitized message',
    blocked_by: null,
    reason: null,
    pre_check: { blocked: false, flags: [] },
    pii: { pii_found: false, type_counts: {} },
  })),
}));

vi.mock('@/lib/safety', () => ({
  detectAndRedactPII: vi.fn((content: string) => ({ redacted_text: content })),
}));

vi.mock('@/lib/safety-telemetry', () => ({
  recordSafetyEvent: vi.fn(async () => {}),
}));

describe('smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      user_id: 'smoke-user',
      stripe_customer_id: 'cus_smoke',
      subscription_status: 'active',
      subscription_tier: 'trial',
      billing_cycle_anchor: new Date().toISOString(),
      consents: {
        essential_processing: {
          granted: true,
          timestamp: new Date().toISOString(),
          policy_version: 'v1.0',
        },
        session_telemetry: {
          granted: true,
          timestamp: new Date().toISOString(),
          policy_version: 'v1.0',
        },
        marketing_communications: {
          granted: false,
          timestamp: new Date().toISOString(),
          policy_version: 'v1.0',
        },
        routing_memory: {
          granted: true,
          timestamp: new Date().toISOString(),
          policy_version: 'v1.0',
        },
      },
      pending_deletion: null,
    });

    mockGetSession.mockResolvedValue({
      session_id: 'sess-smoke',
      user_id: 'smoke-user',
      tier: 'trial',
      start_time: new Date().toISOString(),
      llm_call_count: 0,
      gate_type: null,
      latency_per_turn: [],
      conversation_history: [],
      session_completed: null,
      user_proceeded: null,
      error: null,
    });

    mockGenerateMessageResponse.mockResolvedValue({
      gate_type: 'context_gate_resolution',
      brief: 'smoke-ok',
      raw: 'raw-smoke',
      provider: 'ollama',
      model_id: 'llama3.1:8b',
      model_parameters: { temperature: 0.25 },
      routing_trace: {
        task_type: 'analysis',
        scope: 'deep_read',
        complexity_score: 92,
        openai_policy: 'force',
        attempted_models: ['ollama:llama3.1:8b'],
        selected_candidates: ['llama3.1:8b'],
        memory_influence_applied: true,
        escalated_to_openai: false,
      },
    });
  });

  it('updates routing memory consent', async () => {
    const { POST } = await import('@/app/api/v1/user/consent/route');
    const request = new NextRequest('http://localhost/api/v1/user/consent', {
      method: 'POST',
      body: JSON.stringify({ routing_memory: false }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.updated).toContain('routing_memory');
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
  });

  it('passes deep-read and routing-memory context into message generation', async () => {
    const { POST } = await import('@/app/api/v1/session/[id]/message/route');
    const request = new NextRequest(
      'http://localhost/api/v1/session/sess-smoke/message',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'please analyze this carefully',
          deep_read: true,
          openai_override: 'force',
        }),
      }
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: 'sess-smoke' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.brief).toBe('smoke-ok');
    expect(mockGenerateMessageResponse).toHaveBeenCalledWith(
      'sanitized message',
      [],
      expect.objectContaining({
        user_id: 'smoke-user',
        allow_routing_memory: true,
        deep_read_override: true,
        openai_override: 'force',
      })
    );
  });
});
