import { createToken } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRedisStore = new Map<string, string>();
const mockCheckRateLimit = vi.fn<
  (limiter: unknown, identifier: string) => Promise<NextResponse | null>
>(async () => null);
const mockAuditAction = vi.fn<
  (
    request: Request,
    user: { user_id: string },
    params: unknown
  ) => Promise<void>
>(async () => {});

vi.mock('@/lib/redis', () => ({
  getRedis: () => ({
    set: vi.fn(async (key: string, value: string) => {
      mockRedisStore.set(key, value);
      return 'OK';
    }),
    get: vi.fn(async (key: string) => mockRedisStore.get(key) ?? null),
    del: vi.fn(async (key: string) => {
      mockRedisStore.delete(key);
      return 1;
    }),
    rpush: vi.fn(async () => 1),
    lrange: vi.fn(async () => []),
    scan: vi.fn(async () => [0, []]),
  }),
}));

vi.mock('@/lib/rate-limit', () => ({
  getDataRightsRateLimiter: () => ({}),
  checkRateLimit: (limiter: unknown, identifier: string) =>
    mockCheckRateLimit(limiter, identifier),
}));

vi.mock('@/lib/audit', () => ({
  auditAction: (request: Request, user: { user_id: string }, params: unknown) =>
    mockAuditAction(request, user, params),
}));

import { PATCH as profilePATCH } from '@/app/api/v1/user/profile/route';
import { DELETE as userDataDELETE } from '@/app/api/v1/user/data/route';

const TEST_USER_ID = 'user-routes-test';

async function makeAuthHeader(userId: string = TEST_USER_ID): Promise<string> {
  const token = await createToken({
    user_id: userId,
    sub: `cus_${userId}`,
  });
  return `Bearer ${token}`;
}

function seedUser(
  userId: string,
  overrides: Record<string, unknown> = {}
): void {
  mockRedisStore.set(
    `user:${userId}`,
    JSON.stringify({
      user_id: userId,
      stripe_customer_id: `cus_${userId}`,
      subscription_status: 'active',
      subscription_tier: 'trial',
      billing_cycle_anchor: new Date().toISOString(),
      display_name: 'Existing Name',
      email_preference: 'weekly',
      consents: {
        essential_processing: {
          granted: true,
          timestamp: new Date().toISOString(),
          policy_version: '1.0',
        },
        session_telemetry: {
          granted: true,
          timestamp: new Date().toISOString(),
          policy_version: '1.0',
        },
        marketing_communications: {
          granted: false,
          timestamp: new Date().toISOString(),
          policy_version: '1.0',
        },
        routing_memory: {
          granted: false,
          timestamp: new Date().toISOString(),
          policy_version: '1.0',
        },
      },
      pending_deletion: null,
      ...overrides,
    })
  );
}

describe('user profile and data routes', () => {
  beforeEach(() => {
    mockRedisStore.clear();
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue(null);
    mockAuditAction.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('PATCH /api/v1/user/profile', () => {
    it('returns 401 without auth', async () => {
      const request = new NextRequest('http://localhost/api/v1/user/profile', {
        method: 'PATCH',
        body: JSON.stringify({ display_name: 'New Name' }),
      });

      const response = await profilePATCH(request);
      expect(response.status).toBe(401);
    });

    it('returns rate-limit response when blocked', async () => {
      seedUser(TEST_USER_ID);
      mockCheckRateLimit.mockResolvedValueOnce(
        NextResponse.json(
          { error: 'rate_limit', message: 'Too many requests.' },
          { status: 429 }
        )
      );

      const request = new NextRequest('http://localhost/api/v1/user/profile', {
        method: 'PATCH',
        headers: { authorization: await makeAuthHeader() },
        body: JSON.stringify({ display_name: 'New Name' }),
      });

      const response = await profilePATCH(request);
      expect(response.status).toBe(429);
    });

    it('returns 404 when the user does not exist', async () => {
      const request = new NextRequest('http://localhost/api/v1/user/profile', {
        method: 'PATCH',
        headers: { authorization: await makeAuthHeader() },
        body: JSON.stringify({ display_name: 'New Name' }),
      });

      const response = await profilePATCH(request);
      expect(response.status).toBe(404);
    });

    it('returns 400 for invalid non-object JSON', async () => {
      seedUser(TEST_USER_ID);
      const request = new NextRequest('http://localhost/api/v1/user/profile', {
        method: 'PATCH',
        headers: { authorization: await makeAuthHeader() },
        body: 'null',
      });

      const response = await profilePATCH(request);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toBe('empty_input');
    });

    it('returns 400 when no allowed fields are present', async () => {
      seedUser(TEST_USER_ID);
      const request = new NextRequest('http://localhost/api/v1/user/profile', {
        method: 'PATCH',
        headers: { authorization: await makeAuthHeader() },
        body: JSON.stringify({ invalid_field: 'nope' }),
      });

      const response = await profilePATCH(request);
      expect(response.status).toBe(400);
    });

    it('returns 400 when an allowed field exceeds 200 characters', async () => {
      seedUser(TEST_USER_ID);
      const request = new NextRequest('http://localhost/api/v1/user/profile', {
        method: 'PATCH',
        headers: { authorization: await makeAuthHeader() },
        body: JSON.stringify({ display_name: 'x'.repeat(201) }),
      });

      const response = await profilePATCH(request);
      expect(response.status).toBe(400);
    });

    it('updates one field and records an audit event', async () => {
      seedUser(TEST_USER_ID);
      const request = new NextRequest('http://localhost/api/v1/user/profile', {
        method: 'PATCH',
        headers: { authorization: await makeAuthHeader() },
        body: JSON.stringify({ display_name: 'Updated Name' }),
      });

      const response = await profilePATCH(request);
      expect(response.status).toBe(200);

      const storedUser = JSON.parse(
        mockRedisStore.get(`user:${TEST_USER_ID}`) ?? '{}'
      ) as { display_name?: string };
      expect(storedUser.display_name).toBe('Updated Name');
      expect(mockAuditAction).toHaveBeenCalledTimes(1);
    });

    it('supports clearing a field with an empty string', async () => {
      seedUser(TEST_USER_ID);
      const request = new NextRequest('http://localhost/api/v1/user/profile', {
        method: 'PATCH',
        headers: { authorization: await makeAuthHeader() },
        body: JSON.stringify({ display_name: '' }),
      });

      const response = await profilePATCH(request);
      expect(response.status).toBe(200);

      const storedUser = JSON.parse(
        mockRedisStore.get(`user:${TEST_USER_ID}`) ?? '{}'
      ) as { display_name?: string };
      expect(storedUser.display_name).toBe('');
    });

    it('updates both allowed fields', async () => {
      seedUser(TEST_USER_ID);
      const request = new NextRequest('http://localhost/api/v1/user/profile', {
        method: 'PATCH',
        headers: { authorization: await makeAuthHeader() },
        body: JSON.stringify({
          display_name: 'Dual Update',
          email_preference: 'daily',
        }),
      });

      const response = await profilePATCH(request);
      expect(response.status).toBe(200);

      const storedUser = JSON.parse(
        mockRedisStore.get(`user:${TEST_USER_ID}`) ?? '{}'
      ) as { display_name?: string; email_preference?: string };
      expect(storedUser.display_name).toBe('Dual Update');
      expect(storedUser.email_preference).toBe('daily');
    });
  });

  describe('DELETE /api/v1/user/data', () => {
    it('returns 401 without auth', async () => {
      const request = new NextRequest('http://localhost/api/v1/user/data', {
        method: 'DELETE',
      });

      const response = await userDataDELETE(request);
      expect(response.status).toBe(401);
    });

    it('returns rate-limit response when blocked', async () => {
      seedUser(TEST_USER_ID);
      mockCheckRateLimit.mockResolvedValueOnce(
        NextResponse.json(
          { error: 'rate_limit', message: 'Too many requests.' },
          { status: 429 }
        )
      );

      const request = new NextRequest('http://localhost/api/v1/user/data', {
        method: 'DELETE',
        headers: { authorization: await makeAuthHeader() },
      });

      const response = await userDataDELETE(request);
      expect(response.status).toBe(429);
    });

    it('returns 404 when the user does not exist', async () => {
      const request = new NextRequest('http://localhost/api/v1/user/data', {
        method: 'DELETE',
        headers: { authorization: await makeAuthHeader() },
      });

      const response = await userDataDELETE(request);
      expect(response.status).toBe(404);
    });

    it('returns the existing deletion request when already pending', async () => {
      const deletionDate = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      ).toISOString();
      seedUser(TEST_USER_ID, {
        pending_deletion: {
          requested_at: new Date().toISOString(),
          deletion_date: deletionDate,
        },
      });

      const request = new NextRequest('http://localhost/api/v1/user/data', {
        method: 'DELETE',
        headers: { authorization: await makeAuthHeader() },
      });

      const response = await userDataDELETE(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.deletion_date).toBe(deletionDate);
      expect(body.grace_period_days).toBe(7);
    });

    it('marks the user for deletion and audits the action', async () => {
      seedUser(TEST_USER_ID);
      const request = new NextRequest('http://localhost/api/v1/user/data', {
        method: 'DELETE',
        headers: { authorization: await makeAuthHeader() },
      });

      const response = await userDataDELETE(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.grace_period_days).toBe(7);

      const storedUser = JSON.parse(
        mockRedisStore.get(`user:${TEST_USER_ID}`) ?? '{}'
      ) as { pending_deletion?: { deletion_date?: string } };
      expect(storedUser.pending_deletion?.deletion_date).toBeDefined();
      expect(mockAuditAction).toHaveBeenCalledTimes(1);
    });
  });
});
