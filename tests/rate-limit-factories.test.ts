import { beforeEach, describe, expect, it, vi } from 'vitest';

let upstashConfigured = false;
const mockRatelimitConstructor = vi.fn();
const mockSlidingWindow = vi.fn((_max: number, _window: string) => ({}));

class MockRatelimit {
  static slidingWindow = mockSlidingWindow;

  constructor(options: unknown) {
    mockRatelimitConstructor(options);
  }

  async limit(): Promise<{ success: boolean; reset: number }> {
    return { success: true, reset: Date.now() + 1000 };
  }
}

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: MockRatelimit,
}));

vi.mock('@upstash/redis', () => ({
  Redis: class MockRedis {},
}));

vi.mock('@/lib/redis', () => ({
  getRedis: () => ({}),
  isUpstashConfigured: () => upstashConfigured,
}));

describe('rate-limit factory branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    upstashConfigured = false;
  });

  it('uses in-memory limiters when Upstash is not configured and caches per getter', async () => {
    const {
      MemoryRatelimit,
      getSessionRateLimiter,
      getDataRightsRateLimiter,
      _resetRateLimitersForTesting,
    } = await import('@/lib/rate-limit');

    const sessionA = getSessionRateLimiter();
    const sessionB = getSessionRateLimiter();
    const dataRights = getDataRightsRateLimiter();

    expect(sessionA).toBeInstanceOf(MemoryRatelimit);
    expect(dataRights).toBeInstanceOf(MemoryRatelimit);
    expect(sessionA).toBe(sessionB);

    _resetRateLimitersForTesting();
    const sessionAfterReset = getSessionRateLimiter();
    expect(sessionAfterReset).not.toBe(sessionA);
  });

  it('uses Upstash Ratelimit when configured and wires expected constructor options', async () => {
    upstashConfigured = true;
    const {
      getSessionRateLimiter,
      getSubscribeRateLimiter,
      _resetRateLimitersForTesting,
    } = await import('@/lib/rate-limit');

    const sessionLimiter = getSessionRateLimiter();
    const subscribeLimiter = getSubscribeRateLimiter();

    expect(sessionLimiter).toBeInstanceOf(MockRatelimit);
    expect(subscribeLimiter).toBeInstanceOf(MockRatelimit);
    expect(mockRatelimitConstructor).toHaveBeenCalledTimes(2);
    expect(mockSlidingWindow).toHaveBeenCalled();

    _resetRateLimitersForTesting();
    getSessionRateLimiter();
    expect(mockRatelimitConstructor).toHaveBeenCalledTimes(3);
  });
});
