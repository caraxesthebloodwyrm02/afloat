import type { RoutingScope } from '@/types/user';

// ── Tier Capability Configuration (Phase 2 metered model) ──
// Single source of truth for all tier parameters.
// Redis-backed overrides via param-store.ts take precedence at runtime.

export type ActiveTier = 'free_trial' | 'starter' | 'pro';

export interface TierConfig {
  maxLlmCalls: number;
  maxDurationMs: number;
  maxSessionsPerDay: number | null;
  maxSessionsTotal: number | null;
  includedSessionsPerMonth: number;
  routingScopeDefault: RoutingScope;
  routingScopeMax: RoutingScope;
  modelCatalogAccess: 'small' | 'medium' | 'full';
  candidateSelectionTopN: number;
  openaiOverridePolicy: 'auto' | 'force' | 'never';
}

export const TIER_CONFIGS: Record<ActiveTier, TierConfig> = {
  free_trial: {
    maxLlmCalls: 2,
    maxDurationMs: 120_000,
    maxSessionsPerDay: null,
    maxSessionsTotal: 5,
    includedSessionsPerMonth: 0,
    routingScopeDefault: 'fast',
    routingScopeMax: 'fast',
    modelCatalogAccess: 'small',
    candidateSelectionTopN: 3,
    openaiOverridePolicy: 'never',
  },
  starter: {
    maxLlmCalls: 4,
    maxDurationMs: 300_000,
    maxSessionsPerDay: 10,
    maxSessionsTotal: null,
    includedSessionsPerMonth: 200,
    routingScopeDefault: 'fast',
    routingScopeMax: 'balanced',
    modelCatalogAccess: 'medium',
    candidateSelectionTopN: 4,
    openaiOverridePolicy: 'never',
  },
  pro: {
    maxLlmCalls: 8,
    maxDurationMs: 1_800_000,
    maxSessionsPerDay: null,
    maxSessionsTotal: null,
    includedSessionsPerMonth: 1000,
    routingScopeDefault: 'balanced',
    routingScopeMax: 'deep_read',
    modelCatalogAccess: 'full',
    candidateSelectionTopN: 2,
    openaiOverridePolicy: 'auto',
  },
};

// ── Metered Billing Configuration ──

export const METERED_BILLING = {
  perSessionPriceCents: 10,
  stripeMeterEventName: 'afloat_sessions',
  currency: 'usd',
} as const;

// ── Stripe Price Configuration (env-driven, Phase 2) ──

export type BillingPeriod = 'monthly' | 'quarterly' | 'annual';

export interface MeterPriceConfig {
  priceId: string;
  mode: 'subscription';
  basePriceCents: number;
  label: string;
  billingPeriod: BillingPeriod;
}

function requirePriceId(envVar: string): string {
  const value = process.env[envVar];
  if (!value) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
  return value;
}

export const PRICE_CONFIGS: Record<string, MeterPriceConfig> = {
  starter_monthly: {
    priceId: requirePriceId('STRIPE_PRICE_STARTER_MO'),
    mode: 'subscription',
    basePriceCents: 499,
    label: 'Starter — $4.99/month',
    billingPeriod: 'monthly',
  },
  starter_quarterly: {
    priceId: requirePriceId('STRIPE_PRICE_STARTER_QTR'),
    mode: 'subscription',
    basePriceCents: 1200,
    label: 'Starter — $12/quarter',
    billingPeriod: 'quarterly',
  },
  starter_annual: {
    priceId: requirePriceId('STRIPE_PRICE_STARTER_YR'),
    mode: 'subscription',
    basePriceCents: 2900,
    label: 'Starter — $29/year',
    billingPeriod: 'annual',
  },
  pro_monthly: {
    priceId: requirePriceId('STRIPE_PRICE_PRO_MO'),
    mode: 'subscription',
    basePriceCents: 999,
    label: 'Pro — $9.99/month',
    billingPeriod: 'monthly',
  },
  pro_quarterly: {
    priceId: requirePriceId('STRIPE_PRICE_PRO_QTR'),
    mode: 'subscription',
    basePriceCents: 2400,
    label: 'Pro — $24/quarter',
    billingPeriod: 'quarterly',
  },
  pro_annual: {
    priceId: requirePriceId('STRIPE_PRICE_PRO_YR'),
    mode: 'subscription',
    basePriceCents: 5900,
    label: 'Pro — $59/year',
    billingPeriod: 'annual',
  },
};

// ── Quality Targets (enterprise search framework) ──

export const QUALITY_TARGETS: Record<
  ActiveTier,
  { precision: number; completeness: number }
> = {
  free_trial: { precision: 0.6, completeness: 0.9 },
  starter: { precision: 0.7, completeness: 0.95 },
  pro: { precision: 0.95, completeness: 0.98 },
};

// ── Helpers ──

export function isActiveTier(tier: string): tier is ActiveTier {
  return tier === 'free_trial' || tier === 'starter' || tier === 'pro';
}

export function getTierConfig(tier: string): TierConfig {
  if (isActiveTier(tier)) return TIER_CONFIGS[tier];
  return TIER_CONFIGS.starter;
}

export function getPriceConfig(
  tier: string,
  billing?: BillingPeriod
): MeterPriceConfig | null {
  const key = `${tier}_${billing ?? 'quarterly'}`;
  return PRICE_CONFIGS[key] ?? null;
}

const SCOPE_ORDER: RoutingScope[] = ['fast', 'balanced', 'deep_read'];

export function isRoutingScopeAllowed(
  tier: string,
  requestedScope: RoutingScope
): boolean {
  const config = getTierConfig(tier);
  const maxIdx = SCOPE_ORDER.indexOf(config.routingScopeMax);
  const reqIdx = SCOPE_ORDER.indexOf(requestedScope);
  return reqIdx <= maxIdx;
}
