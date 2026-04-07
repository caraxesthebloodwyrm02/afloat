import { writeAuditLog } from '@/lib/audit';
import { createDefaultConsents } from '@/lib/consent';
import {
  createUser,
  getUserByStripeCustomerId,
  setStripeCustomerMapping,
  updateUser,
} from '@/lib/data-layer';
import { emitEvent } from '@/lib/events';
import { getRedis } from '@/lib/redis';
import { constructWebhookEvent, isStripeConfigured } from '@/lib/stripe';
import type { SubscriptionTier } from '@/types/user';
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';

// Idempotency: track processed event IDs to handle Stripe retries
async function isEventProcessed(eventId: string): Promise<boolean> {
  const redis = getRedis();
  const existing = await redis.get(`stripe_event:${eventId}`);
  return existing !== null;
}

async function markEventProcessed(eventId: string): Promise<void> {
  const redis = getRedis();
  // Store for 24 hours — Stripe retries within this window
  await redis.set(`stripe_event:${eventId}`, '1', { ex: 86400 });
}

export async function POST(request: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: 'not_available', message: 'Billing is not configured.' },
      { status: 501 }
    );
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Missing Stripe signature.' },
      { status: 401 }
    );
  }

  let event: Stripe.Event;
  try {
    const body = await request.text();
    event = await constructWebhookEvent(body, signature);
  } catch {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Invalid webhook signature.' },
      { status: 401 }
    );
  }

  // Idempotency check — skip already-processed events
  if (await isEventProcessed(event.id)) {
    return NextResponse.json({ received: true, deduplicated: true });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const stripeCustomerId = session.customer as string;

      const metaTier = session.metadata?.afloat_tier;
      let subscriptionTier: SubscriptionTier = 'starter';
      if (
        metaTier === 'pro' ||
        metaTier === 'starter' ||
        metaTier === 'free_trial'
      ) {
        subscriptionTier = metaTier;
      }

      const existing = await getUserByStripeCustomerId(stripeCustomerId);
      if (!existing) {
        const userId = uuidv4();
        const user = {
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          subscription_status: 'active' as const,
          subscription_tier: subscriptionTier,
          billing_cycle_anchor: new Date().toISOString(),
          consents: createDefaultConsents(true, false, false),
          pending_deletion: null,
        };

        await createUser(user);
        await setStripeCustomerMapping(stripeCustomerId, userId);

        await writeAuditLog({
          actor: 'system',
          action: 'create',
          resource_type: 'subscription',
          resource_id: userId,
          outcome: 'success',
          ip_hash: 'webhook',
          metadata: {
            event_type: event.type,
            stripe_customer_id: stripeCustomerId,
            tier: subscriptionTier,
          },
        });

        await emitEvent({
          event_id: uuidv4(),
          event_type: 'subscription_started',
          user_id: userId,
          timestamp: new Date().toISOString(),
          tier: subscriptionTier,
          metadata: { stripe_customer_id: stripeCustomerId },
        });
      } else {
        const previousTier = existing.subscription_tier;
        existing.subscription_tier = subscriptionTier;
        await updateUser(existing);

        if (previousTier !== subscriptionTier) {
          await emitEvent({
            event_id: uuidv4(),
            event_type: 'subscription_upgraded',
            user_id: existing.user_id,
            timestamp: new Date().toISOString(),
            tier: subscriptionTier,
            metadata: { from_tier: previousTier, to_tier: subscriptionTier },
          });
        }
      }
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const user = await getUserByStripeCustomerId(customerId);
      if (user) {
        user.subscription_status = 'active';
        await updateUser(user);
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const user = await getUserByStripeCustomerId(customerId);
      if (user) {
        user.subscription_status = 'past_due';
        await updateUser(user);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const user = await getUserByStripeCustomerId(customerId);
      if (user) {
        user.subscription_status = 'canceled';
        await updateUser(user);

        await emitEvent({
          event_id: uuidv4(),
          event_type: 'subscription_canceled',
          user_id: user.user_id,
          timestamp: new Date().toISOString(),
          tier: user.subscription_tier,
          metadata: { stripe_customer_id: customerId },
        });
      }
      break;
    }
  }

  // Mark event as processed after successful handling
  await markEventProcessed(event.id);

  return NextResponse.json({ received: true });
}
