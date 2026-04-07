# Stripe Dashboard Configuration Guide

**Contract version:** 1.6.0
**Last updated:** 2026-02-28
**Purpose:** Step-by-step manual configuration for Stripe to support Afloat's two-tier billing model (trial + continuous). Designed for delegated execution with human-in-the-loop enforcement.

---

## Prerequisites

Before starting, you need:

- A Stripe account at [dashboard.stripe.com](https://dashboard.stripe.com)
- Access to your Vercel project's environment variable settings
- The deployed app URL (e.g., `https://afloat.vercel.app`)
- **All non-Stripe environment variables already configured** (see Phase 0)

> **Important:** Complete all steps in **Test Mode** first (toggle in top-right of Stripe dashboard). Only switch to Live Mode after end-to-end verification passes.

---

## Phase 0: Non-Stripe Prerequisites

The app requires these environment variables to function at all. If any are missing, API routes will return 500 before Stripe is ever reached. Set these in Vercel **before** starting Stripe configuration.

| Variable                   | Required by                                                       | Where to get it                                                              |
| -------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `OPENAI_API_KEY`           | LLM layer (`src/lib/llm.ts`)                                      | [platform.openai.com/api-keys](https://platform.openai.com/api-keys)         |
| `UPSTASH_REDIS_REST_URL`   | Session store, rate limiting, audit, data layer                   | [console.upstash.com](https://console.upstash.com) — create a Redis database |
| `UPSTASH_REDIS_REST_TOKEN` | Same as above                                                     | Same Upstash database credentials page                                       |
| `JWT_SECRET`               | Auth token creation (`src/lib/auth.ts`)                           | Generate: `openssl rand -base64 32`                                          |
| `PROVENANCE_SIGNING_KEY`   | Provenance chain (must differ from JWT_SECRET)                    | Generate: `openssl rand -base64 32`                                          |
| `NEXT_PUBLIC_APP_URL`      | Subscribe route redirect URLs                                     | Your deployed URL, e.g., `https://afloat.vercel.app`                         |
| `CRON_SECRET`              | Auto-deletion cron job auth (`src/app/api/cron/cleanup/route.ts`) | Generate: `openssl rand -base64 32` — also set in Vercel Cron config         |

> **Security note:** If `CRON_SECRET` is not set, the cron cleanup route returns 500 (fail-closed). This is intentional — see the auth bypass fix in the cron route.

**Checkpoint:** All 7 variables above are set in Vercel. Run a quick health check: visit `https://<YOUR_APP_URL>/api/v1/session/start` — it should return a structured error (e.g., 401 or 400), not a 500 "Missing environment variable" error.

---

## Phase 1: Stripe Account Setup

### Step 1.1 — Activate your Stripe account

1. Go to **Settings > Account details**
2. Fill in business name: `Afloat`
3. Business type: `Individual / Sole proprietor`
4. Complete identity verification if prompted
5. **Do NOT enable Live Mode yet** — stay in Test Mode

**Checkpoint:** Account status shows "Test Mode" in the dashboard header.

### Step 1.2 — Get API keys

1. Go to **Developers > API keys**
2. Copy the **Secret key** (starts with `sk_test_`) — click "Reveal test key" first
3. Copy the **Publishable key** (starts with `pk_test_`)

**Record these values — you will need them in Phase 4.**

| Key             | Env var                  | Example prefix | Used by code?                                                                                                                                                                                   |
| --------------- | ------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secret key      | `STRIPE_SECRET_KEY`      | `sk_test_`     | Yes — `src/lib/stripe.ts` (all Stripe API calls)                                                                                                                                                |
| Publishable key | `STRIPE_PUBLISHABLE_KEY` | `pk_test_`     | **No** — collected for completeness only. Afloat uses server-side Checkout redirects, so no client-side Stripe.js is loaded. Retained in `.env.example` for future use (e.g., Stripe Elements). |

---

## Phase 2: Product & Price Configuration

### Step 2.1 — Create the Afloat product

1. Go to **Product catalog > + Add product**
2. Fill in:
   - **Name:** `Afloat`
   - **Description:** `Quick decision support — cognitive-assistive AI sessions`
   - **Image:** Optional (can add later)
3. **Do NOT add a price yet** — click **Save product**
4. Copy the **Product ID** (starts with `prod_`) from the product detail page

**Checkpoint:** Product visible in Product catalog with no prices yet.

### Step 2.2 — Create the Trial tier price ($9/quarter)

1. On the Afloat product page, click **+ Add another price**
2. Configure:
   - **Pricing model:** Standard pricing
   - **Price:** `$9.00`
   - **Billing period:** `Every 3 months` (select "Custom" if quarterly is not a preset, then enter 3 months)
   - **Price description:** `Trial — 2-minute sessions, quarterly billing`
3. Click **Save price** (or **Add price**)
4. Copy the **Price ID** (starts with `price_`)

| Field      | Value              | Why                                                                            |
| ---------- | ------------------ | ------------------------------------------------------------------------------ |
| Amount     | $9.00              | $3/month effective, billed quarterly to reduce Stripe fee drag (6.2% vs 12.9%) |
| Interval   | 3 months           | Per contract v1.6.0 `payment_layer.plan.trial`                                 |
| Usage type | Licensed (default) | Flat recurring, not metered                                                    |

**Record this Price ID as `STRIPE_PRICE_ID`.**

### Step 2.3 — Create a Billing Meter for continuous sessions

1. Go to **Billing > Meters** (or **Product catalog > Meters** depending on dashboard version)
2. Click **+ Create meter**
3. Configure:
   - **Meter name:** `Afloat Session Minutes`
   - **Event name:** `afloat_session_minutes`
   - **Aggregation formula:** Sum
   - **Value key:** `value`
   - **Customer mapping:** `stripe_customer_id`
4. Click **Create**

> **Critical:** The event name `afloat_session_minutes` must match exactly — the code in `src/lib/stripe.ts:73` reads from `STRIPE_METER_EVENT_NAME` (defaults to `afloat_session_minutes`).

> **Implementation note:** The `reportUsage()` function sends the value as a string (`value: String(quantity)`), not a number. Stripe's Meter Events API accepts string values and converts them. If you test manually via the Stripe API or CLI, send the value as a string to match the app's behavior.

**Checkpoint:** Meter visible under Billing > Meters. Event name shows `afloat_session_minutes`.

### Step 2.4 — Create the Continuous tier price ($3/hour metered)

1. Go back to the **Afloat** product page
2. Click **+ Add another price**
3. Configure:
   - **Pricing model:** Usage-based pricing (metered)
   - **Meter:** Select `Afloat Session Minutes` (created in Step 2.3)
   - **Price per unit:** `$0.05` (= $3.00 / 60 minutes per hour)
   - **Billing period:** Monthly
   - **Price description:** `Continuous — up to 30-minute sessions, metered per minute`
4. Click **Save price**
5. Copy the **Price ID** (starts with `price_`)

| Field           | Value                  | Why                                                              |
| --------------- | ---------------------- | ---------------------------------------------------------------- |
| Amount per unit | $0.05/minute           | $3/hour ÷ 60 = $0.05/min. Stripe meters report in integer units. |
| Meter           | afloat_session_minutes | Matches `reportUsage()` in `src/lib/stripe.ts`                   |
| Billing period  | Monthly                | Metered usage aggregated and billed monthly                      |

> **Billing floor:** The session end route uses `Math.max(1, Math.ceil(durationMs / 60_000))` to compute usage minutes. This means a 10-second test session still reports **1 minute** ($0.05) of metered usage. This is the minimum billing unit — there is no zero-usage report. Keep this in mind during verification (Step 5.4).

**Record this Price ID as `STRIPE_CONTINUOUS_PRICE_ID`.**

**Checkpoint:** Afloat product now shows two prices — one recurring ($9/3mo) and one metered.

---

## Phase 3: Webhook Configuration

### Step 3.1 — Create the webhook endpoint

1. Go to **Developers > Webhooks**
2. Click **+ Add endpoint**
3. Configure:
   - **Endpoint URL:** `https://<YOUR_APP_URL>/api/v1/webhooks/stripe`
     - For testing locally: use `stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe` via the Stripe CLI instead
   - **Description:** `Afloat production webhook`
   - **Listen to:** Select **specific events** (do NOT listen to all events)

### Step 3.2 — Select webhook events

Select exactly these 4 event types:

| Event                           | Why                                  | Code handler                  |
| ------------------------------- | ------------------------------------ | ----------------------------- |
| `checkout.session.completed`    | Creates user account, detects tier   | `webhook/stripe/route.ts:55`  |
| `invoice.paid`                  | Marks subscription active on renewal | `webhook/stripe/route.ts:109` |
| `invoice.payment_failed`        | Marks subscription past_due          | `webhook/stripe/route.ts:120` |
| `customer.subscription.deleted` | Marks subscription canceled          | `webhook/stripe/route.ts:131` |

> **Why only these 4?** The webhook handler has a `switch` statement that only processes these events. Extra events would be received but ignored, adding unnecessary webhook traffic and potential confusion during debugging.

> **Metered billing note:** `invoice.paid` also fires for the initial $0 invoice that Stripe creates when a metered (continuous tier) subscription starts. This is expected — the handler idempotently sets `subscription_status: "active"` on a user that is already active. During verification, the first `invoice.paid` for a continuous-tier user will be for a $0 invoice, not a real charge.

3. Click **Add endpoint**

### Step 3.3 — Get the webhook signing secret

1. On the webhook endpoint detail page, click **Reveal** under Signing secret
2. Copy the value (starts with `whsec_`)

**Record this as `STRIPE_WEBHOOK_SECRET`.**

**Checkpoint:** Webhook endpoint visible at Developers > Webhooks, status "Enabled", listening to exactly 4 events.

---

## Phase 4: Environment Variables

### Step 4.1 — Set Stripe-specific Vercel environment variables

Go to your Vercel project > **Settings > Environment Variables** and add:

| Variable                     | Value                                    | Scope                            |
| ---------------------------- | ---------------------------------------- | -------------------------------- |
| `STRIPE_SECRET_KEY`          | `sk_test_...` (from Step 1.2)            | Production, Preview, Development |
| `STRIPE_PUBLISHABLE_KEY`     | `pk_test_...` (from Step 1.2)            | Production, Preview, Development |
| `STRIPE_WEBHOOK_SECRET`      | `whsec_...` (from Step 3.3)              | Production only                  |
| `STRIPE_PRICE_ID`            | `price_...` (from Step 2.2 — trial)      | Production, Preview, Development |
| `STRIPE_CONTINUOUS_PRICE_ID` | `price_...` (from Step 2.4 — continuous) | Production, Preview, Development |
| `STRIPE_METER_EVENT_NAME`    | `afloat_session_minutes`                 | Production, Preview, Development |

> **Security note:** `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` should **never** appear in client-side code. They are only used in server-side API routes (`src/lib/stripe.ts`, `src/app/api/v1/webhooks/stripe/route.ts`). The code does not expose these to the client.

> **Reminder:** Phase 0 env vars (`OPENAI_API_KEY`, `UPSTASH_REDIS_*`, `JWT_SECRET`, `PROVENANCE_SIGNING_KEY`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`) must already be set. Without them, the app returns 500 before Stripe code is reached.

### Step 4.2 — Set local `.env` for development

Copy `.env.example` to `.env` and fill in the test-mode values:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_... (from Stripe CLI if testing locally)
STRIPE_PRICE_ID=price_... (trial quarterly)
STRIPE_CONTINUOUS_PRICE_ID=price_... (continuous metered)
STRIPE_METER_EVENT_NAME=afloat_session_minutes
```

### Step 4.3 — Redeploy

After setting all environment variables in Vercel, trigger a redeployment:

- Push any commit, or
- Go to Vercel > Deployments > click **Redeploy** on the latest deployment

**Checkpoint:** Vercel dashboard shows all 13 environment variables set (7 from Phase 0 + 6 from Phase 4).

---

## Phase 5: End-to-End Verification (Test Mode)

### Step 5.1 — Trial tier checkout flow

1. Open `https://<YOUR_APP_URL>/subscribe`
2. Click **"Get Started — $9/quarter"**
3. You should be redirected to Stripe Checkout
4. Use test card: `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP
5. Complete payment
6. You should be redirected to `/subscribe/success?session_id=cs_test_...`
7. The success page will show a "Set consent preferences" button — click it to visit `/consent`
8. On `/consent`, accept at least `essential_processing` and optionally `session_telemetry`
9. Navigate to `/chat` — you should be able to start a session
10. Verify in Stripe dashboard: **Customers** shows a new customer with an active $9/3mo subscription

**Verify webhook delivery:**

- Check **Developers > Webhooks > [your endpoint] > Recent deliveries** — should show 200 response for `checkout.session.completed`

> **Note:** If you skip `/consent` and go directly to `/chat`, sessions will work but telemetry won't be written (because `session_telemetry.granted` defaults to `false`). This is correct behavior, not a bug.

### Step 5.2 — Continuous tier checkout flow

1. Open `https://<YOUR_APP_URL>/subscribe` (use a different browser / incognito)
2. Click **"Subscribe — $3/hour"**
3. Complete Stripe Checkout with test card
4. Verify in Stripe: customer has a metered subscription with $0.00 initial invoice (metered = billed in arrears)

**Critical: Verify tier detection.**

The webhook handler detects the tier by comparing the checkout line item's price ID against `STRIPE_CONTINUOUS_PRICE_ID`. If detection fails (env var missing, API error), it silently defaults to `"trial"`. To confirm the continuous tier was correctly assigned:

- Option A: Start a session at `/chat` — the response should show `max_duration_ms: 1800000` (30 min) and up to 6 turns, not 120000ms / 2 turns
- Option B: Check the webhook delivery detail — the response body should include `tier: "continuous"` in the audit log metadata

If the session shows trial-tier limits (2 min, 2 turns) for a continuous subscriber, `STRIPE_CONTINUOUS_PRICE_ID` is misconfigured.

### Step 5.3 — Webhook delivery verification

1. Go to **Developers > Webhooks > [your endpoint]**
2. Check **Recent deliveries**
3. Every delivery should show:
   - Status: **200** (green)
   - Response body: `{"received": true}`
4. If any show 4xx/5xx, click to inspect the error

**Common failures:**

| Symptom                         | Cause                                                          | Fix                                                                              |
| ------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 401 "Invalid webhook signature" | Wrong `STRIPE_WEBHOOK_SECRET`                                  | Re-copy from webhook endpoint page                                               |
| 500                             | Missing other env vars (`UPSTASH_REDIS_*`, `JWT_SECRET`, etc.) | Set all Phase 0 env vars in Vercel                                               |
| Timeout                         | Cold start on Vercel free tier                                 | Retry — Stripe auto-retries up to 3 times; idempotency guard prevents duplicates |

### Step 5.4 — Metered usage reporting verification

1. As a continuous-tier test user, start a chat session and complete it
2. Go to **Billing > Meters > Afloat Session Minutes**
3. Verify that usage events appear for the test customer
4. **Expected minimum:** Even a very short session (e.g., 5 seconds) will report **1 minute** of usage. This is the billing floor — `Math.max(1, Math.ceil(durationMs / 60_000))`. A 1-minute report for a quick test session is correct behavior, not a meter error.
5. If no events appear, check:
   - `STRIPE_METER_EVENT_NAME` matches the meter's event name exactly (`afloat_session_minutes`)
   - The session end route is calling `reportUsage()` with the correct `stripe_customer_id`

### Step 5.5 — Invoice cycle verification (continuous tier)

To verify metered invoice generation without waiting a real month:

1. **Option A (Stripe CLI):** Run `stripe billing_meters event_summary --meter <meter_id>` to see accumulated usage, then `stripe invoices upcoming --customer <cus_id>` to preview the upcoming invoice
2. **Option B (Test Clocks):** In Stripe dashboard, go to **Billing > Test clocks**, create a test clock, create a customer/subscription in that clock, advance the clock past the billing cycle, and inspect the generated invoice
3. **Option C (Manual):** Go to the test customer's subscription in dashboard, click **Actions > Create upcoming invoice**

Verify the invoice line item shows metered usage quantity and correct per-unit price ($0.05/min).

### Step 5.6 — Cancellation flow verification

1. In Stripe dashboard, cancel the test subscription manually
2. Check webhook deliveries — `customer.subscription.deleted` should fire
3. Verify the app reflects canceled status (user cannot access `/chat`)

**Checkpoint:** All 4 webhook events tested, both tiers checkout successfully, metered usage reports correctly, tier detection verified for continuous.

---

## Phase 6: Go Live

### Step 6.1 — Switch to Live Mode

> **Only do this after Phase 5 passes completely.**

1. Toggle **Live Mode** in the Stripe dashboard (top-right toggle)
2. Repeat Phase 2 in Live Mode:
   - Create the same Afloat product
   - Create the same billing meter (`afloat_session_minutes` — same event name)
   - Create the same two prices (trial $9/3mo, continuous $0.05/min metered)
   - **Price IDs will be different in Live Mode** — record the new ones
3. Repeat Phase 3 in Live Mode:
   - Create a new webhook endpoint with the same URL and same 4 events
   - Get the new `whsec_` signing secret

### Step 6.2 — Update environment variables for production

Replace ALL test-mode values in Vercel with live-mode values:

| Variable                     | Change from                   | Change to                     |
| ---------------------------- | ----------------------------- | ----------------------------- |
| `STRIPE_SECRET_KEY`          | `sk_test_...`                 | `sk_live_...`                 |
| `STRIPE_PUBLISHABLE_KEY`     | `pk_test_...`                 | `pk_live_...`                 |
| `STRIPE_WEBHOOK_SECRET`      | `whsec_...` (test)            | `whsec_...` (live)            |
| `STRIPE_PRICE_ID`            | `price_...` (test trial)      | `price_...` (live trial)      |
| `STRIPE_CONTINUOUS_PRICE_ID` | `price_...` (test continuous) | `price_...` (live continuous) |

> `STRIPE_METER_EVENT_NAME` stays the same (`afloat_session_minutes`).

### Step 6.3 — Redeploy and verify

1. Trigger a Vercel redeployment
2. Do a real $9 trial subscription with a real card (you can cancel and refund immediately)
3. Verify webhook delivery in Live Mode
4. Refund the test charge: **Payments > [payment] > Refund**

> **Note:** The refund does not undo webhook events — `checkout.session.completed` will have already fired and created the user record in Redis. The test user record will persist until manually cleaned up or the data retention cron removes it. This is expected.

**Checkpoint:** Live mode is active, real payments process, webhooks deliver successfully.

---

## Phase 7: Contract Ledger Update

After the first real subscription payment, update `contract.json` ledger.

### Trial tier entry template

```json
{
  "date": "<ISO-8601 timestamp>",
  "type": "revenue",
  "category": "subscription",
  "amount_usd": 9.0,
  "description": "Trial tier subscription — quarterly billing (customer #N)",
  "running_gross_total": "<previous + 9.00>",
  "running_cost_total": "<previous + 0.561>",
  "running_net_total": "<gross - costs>"
}
```

And a corresponding Stripe fee entry:

```json
{
  "date": "<same timestamp>",
  "type": "cost",
  "category": "payment_processing",
  "amount_usd": 0.561,
  "description": "Stripe fee: $0.30 + 2.9% of $9.00",
  "running_gross_total": "<same as above>",
  "running_cost_total": "<same as above>",
  "running_net_total": "<same as above>"
}
```

### Continuous tier entry template

Continuous tier invoices are variable (depends on metered session minutes). After each monthly invoice settles:

```json
{
  "date": "<ISO-8601 timestamp of invoice finalization>",
  "type": "revenue",
  "category": "subscription",
  "amount_usd": "<invoice total from Stripe — e.g., 2.50 for 50 minutes>",
  "description": "Continuous tier metered invoice — <N> minutes @ $0.05/min (customer #N)",
  "running_gross_total": "<previous + invoice amount>",
  "running_cost_total": "<previous + stripe fee>",
  "running_net_total": "<gross - costs>"
}
```

Stripe fee for continuous: `$0.30 + 2.9% × <invoice amount>`. Read the actual fee from **Payments > [payment] > Fee** in the Stripe dashboard.

> **Rule (from contract):** Every financial event must be recorded in `revenue.ledger.entries` with running totals. No exceptions.

---

## Quick Reference Card

| Item                    | Value                                                                                                   | Source                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Trial price             | $9.00 / 3 months                                                                                        | `STRIPE_PRICE_ID`                             |
| Continuous price        | $0.05 / minute ($3/hr)                                                                                  | `STRIPE_CONTINUOUS_PRICE_ID`                  |
| Meter event name        | `afloat_session_minutes`                                                                                | `STRIPE_METER_EVENT_NAME`                     |
| Webhook URL             | `https://<app>/api/v1/webhooks/stripe`                                                                  | `src/app/api/v1/webhooks/stripe/route.ts`     |
| Webhook events          | `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted` | —                                             |
| Stripe fee (trial)      | $0.561 per quarterly charge                                                                             | $0.30 + 2.9% of $9.00                         |
| Stripe fee (continuous) | $0.30 + 2.9% of metered invoice                                                                         | Variable per billing cycle                    |
| Minimum metered unit    | 1 minute ($0.05)                                                                                        | `Math.max(1, Math.ceil(durationMs / 60_000))` |
| Test card               | `4242 4242 4242 4242`                                                                                   | Stripe docs                                   |
| Total env vars needed   | 13 (7 non-Stripe + 6 Stripe)                                                                            | `.env.example`                                |

---

## Troubleshooting

| Problem                                    | Diagnostic                                                 | Resolution                                                                                                                |
| ------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 500 on any route before Stripe             | Missing Phase 0 env vars                                   | Check `UPSTASH_REDIS_*`, `JWT_SECRET`, `NEXT_PUBLIC_APP_URL`, `PROVENANCE_SIGNING_KEY` are set                            |
| "Payment not configured" on subscribe      | Missing `STRIPE_PRICE_ID` or `STRIPE_CONTINUOUS_PRICE_ID`  | Set env vars in Vercel, redeploy                                                                                          |
| Webhook returns 401                        | `STRIPE_WEBHOOK_SECRET` mismatch                           | Re-copy signing secret from Stripe dashboard                                                                              |
| User created but wrong tier                | `STRIPE_CONTINUOUS_PRICE_ID` env var not set or mismatched | Webhook defaults to trial when it can't detect tier. Verify the env var matches the live/test continuous price ID exactly |
| Metered usage not appearing                | Meter event name mismatch                                  | Ensure `STRIPE_METER_EVENT_NAME=afloat_session_minutes` matches Stripe meter exactly                                      |
| Metered test shows 1 min for short session | Expected — billing floor                                   | `Math.max(1, ...)` ensures minimum 1-minute report                                                                        |
| Subscription shows $0 invoice              | Normal for metered tier                                    | First invoice is $0; usage is billed in arrears at end of billing cycle                                                   |
| Webhook timeout on Vercel                  | Serverless cold start                                      | Stripe auto-retries; idempotency in webhook handler prevents duplicates                                                   |
| Cron cleanup returns 500                   | `CRON_SECRET` not set                                      | Set `CRON_SECRET` env var — route fails closed when secret is missing                                                     |

---

## Known Codebase Notes

These are not setup errors but contextual details for anyone debugging post-setup:

1. **`stripe_subscription_item_id`** is defined on `UserRecord` (`src/types/user.ts:24`) but the webhook handler does not populate it during `checkout.session.completed`. It will always be `undefined`. This doesn't break metered billing (usage reports use `stripe_customer_id` via the meter's customer mapping), but the field is orphaned. Flag for future cleanup if subscription-item-level billing is needed.

2. **`STRIPE_PUBLISHABLE_KEY`** is in `.env.example` and collected in Vercel but not read by any server-side code. Afloat uses server-side Checkout redirects exclusively. The key is retained for future use (e.g., if Stripe Elements is added for inline payment forms).
