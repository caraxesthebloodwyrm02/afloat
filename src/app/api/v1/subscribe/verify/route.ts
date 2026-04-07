import { NextRequest, NextResponse } from 'next/server';
import { retrieveCheckoutSession, isStripeConfigured } from '@/lib/stripe';
import { getUserByStripeCustomerId } from '@/lib/data-layer';
import { createToken } from '@/lib/auth';
import { getSubscribeRateLimiter, checkRateLimit } from '@/lib/rate-limit';
import { hashIP, getClientIP } from '@/lib/audit';

export async function POST(request: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: 'not_available', message: 'Billing is not configured.' },
      { status: 501 }
    );
  }
  // Rate limit by IP
  const ip = hashIP(getClientIP(request));
  const rateLimitResponse = await checkRateLimit(getSubscribeRateLimiter(), ip);
  if (rateLimitResponse) return rateLimitResponse;

  let body: { session_id?: string };
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json(
        { error: 'empty_input', message: 'Invalid request.' },
        { status: 400 }
      );
    }
    body = parsed as { session_id?: string };
  } catch {
    return NextResponse.json(
      { error: 'empty_input', message: 'Invalid request.' },
      { status: 400 }
    );
  }

  const { session_id } = body;
  if (typeof session_id !== 'string' || !session_id.trim()) {
    return NextResponse.json(
      { error: 'empty_input', message: 'Missing session_id.' },
      { status: 400 }
    );
  }

  try {
    const checkoutSession = await retrieveCheckoutSession(session_id);
    const stripeCustomerId =
      typeof checkoutSession.customer === 'string'
        ? checkoutSession.customer
        : (checkoutSession.customer?.id ?? null);

    if (!stripeCustomerId) {
      return NextResponse.json(
        { error: 'server_error', message: 'Could not identify customer.' },
        { status: 500 }
      );
    }

    const user = await getUserByStripeCustomerId(stripeCustomerId);
    if (!user) {
      return NextResponse.json(
        {
          error: 'not_found',
          message:
            'User account not yet created. Please wait a moment and retry.',
        },
        { status: 404 }
      );
    }

    const token = await createToken({
      user_id: user.user_id,
      sub: user.stripe_customer_id,
    });

    return NextResponse.json({ token, user_id: user.user_id });
  } catch {
    return NextResponse.json(
      { error: 'server_error', message: 'Verification failed.' },
      { status: 500 }
    );
  }
}
