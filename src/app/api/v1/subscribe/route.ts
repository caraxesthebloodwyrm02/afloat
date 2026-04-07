import { NextRequest, NextResponse } from 'next/server';
import { createTierCheckout, isStripeConfigured } from '@/lib/stripe';
import { getSubscribeRateLimiter, checkRateLimit } from '@/lib/rate-limit';
import { hashIP, getClientIP } from '@/lib/audit';
import { isActiveTier } from '@/lib/pricing-config';
import type { BillingPeriod } from '@/lib/pricing-config';

export async function POST(request: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: 'not_available', message: 'Billing is not configured.' },
      { status: 501 }
    );
  }

  const ip = hashIP(getClientIP(request));
  const rateLimitResponse = await checkRateLimit(getSubscribeRateLimiter(), ip);
  if (rateLimitResponse) return rateLimitResponse;

  let tier = 'starter';
  let billing: BillingPeriod = 'quarterly';
  try {
    const body = await request.json();
    if (body.tier && isActiveTier(body.tier) && body.tier !== 'free_trial') {
      tier = body.tier;
    }
    if (
      body.billing === 'monthly' ||
      body.billing === 'annual' ||
      body.billing === 'quarterly'
    ) {
      billing = body.billing;
    }
  } catch {
    // Default to starter quarterly
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return NextResponse.json(
      { error: 'server_error', message: 'Application URL not configured.' },
      { status: 500 }
    );
  }

  try {
    const session = await createTierCheckout(
      tier,
      billing,
      `${appUrl}/subscribe/success`,
      `${appUrl}/subscribe`
    );

    return NextResponse.json({ url: session.url });
  } catch {
    return NextResponse.json(
      { error: 'server_error', message: 'Failed to create checkout session.' },
      { status: 500 }
    );
  }
}
