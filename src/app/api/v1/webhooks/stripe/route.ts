import { NextRequest, NextResponse } from "next/server";
import { constructWebhookEvent } from "@/lib/stripe";
import {
  createUser,
  getUser,
  getUserByStripeCustomerId,
  setStripeCustomerMapping,
  updateUser,
} from "@/lib/data-layer";
import { createDefaultConsents } from "@/lib/consent";
import { writeAuditLog } from "@/lib/audit";
import { v4 as uuidv4 } from "uuid";
import type Stripe from "stripe";

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

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const stripeCustomerId = session.customer as string;

      const existing = await getUserByStripeCustomerId(stripeCustomerId);
      if (!existing) {
        const userId = uuidv4();
        const user = {
          user_id: userId,
          stripe_customer_id: stripeCustomerId,
          subscription_status: "active" as const,
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
          metadata: { event_type: event.type, stripe_customer_id: stripeCustomerId },
        });
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

  return NextResponse.json({ received: true });
}
