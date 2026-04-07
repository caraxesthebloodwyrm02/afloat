/**
 * Unit tests for provenance/store.ts — DPR persistence and chain verification.
 *
 * Uses a shared in-memory Redis mock so storeDPR writes are visible to
 * getSessionDPRs / getDPRById / verifySessionChain within the same test.
 */

import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { resetValidationCache } from '@/lib/secrets';
import { createDPR, getChainRef } from '@/lib/provenance/record';
import type { DPRCreateInput } from '@/lib/provenance/types';

// ---------------------------------------------------------------------------
// Shared Redis mock — single backing store across getRedis() calls
// ---------------------------------------------------------------------------

const mockLists = new Map<string, string[]>();
const mockKV = new Map<string, string>();

vi.mock('@/lib/redis', () => ({
  getRedis: () => ({
    get: vi.fn(async (key: string) => mockKV.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      mockKV.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      const deleted = mockKV.delete(key) || mockLists.delete(key);
      return deleted ? 1 : 0;
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
    scan: vi.fn(async () => [0, []]),
  }),
}));

// ---------------------------------------------------------------------------
// Environment setup (signing key needed for verifySessionChain)
// ---------------------------------------------------------------------------

beforeAll(() => {
  resetValidationCache();
  process.env.JWT_SECRET = 'test-provenance-secret-for-unit-tests';
});

afterAll(() => {
  resetValidationCache();
});

beforeEach(() => {
  mockLists.clear();
  mockKV.clear();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<DPRCreateInput> = {}): DPRCreateInput {
  return {
    decision_type: 'gate_verdict',
    action_taken: 'authentication_check',
    reasoning_summary: 'JWT validated',
    authority_type: 'system_policy',
    actor_id: 'user-123',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('storeDPR', () => {
  it('writes to date-key via rpush', async () => {
    const { storeDPR } = await import('@/lib/provenance/store');

    const dpr = createDPR(makeInput(), null);
    await storeDPR(dpr);

    const dateKey = dpr.timestamp.split('T')[0];
    const stored = mockLists.get(`provenance:${dateKey}`);
    expect(stored).toBeDefined();
    expect(stored).toHaveLength(1);
    expect(JSON.parse(stored![0]).dpr_id).toBe(dpr.dpr_id);
  });

  it('writes to both date-key and session-key when sessionId provided', async () => {
    const { storeDPR } = await import('@/lib/provenance/store');

    const dpr = createDPR(makeInput(), null);
    await storeDPR(dpr, 'sess-1');

    const dateKey = dpr.timestamp.split('T')[0];
    expect(mockLists.get(`provenance:${dateKey}`)).toHaveLength(1);
    expect(mockLists.get('provenance:session:sess-1')).toHaveLength(1);
  });

  it('skips session-key when sessionId omitted', async () => {
    const { storeDPR } = await import('@/lib/provenance/store');

    const dpr = createDPR(makeInput(), null);
    await storeDPR(dpr);

    expect(mockLists.has('provenance:session:undefined')).toBe(false);
    // Only the date key should exist
    expect(mockLists.size).toBe(1);
  });
});

describe('getSessionDPRs', () => {
  it('returns parsed DPR records from stored JSON', async () => {
    const { storeDPR, getSessionDPRs } = await import('@/lib/provenance/store');

    const dpr = createDPR(makeInput(), null);
    await storeDPR(dpr, 'sess-2');

    const result = await getSessionDPRs('sess-2');
    expect(result).toHaveLength(1);
    expect(result[0].dpr_id).toBe(dpr.dpr_id);
    expect(result[0].chain_hash).toBe(dpr.chain_hash);
  });

  it('returns empty array for unknown session', async () => {
    const { getSessionDPRs } = await import('@/lib/provenance/store');

    const result = await getSessionDPRs('nonexistent');
    expect(result).toEqual([]);
  });
});

describe('getDPRById', () => {
  it('finds matching record by dpr_id', async () => {
    const { storeDPR, getDPRById } = await import('@/lib/provenance/store');

    const dpr1 = createDPR(makeInput({ action_taken: 'auth' }), null);
    const dpr2 = createDPR(
      makeInput({ action_taken: 'rate_limit' }),
      getChainRef(dpr1)
    );
    await storeDPR(dpr1, 'sess-3');
    await storeDPR(dpr2, 'sess-3');

    const found = await getDPRById(dpr2.dpr_id, 'sess-3');
    expect(found).not.toBeNull();
    expect(found!.dpr_id).toBe(dpr2.dpr_id);
    expect(found!.action_taken).toBe('rate_limit');
  });

  it('returns null when dpr_id not found', async () => {
    const { storeDPR, getDPRById } = await import('@/lib/provenance/store');

    const dpr = createDPR(makeInput(), null);
    await storeDPR(dpr, 'sess-4');

    const found = await getDPRById('nonexistent-id', 'sess-4');
    expect(found).toBeNull();
  });
});

describe('verifySessionChain', () => {
  it('validates an intact 3-record chain', async () => {
    const { storeDPR, verifySessionChain } =
      await import('@/lib/provenance/store');

    const dpr1 = createDPR(makeInput({ action_taken: 'auth' }), null);
    const dpr2 = createDPR(
      makeInput({ action_taken: 'rate_limit' }),
      getChainRef(dpr1)
    );
    const dpr3 = createDPR(
      makeInput({ action_taken: 'llm_call' }),
      getChainRef(dpr2)
    );
    await storeDPR(dpr1, 'sess-5');
    await storeDPR(dpr2, 'sess-5');
    await storeDPR(dpr3, 'sess-5');

    const result = await verifySessionChain('sess-5');
    expect(result).toEqual({ valid: true, total: 3, broken_at: null });
  });

  it('detects tampered chain_hash', async () => {
    const { storeDPR, verifySessionChain } =
      await import('@/lib/provenance/store');

    const dpr1 = createDPR(makeInput({ action_taken: 'auth' }), null);
    const dpr2 = createDPR(
      makeInput({ action_taken: 'rate_limit' }),
      getChainRef(dpr1)
    );

    await storeDPR(dpr1, 'sess-6');
    // Tamper with the second record's chain_hash before storing
    const tampered = { ...dpr2, chain_hash: 'tampered_hash_value' };
    mockLists.get('provenance:session:sess-6')!; // ensure first is there
    // Manually push the tampered record
    const list = mockLists.get('provenance:session:sess-6') ?? [];
    list.push(JSON.stringify(tampered));
    mockLists.set('provenance:session:sess-6', list);

    const result = await verifySessionChain('sess-6');
    expect(result.valid).toBe(false);
    expect(result.broken_at).toBe(1);
  });

  it('returns valid for empty session', async () => {
    const { verifySessionChain } = await import('@/lib/provenance/store');

    const result = await verifySessionChain('empty-session');
    expect(result).toEqual({ valid: true, total: 0, broken_at: null });
  });

  it('detects tampered signature', async () => {
    const { storeDPR, verifySessionChain } =
      await import('@/lib/provenance/store');

    const dpr = createDPR(makeInput(), null);
    await storeDPR(dpr, 'sess-7');

    // Replace stored record with one that has a bad signature
    const tampered = { ...dpr, signature: 'bad_signature_value' };
    mockLists.set('provenance:session:sess-7', [JSON.stringify(tampered)]);

    const result = await verifySessionChain('sess-7');
    expect(result.valid).toBe(false);
    expect(result.broken_at).toBe(0);
  });
});
