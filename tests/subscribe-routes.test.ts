import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCheckRateLimit = vi.fn<
  (limiter: unknown, identifier: string) => Promise<NextResponse | null>
>(async () => null);
const mockIsStripeConfigured = vi.fn(() => true);
const mockCreateTierCheckout = vi.fn();
const mockRetrieveCheckoutSession = vi.fn();
const mockGetUserByStripeCustomerId = vi.fn();
const mockCreateToken = vi.fn<(payload: unknown) => Promise<string>>(
  async () => 'signed-token'
);

vi.mock('@/lib/rate-limit', () => ({
  getSubscribeRateLimiter: () => ({}),
  checkRateLimit: (limiter: unknown, identifier: string) =>
    mockCheckRateLimit(limiter, identifier),
}));

vi.mock('@/lib/audit', () => ({
  getClientIP: () => '127.0.0.1',
  hashIP: () => 'hashed-ip',
}));

vi.mock('@/lib/stripe', () => ({
  isStripeConfigured: () => mockIsStripeConfigured(),
  createTierCheckout: (...args: unknown[]) => mockCreateTierCheckout(...args),
  retrieveCheckoutSession: (sessionId: string) =>
    mockRetrieveCheckoutSession(sessionId),
}));

vi.mock('@/lib/pricing-config', () => ({
  isActiveTier: (tier: string) =>
    ['free_trial', 'starter', 'pro'].includes(tier),
}));

vi.mock('@/lib/data-layer', () => ({
  getUserByStripeCustomerId: (stripeCustomerId: string) =>
    mockGetUserByStripeCustomerId(stripeCustomerId),
}));

vi.mock('@/lib/auth', () => ({
  createToken: (payload: unknown) => mockCreateToken(payload),
}));

import { POST as subscribePOST } from '@/app/api/v1/subscribe/route';
import { POST as verifyPOST } from '@/app/api/v1/subscribe/verify/route';

describe('subscribe routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mockCheckRateLimit.mockResolvedValue(null);
    mockIsStripeConfigured.mockReturnValue(true);
    mockCreateTierCheckout.mockResolvedValue({
      url: 'https://checkout.example/starter',
    });
    mockRetrieveCheckoutSession.mockResolvedValue({
      customer: 'cus_test',
    });
    mockGetUserByStripeCustomerId.mockResolvedValue({
      user_id: 'user-123',
      stripe_customer_id: 'cus_test',
    });
    mockCreateToken.mockResolvedValue('signed-token');
  });

  describe('POST /api/v1/subscribe', () => {
    it('returns 501 when billing is not configured', async () => {
      mockIsStripeConfigured.mockReturnValue(false);

      const response = await subscribePOST(
        new NextRequest('http://localhost/api/v1/subscribe', {
          method: 'POST',
        })
      );

      expect(response.status).toBe(501);
    });

    it('returns the rate-limit response when blocked', async () => {
      mockCheckRateLimit.mockResolvedValueOnce(
        NextResponse.json({ error: 'rate_limit' }, { status: 429 })
      );

      const response = await subscribePOST(
        new NextRequest('http://localhost/api/v1/subscribe', {
          method: 'POST',
        })
      );

      expect(response.status).toBe(429);
    });

    it('returns 500 when the app URL is not configured', async () => {
      const response = await subscribePOST(
        new NextRequest('http://localhost/api/v1/subscribe', {
          method: 'POST',
        })
      );

      expect(response.status).toBe(500);
      expect((await response.json()).message).toContain('Application URL');
    });

    it('defaults to starter quarterly checkout when the body is invalid', async () => {
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://afloat.example');

      const response = await subscribePOST(
        new NextRequest('http://localhost/api/v1/subscribe', {
          method: 'POST',
          body: '{',
        })
      );

      expect(response.status).toBe(200);
      expect(mockCreateTierCheckout).toHaveBeenCalledWith(
        'starter',
        'quarterly',
        'https://afloat.example/subscribe/success',
        'https://afloat.example/subscribe'
      );
    });

    it('uses the pro tier checkout when requested', async () => {
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://afloat.example');

      const response = await subscribePOST(
        new NextRequest('http://localhost/api/v1/subscribe', {
          method: 'POST',
          body: JSON.stringify({ tier: 'pro', billing: 'monthly' }),
        })
      );

      expect(response.status).toBe(200);
      expect(mockCreateTierCheckout).toHaveBeenCalledWith(
        'pro',
        'monthly',
        'https://afloat.example/subscribe/success',
        'https://afloat.example/subscribe'
      );
    });

    it('returns 500 when checkout session creation fails', async () => {
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://afloat.example');
      mockCreateTierCheckout.mockRejectedValueOnce(new Error('boom'));

      const response = await subscribePOST(
        new NextRequest('http://localhost/api/v1/subscribe', {
          method: 'POST',
        })
      );

      expect(response.status).toBe(500);
    });
  });

  describe('POST /api/v1/subscribe/verify', () => {
    it('returns 501 when billing is not configured', async () => {
      mockIsStripeConfigured.mockReturnValue(false);

      const response = await verifyPOST(
        new NextRequest('http://localhost/api/v1/subscribe/verify', {
          method: 'POST',
          body: JSON.stringify({ session_id: 'cs_test' }),
        })
      );

      expect(response.status).toBe(501);
    });

    it('returns the rate-limit response when blocked', async () => {
      mockCheckRateLimit.mockResolvedValueOnce(
        NextResponse.json({ error: 'rate_limit' }, { status: 429 })
      );

      const response = await verifyPOST(
        new NextRequest('http://localhost/api/v1/subscribe/verify', {
          method: 'POST',
          body: JSON.stringify({ session_id: 'cs_test' }),
        })
      );

      expect(response.status).toBe(429);
    });

    it('returns 400 for invalid JSON bodies', async () => {
      const response = await verifyPOST(
        new NextRequest('http://localhost/api/v1/subscribe/verify', {
          method: 'POST',
          body: '{',
        })
      );

      expect(response.status).toBe(400);
    });

    it('returns 400 for null request bodies', async () => {
      const response = await verifyPOST(
        new NextRequest('http://localhost/api/v1/subscribe/verify', {
          method: 'POST',
          body: 'null',
        })
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe('empty_input');
    });

    it('returns 400 when session_id is missing', async () => {
      const response = await verifyPOST(
        new NextRequest('http://localhost/api/v1/subscribe/verify', {
          method: 'POST',
          body: JSON.stringify({ session_id: '   ' }),
        })
      );

      expect(response.status).toBe(400);
    });

    it('returns 500 when the checkout session has no customer id', async () => {
      mockRetrieveCheckoutSession.mockResolvedValueOnce({ customer: null });

      const response = await verifyPOST(
        new NextRequest('http://localhost/api/v1/subscribe/verify', {
          method: 'POST',
          body: JSON.stringify({ session_id: 'cs_test' }),
        })
      );

      expect(response.status).toBe(500);
    });

    it('returns 404 when the user has not been provisioned yet', async () => {
      mockGetUserByStripeCustomerId.mockResolvedValueOnce(null);

      const response = await verifyPOST(
        new NextRequest('http://localhost/api/v1/subscribe/verify', {
          method: 'POST',
          body: JSON.stringify({ session_id: 'cs_test' }),
        })
      );

      expect(response.status).toBe(404);
    });

    it('supports expanded customer objects and returns a token', async () => {
      mockRetrieveCheckoutSession.mockResolvedValueOnce({
        customer: { id: 'cus_obj' },
      });
      mockGetUserByStripeCustomerId.mockResolvedValueOnce({
        user_id: 'user-obj',
        stripe_customer_id: 'cus_obj',
      });

      const response = await verifyPOST(
        new NextRequest('http://localhost/api/v1/subscribe/verify', {
          method: 'POST',
          body: JSON.stringify({ session_id: 'cs_test' }),
        })
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        token: 'signed-token',
        user_id: 'user-obj',
      });
    });

    it('returns 500 when verification throws', async () => {
      mockRetrieveCheckoutSession.mockRejectedValueOnce(new Error('boom'));

      const response = await verifyPOST(
        new NextRequest('http://localhost/api/v1/subscribe/verify', {
          method: 'POST',
          body: JSON.stringify({ session_id: 'cs_test' }),
        })
      );

      expect(response.status).toBe(500);
    });
  });
});
