import type { UserRecord } from '@/types/user';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockKv = new Map<string, string>();
const mockLists = new Map<string, string[]>();
const mockDeleteStripeCustomer = vi.fn<(customerId: string) => Promise<void>>(
  async () => {}
);
const mockEval = vi.fn(
  async (_script: string, keys: string[], values: string[]) => {
    const [key] = keys;
    mockLists.set(key, [...values]);
    return values.length;
  }
);

let evalEnabled = true;

vi.mock('@/lib/redis', () => ({
  getRedis: () => ({
    set: vi.fn(async (key: string, value: string) => {
      mockKv.set(key, value);
      return 'OK';
    }),
    get: vi.fn(async (key: string) => mockKv.get(key) ?? null),
    del: vi.fn(async (key: string) => {
      mockKv.delete(key);
      mockLists.delete(key);
      return 1;
    }),
    rpush: vi.fn(async (key: string, ...values: string[]) => {
      const list = mockLists.get(key) ?? [];
      list.push(...values);
      mockLists.set(key, list);
      return list.length;
    }),
    lrange: vi.fn(async (key: string, start: number, stop: number) => {
      const list = mockLists.get(key) ?? [];
      const end = stop === -1 ? list.length : stop + 1;
      return list.slice(start, end);
    }),
    scan: vi.fn(
      async (_cursor: number, opts?: { match?: string; count?: number }) => {
        const pattern = opts?.match ?? '*';
        const prefix = pattern.replaceAll('*', '');
        const keys = [
          ...new Set([...mockKv.keys(), ...mockLists.keys()]),
        ].filter((k) => k.startsWith(prefix));
        return [0, keys];
      }
    ),
    get eval() {
      return evalEnabled ? mockEval : undefined;
    },
  }),
}));

vi.mock('@/lib/stripe', () => ({
  deleteStripeCustomer: (customerId: string) =>
    mockDeleteStripeCustomer(customerId),
}));

function makeUser(userId: string): UserRecord {
  return {
    user_id: userId,
    stripe_customer_id: `cus_${userId}`,
    subscription_status: 'active',
    subscription_tier: 'starter',
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
        granted: false,
        timestamp: new Date().toISOString(),
        policy_version: 'v1.0',
      },
    },
    pending_deletion: null,
  };
}

function seedSessionList(
  date: string,
  entries: Array<{ user_id: string; session_id: string }>
): void {
  const key = `sessions:${date}`;
  mockLists.set(
    key,
    entries.map((e) =>
      JSON.stringify({
        session_id: e.session_id,
        user_id: e.user_id,
        tier: 'trial',
        start_time: `${date}T00:00:00Z`,
        end_time: `${date}T00:01:00Z`,
        turns: 1,
        gate_type: 'quick_briefing',
        user_proceeded: true,
        session_completed: true,
        latency_per_turn: [0.5],
        error: null,
      })
    )
  );
}

describe('data-layer branch coverage', () => {
  beforeEach(() => {
    mockKv.clear();
    mockLists.clear();
    vi.clearAllMocks();
    vi.resetModules();
    evalEnabled = true;
  });

  it('exports null when user does not exist', async () => {
    const { exportUserData } = await import('@/lib/data-layer');
    expect(await exportUserData('missing-user')).toBeNull();
  });

  it('records routing memory signal and updates escalation/task memory counters', async () => {
    const { recordRoutingMemorySignal } = await import('@/lib/data-layer');
    const userId = 'route-memory-user';

    const first = await recordRoutingMemorySignal(userId, {
      timestamp: '2026-03-31T00:00:00.000Z',
      provider: 'ollama',
      model_id: 'qwen2.5:latest',
      success: true,
      latency_ms: 1200,
      task_type: 'analysis',
      scope: 'deep_read',
      intent: 'analyze architecture',
      sentiment: 'neutral',
      deep_read: true,
      escalated_to_openai: false,
      escalation_type: 'none',
    });
    expect(first.preferred_models[0]).toBe('qwen2.5:latest');
    expect(first.task_memory.deep_read_preference).toBeGreaterThan(0);

    const second = await recordRoutingMemorySignal(userId, {
      timestamp: '2026-03-31T00:01:00.000Z',
      provider: 'openai',
      model_id: 'gpt-5.4',
      success: true,
      latency_ms: 3000,
      task_type: 'coding',
      scope: 'deep_read',
      intent: 'fallback rescue',
      sentiment: 'frustrated',
      deep_read: true,
      escalated_to_openai: true,
      escalation_type: 'auto',
    });
    expect(second.escalation.openai_auto_count).toBe(1);
    expect(second.escalation.openai_forced_count).toBe(0);
    expect(second.model_performance['gpt-5.4'].provider).toBe('openai');
  });

  it('permanently deletes user data through the redis eval branch', async () => {
    const { createUser, setStripeCustomerMapping, permanentlyDeleteUserData } =
      await import('@/lib/data-layer');
    const user = makeUser('eval-user');
    await createUser(user);
    await setStripeCustomerMapping(user.stripe_customer_id, user.user_id);
    mockKv.set(
      `routing_profile:${user.user_id}`,
      JSON.stringify({ user_id: user.user_id })
    );
    seedSessionList('2026-03-30', [
      { user_id: 'other-user', session_id: 'sess-other' },
      { user_id: user.user_id, session_id: 'sess-target' },
    ]);

    await permanentlyDeleteUserData(user.user_id);

    expect(mockDeleteStripeCustomer).toHaveBeenCalledWith(
      user.stripe_customer_id
    );
    expect(mockEval).toHaveBeenCalled();
    expect(mockKv.get(`user:${user.user_id}`)).toBeUndefined();
    expect(mockKv.get(`stripe_map:${user.stripe_customer_id}`)).toBeUndefined();
    expect(mockKv.get(`routing_profile:${user.user_id}`)).toBeUndefined();
    const remaining = mockLists.get('sessions:2026-03-30') ?? [];
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toContain('other-user');
  });

  it('permanently deletes user data through the fallback non-eval branch', async () => {
    const { createUser, setStripeCustomerMapping, permanentlyDeleteUserData } =
      await import('@/lib/data-layer');
    evalEnabled = false;

    const user = makeUser('fallback-user');
    await createUser(user);
    await setStripeCustomerMapping(user.stripe_customer_id, user.user_id);
    seedSessionList('2026-03-30', [
      { user_id: user.user_id, session_id: 'sess-target' },
      { user_id: 'other-user', session_id: 'sess-other' },
    ]);

    await permanentlyDeleteUserData(user.user_id);

    expect(mockEval).not.toHaveBeenCalled();
    const remaining = mockLists.get('sessions:2026-03-30') ?? [];
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toContain('other-user');
  });
});
