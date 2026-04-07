# Afloat v1.10.0 — Structured Handoff

## Contract Status

- **Version**: 1.10.0 (bumped from 1.8.0 → 1.9.0 → 1.10.0 in this session)
- **Status**: active
- **Phase 2**: 7/8 items complete (2.6 soft launch still in_progress)

## What Changed This Session

### Financial Model Renovation (v1.9.0)

| Metric           | Before   | After    | Delta                                  |
| ---------------- | -------- | -------- | -------------------------------------- |
| Surplus          | $2.37    | $11.41   | +381%                                  |
| Projected net    | $24.37   | $33.41   | +$9.04                                 |
| Stress tests     | 2/3 PASS | 4/4 PASS | worst case rescued                     |
| Stripe effective | 6.2%     | 5.4%     | -0.8pp                                 |
| Tiers            | 2        | 5        | +free_trial, session_pack, access_pass |
| Risk controls    | 4        | 10       | +6 market-informed                     |

### Product Strategy + Trial Closing (v1.10.0)

- Now/Next/Later roadmap added to contract
- Trial closing 4-step sequence: rate_limit → console_warning → log_trial_close → notify_parties
- Console warning CW-1..CW-4 spec + React component
- End-to-end notification spec (user, ledger, stakeholder_domains)
- Executive stakeholder update (Green status)

### Codebase Changes (this session)

#### Types Updated

- `src/types/session.ts` — TIER_LIMITS expanded: free_trial, starter, pro, session_pack + legacy aliases
- `src/types/session.ts` — SubscriptionTier type + FREE_TRIAL_MAX_SESSIONS = 3
- `src/types/user.ts` — Re-exports SubscriptionTier from session.ts, added "trialing" status

#### Payment Gateway Renovated

- `src/lib/stripe.ts` — Added PRICE_MAP (8 configs: starter×3, pro×3, session_pack, access_pass)
- `src/lib/stripe.ts` — Added `createTierCheckout()` with metadata tagging
- `src/lib/stripe.ts` — Added `getPriceConfig()` and `getAllPriceConfigs()`
- All price IDs env-driven: STRIPE_PRICE_STARTER_QTR, \_MO, \_YR, etc.

#### Event System + Analytics (NEW)

- `src/lib/events.ts` — Full lifecycle event bus (Redis-backed)
  - 20+ event types covering trial→conversion→churn→winback
  - Trial session counter with 90-day TTL
  - Conversion tracking with daily aggregation
  - User journey reconstruction
  - `buildLifecycleSummary()` — compressed lifecycle with usage-pattern insights

#### Hooks (NEW)

- `src/hooks/useTrialClosing.ts` — Tracks trial sessions, fires closing callback at 3/3
- `src/hooks/useConsoleWarning.ts` — 4-phase auto-advancing warning (CW-1..CW-4, ~3.5s/phase)
- `src/hooks/useSubscription.ts` — Subscription state management, tier-aware checkout

#### Components Updated

- `src/components/console-warning.tsx` — Full CW-1..CW-4 UI + PromotionDemo (3-4s diff animation)
- `src/components/session-status.tsx` — Updated CTA: "$12/quarter" + "Use first, then decide"
- `src/app/subscribe/page.tsx` — Full renovation: Starter (billing toggle), Pro, Session Pack, Access Pass

#### Messaging Engine (NEW)

- `src/lib/messaging.ts` — Targeted messaging by journey stage
  - `generateFirstBuyerMessage()` — pre-session, mid-trial, post-trial variants
  - `generateTrialCloseMessage()` — personalized with gate accomplishments
  - `generateWinbackMessage()` — session pack (short churn) vs access pass (long churn)
  - `generateUpgradeMessage()` — starter→pro migration
  - `compressLifecycleSummary()` — one-screen lifecycle snapshot
  - `routeMessage()` — auto-selects best message for user state

#### Infrastructure Added

- `src/lib/redis.ts` — Added `incr()` and `expire()` to MemoryRedis for dev-mode compat

## Files Inventory

### New Files (6)

```
src/lib/events.ts           — Lifecycle event bus + analytics
src/lib/messaging.ts        — Targeted messaging engine
src/hooks/useTrialClosing.ts    — Trial closing hook
src/hooks/useConsoleWarning.ts  — Console warning hook (CW-1..4)
src/hooks/useSubscription.ts    — Subscription management hook
src/components/console-warning.tsx — Console warning UI + promo demo
```

### Modified Files (6)

```
src/types/session.ts        — Renovated tier limits + SubscriptionTier type
src/types/user.ts           — Re-export SubscriptionTier, added "trialing"
src/lib/stripe.ts           — Price map + createTierCheckout
src/lib/redis.ts            — MemoryRedis.incr() + expire()
src/components/session-status.tsx — Updated CTA pricing
src/app/subscribe/page.tsx  — Full page renovation
```

### Contract Files Modified (1)

```
canopy/assistive-agreement-contracts/contract.json — v1.10.0
```

## Remaining Work

### Blocker

- **Soft launch (2.6)**: Needs real Stripe env vars (STRIPE*SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE*\* IDs) and Vercel deployment config

### API Routes Not Yet Created

- `POST /api/v1/subscribe` — needs update to accept `{ tier, billing }` body and call `createTierCheckout`
- `GET /api/v1/trial/status` — new endpoint for trial session count
- `GET /api/v1/subscription/status` — new endpoint for subscription state
- `POST /api/v1/analytics/lifecycle` — event ingestion endpoint
- `POST /api/v1/webhooks/stripe` — needs update for new tier metadata handling

### Integration Points

- Chat page (`src/app/chat/page.tsx`) needs to wire in:
  - `useTrialClosing` hook for trial session tracking
  - `useConsoleWarning` hook for trial close UI
  - `ConsoleWarning` component in the chat output area
  - `PromotionDemo` component for the 3-4s diff feature
- Webhook handler needs to emit lifecycle events on subscription changes

## Market Sources Used

1. Maxio 2025 SaaS Pricing Trends — 91% use usage-based pricing
2. Freemius State of Micro-SaaS 2025 — card-required trials convert 70.6%
3. Monetizely 2026 SaaS/AI Pricing Guide — deflationary AI cost trends
4. Anthropic Financial Services Plugins — Competitive Analysis + Comps Analysis frameworks
5. Anthropic Knowledge Work Plugins — Product Management (roadmap-update, stakeholder-update)

## Verification Results

- Contract v1.9.0: 27/27 checks PASS
- Contract v1.10.0: 24/24 checks PASS
- TypeScript compilation: pending (needs `npm run typecheck`)
- Test suite: pending (needs `npm test`)
