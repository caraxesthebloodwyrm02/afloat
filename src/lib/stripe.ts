import type { SubscriptionTier } from '@/types/session';
import Stripe from 'stripe';
import {
  METERED_BILLING,
  PRICE_CONFIGS,
  type BillingPeriod,
  type MeterPriceConfig,
  getPriceConfig as getConfigFromPricing,
} from './pricing-config';

let stripeClient: Stripe | null = null;

export type { BillingPeriod };

export type TierPriceConfig = MeterPriceConfig;

export function getPriceConfig(
  tier: string,
  billing?: BillingPeriod
): MeterPriceConfig | null {
  return getConfigFromPricing(tier, billing);
}

export function getAllPriceConfigs(): Record<string, MeterPriceConfig> {
  return { ...PRICE_CONFIGS };
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('Missing STRIPE_SECRET_KEY environment variable');
    }
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

export async function createCheckoutSession(
  priceId: string,
  successUrl: string,
  cancelUrl: string
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  return stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
  });
}

export async function createTierCheckout(
  tier: SubscriptionTier | string,
  billing: BillingPeriod | undefined,
  successUrl: string,
  cancelUrl: string,
  metadata?: Record<string, string>
): Promise<Stripe.Checkout.Session> {
  const config = getPriceConfig(tier, billing);
  if (!config) {
    throw new Error(
      `No price configuration for tier=${tier} billing=${billing}`
    );
  }

  const stripe = getStripe();
  return stripe.checkout.sessions.create({
    mode: config.mode,
    payment_method_types: ['card'],
    line_items: [{ price: config.priceId, quantity: 1 }],
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    metadata: {
      afloat_tier: tier,
      afloat_billing: billing ?? 'one_time',
      ...metadata,
    },
  });
}

export async function retrieveCheckoutSession(
  sessionId: string
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription', 'customer'],
  });
}

export async function constructWebhookEvent(
  body: string,
  signature: string
): Promise<Stripe.Event> {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('Missing STRIPE_WEBHOOK_SECRET environment variable');
  }
  return stripe.webhooks.constructEvent(body, signature, webhookSecret);
}

export async function createMeteredCheckoutSession(
  priceId: string,
  successUrl: string,
  cancelUrl: string
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  return stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId }],
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
  });
}

export async function reportUsage(
  stripeCustomerId: string,
  quantity: number,
  timestamp: number
): Promise<void> {
  const stripe = getStripe();
  const eventName =
    process.env.STRIPE_METER_EVENT_NAME ?? METERED_BILLING.stripeMeterEventName;
  await stripe.billing.meterEvents.create({
    event_name: eventName,
    payload: {
      stripe_customer_id: stripeCustomerId,
      value: String(quantity),
    },
    timestamp,
  });
}

export async function reportSessionUsage(
  stripeCustomerId: string
): Promise<void> {
  if (!isStripeConfigured()) return;
  await reportUsage(stripeCustomerId, 1, Math.floor(Date.now() / 1000));
}

export async function deleteStripeCustomer(customerId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.customers.del(customerId);
}
