import { NextRequest, NextResponse } from "next/server";
import { constructWebhookEvent, getStripe } from "@/lib/stripe";
import type { SubscriptionTier } from "@/types/user";
import {
  createUser,
  getUserByStripeCustomerId,
  setStripeCustomerMapping,
  updateUser,
} from "@/lib/data-layer";
import { createDefaultConsents } from "@/lib/consent";
import { writeAuditLog } from "@/lib/audit";
import { getRedis } from "@/lib/redis";
import { v4 as uuidv4 } from "uuid";
import type Stripe from "stripe";

// Idempotency: track processed event IDs to handle Stripe retries
async function isEventProcessed(eventId: string): Promise<boolean> {
  const redis = getRedis();
  const existing = await redis.get(`stripe_event:${eventId}`);
  return existing !== null;
}

async function markEventProcessed(eventId: string): Promise<void> {
  const redis = getRedis();
  // Store for 24 hours — Stripe retries within this window
  await redis.set(`stripe_event:${eventId}`, "1", { ex: 86400 });
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "unauthorized", message: "Missing Stripe signature." },
      { status: 401 }
    );
  }

  let event: Stripe.Event;
  try {
    const body = await request.text();
    event = await constructWebhookEvent(body, signature);
  } catch {
    return NextResponse.json(
      { error: "unauthorized", message: "Invalid webhook signature." },
      { status: 401 }
    );
  }

  // Idempotency check — skip already-processed events
  if (await isEventProcessed(event.id)) {
    return NextResponse.json({ received: true, deduplicated: true });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const stripeCustomerId = session.customer as string;

      // Detect tier from price ID
      let subscriptionTier: SubscriptionTier = "trial";
      try {
        const stripe = getStripe();
        const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ["line_items"],
        });
        const continuousPriceId = process.env.STRIPE_CONTINUOUS_PRICE_ID;
        if (continuousPriceId && fullSession.line_items?.data?.some(
          (item) => item.price?.id === continuousPriceId
        )) {
          subscriptionTier = "continuous";
        }
      } catch {
        // Default to trial if detection fails
      }

      const existing = await getUserByStripeCustomerId(stripeCustomerId);
      if (!existing) {
        const userId = uuidv4();
        const user = {
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          subscription_status: "active" as const,
          subscription_tier: subscriptionTier,
          billing_cycle_anchor: new Date().toISOString(),
          consents: createDefaultConsents(true, false, false),
          pending_deletion: null,
        };

        await createUser(user);
        await setStripeCustomerMapping(stripeCustomerId, userId);

        await writeAuditLog({
          actor: "system",
          action: "create",
          resource_type: "subscription",
          resource_id: userId,
          outcome: "success",
          ip_hash: "webhook",
          metadata: { event_type: event.type, stripe_customer_id: stripeCustomerId, tier: subscriptionTier },
        });
      } else {
        // Update existing user's tier if they upgrade
        existing.subscription_tier = subscriptionTier;
        await updateUser(existing);
      }
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const user = await getUserByStripeCustomerId(customerId);
      if (user) {
        user.subscription_status = "active";
        await updateUser(user);
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const user = await getUserByStripeCustomerId(customerId);
      if (user) {
        user.subscription_status = "past_due";
        await updateUser(user);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const user = await getUserByStripeCustomerId(customerId);
      if (user) {
        user.subscription_status = "canceled";
        await updateUser(user);
      }
      break;
    }
  }

  // Mark event as processed after successful handling
  await markEventProcessed(event.id);

  return NextResponse.json({ received: true });
}
