# Afloat — Launch Progress & Remaining Work

**Document version:** 1.0.0
**Last updated:** 2026-03-01
**Production URL:** https://afloat-six.vercel.app
**App version:** 0.1.1
**Phase 1 start date:** 2026-03-01 (90-day clock)
**Phase 1 end date:** 2026-05-29

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Infrastructure Status](#3-infrastructure-status)
4. [Stripe Configuration](#4-stripe-configuration)
5. [Environment Variables](#5-environment-variables)
6. [Deployment Pipeline](#6-deployment-pipeline)
7. [What Is Complete](#7-what-is-complete)
8. [What Remains](#8-what-remains)
9. [Compliance Status](#9-compliance-status)
10. [Product Roadmap Status](#10-product-roadmap-status)
11. [Financial Model](#11-financial-model)
12. [Go-Live Checklist](#12-go-live-checklist)

---

## 1. Executive Summary

Afloat is a micro-subscription cognitive decision-support tool. Users describe what they are stuck on and receive a short, direct brief — no padding, no follow-up questions, no noise. Sessions are capped by tier.

The core product, billing stack, data layer, compliance infrastructure, and deployment pipeline are all built and verified. The system passed a full local end-to-end test on 2026-02-28 with all four Stripe webhook events returning `[200]`. Production is live at version 0.1.1 with all environment variables configured.

**Current status: production-ready infrastructure, awaiting first real user.**

### What is working right now

- Users can visit `/subscribe`, choose a tier, and complete a Stripe Checkout
- The webhook handler creates a user record in Redis and sets subscription tier
- Trial users get 2 LLM calls / 2-minute sessions
- Continuous users get 6 LLM calls / 30-minute sessions with metered billing
- Session start, message, and end routes all enforce tier limits
- Metered usage (continuous tier) is reported to Stripe after each session
- Safety gradient blocks rapid-fire abuse on the continuous tier
- Data rights endpoints (export, delete, rectify) are implemented
- Audit logging is immutable and append-only
- Consent management is implemented with granular per-category toggles
- Privacy policy is published at `/privacy`
- Auto-deletion cron runs daily at 02:00 UTC
- Health endpoint returns version and timestamp at `/api/v1/health`

### What is not done yet

- ~~ROPA (Record of Processing Activities)~~ ✅ Completed 2026-03-01
- ~~Incident Response Plan~~ ✅ Completed 2026-03-01
- ~~Internal compliance runbook~~ ✅ Completed 2026-03-01
- Compliance test cases TC-01 through TC-08
- Milestone 2 (Response Quality) and Milestones 4–6 (see §10)
- First real paying user

---

## 2. System Architecture

### Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 16.1.6 (App Router, Turbopack) | React 19, Tailwind CSS 4 |
| API | Next.js serverless functions | All routes under `/api/v1/` |
| LLM | OpenAI API | Server-side only, responses never persisted |
| Session store | Upstash Redis (REST) | All user, session, and audit data |
| Payments | Stripe | Checkout, webhooks, metered billing |
| Hosting | Vercel | Serverless, Edge network |
| CI/CD | GitHub Actions | Lint → Test → Build → Deploy on push to `main` |

### API Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/v1/session/start` | JWT (subscriber) | Start session, get session_id and tier limits |
| `POST` | `/api/v1/session/[id]/message` | JWT (subscriber) | Send message, receive LLM brief |
| `POST` | `/api/v1/session/[id]/end` | JWT (subscriber) | End session, write telemetry, report usage |
| `POST` | `/api/v1/subscribe` | Rate limited | Create Stripe Checkout session |
| `GET` | `/api/v1/subscribe/verify` | — | Verify checkout completion, issue JWT |
| `POST` | `/api/v1/webhooks/stripe` | Stripe signature | Receive and process Stripe events |
| `GET` | `/api/v1/user/data-export` | JWT | GDPR right to access and portability |
| `DELETE` | `/api/v1/user/data` | JWT | GDPR right to erasure (7-day grace) |
| `PATCH` | `/api/v1/user/profile` | JWT | GDPR right to rectification |
| `GET` | `/api/v1/health` | None | Uptime and version check |
| `GET` | `/api/cron/cleanup` | `CRON_SECRET` bearer | Daily retention enforcement |

### Session Flow

```
User Input
    │
    ▼
Gate Detection (4 types: risk/tradeoff/option/reframe — or out_of_scope)
    │
    ▼
Brief Delivery (≤150 words, no filler, no follow-up questions)
    │
    ▼
User Decision (proceed / stop)
    │
    ▼
Session End (telemetry written, usage reported for continuous tier)
```

### Tier Limits

| Property | Trial | Continuous |
|---|---|---|
| Max LLM calls | 2 | 6 |
| Max session duration | 120 seconds (2 min) | 1800 seconds (30 min) |
| Billing | $9 / quarter (flat) | $0.05 / minute (metered) |
| Safety gradient | Pass-through | Blocks rapid-fire (<5s avg interval) |

---

## 3. Infrastructure Status

### Upstash Redis

| Property | Value |
|---|---|
| Endpoint | `pleased-marmoset-37365.upstash.io` |
| Region | Iowa, USA (us-central1) |
| Plan | Free tier |
| TLS | Enabled |
| Status | ✅ Connected and verified |

**Redis key schema:**

| Key pattern | Content | TTL |
|---|---|---|
| `user:{user_id}` | UserRecord JSON | Account lifetime |
| `stripe_customer:{customer_id}` | user_id mapping | Account lifetime |
| `session:{session_id}` | SessionState JSON | ~150s (trial) / ~1830s (continuous) |
| `sessions:{YYYY-MM-DD}` | Daily session log list | 90 days |
| `audit:{YYYY-MM-DD}` | Audit log list | 365 days |
| `stripe_event:{event_id}` | Idempotency marker | 24 hours |
| `rl:{identifier}` | Rate limit counter | Sliding window |

### Vercel

| Property | Value |
|---|---|
| Project URL | `https://afloat-six.vercel.app` |
| Plan | Free (Hobby) |
| Region | Default (US East) |
| Cron | `/api/cron/cleanup` at `0 2 * * *` (daily 02:00 UTC) |
| Status | ✅ Deployed, v0.1.1 live |

### GitHub

| Property | Value |
|---|---|
| Repository | `caraxesthebloodwyrm02/afloat` |
| Default branch | `main` |
| CI/CD trigger | Push to any branch (non-MD files) |
| Deploy target | Vercel (production on `main`, preview on other branches) |

---

## 4. Stripe Configuration

All Stripe configuration is in **live mode**.

### Account

| Property | Value |
|---|---|
| Account ID | `acct_1SkW3uFJouFkgsrk` |
| Mode | Live |

### Product

| Property | Value |
|---|---|
| Product ID | `prod_U3sTAipQcQ0hZL` |
| Name | afloat |
| Description | assistive tool |
| Status | Active |

### Prices

| Tier | Price ID | Amount | Interval | Type | Status |
|---|---|---|---|---|---|
| Trial | `price_1T5kidFJouFkgsrktGKkdX07` | $9.00 | Every 3 months | Licensed (flat) | ✅ Active |
| Continuous | `price_1T5pqcFJouFkgsrkWghtlIvW` | $0.05 / unit | Monthly | Metered | ✅ Active |

### Billing Meter

| Property | Value |
|---|---|
| Meter ID | `mtr_61UFDkraxDbu1tmNm41FJouFkgsrkXDc` |
| Display name | Afloat Session Minutes |
| Event name | `afloat_session_minutes` |
| Aggregation | Sum |
| Value key | `value` |
| Customer mapping key | `stripe_customer_id` |
| Status | ✅ Active |

### Webhook Endpoint

| Property | Value |
|---|---|
| Destination ID | `we_1T5qUyFJouFkgsrkjKWVfZZd` |
| Name | captivating-splendor |
| URL | `https://afloat-six.vercel.app/api/v1/webhooks/stripe` |
| API version | `2025-12-15.clover` |
| Status | ✅ Active |
| Events (4) | `checkout.session.completed` · `invoice.paid` · `invoice.payment_failed` · `customer.subscription.deleted` |
| Signing secret | Set in Vercel as `STRIPE_WEBHOOK_SECRET` ✅ |

### Webhook Handler Behaviour

| Event | Handler action |
|---|---|
| `checkout.session.completed` | Creates user record, detects tier from line items, sets `subscription_status: active` |
| `invoice.paid` | Sets `subscription_status: active` (handles renewals and $0 metered invoices) |
| `invoice.payment_failed` | Sets `subscription_status: past_due` |
| `customer.subscription.deleted` | Sets `subscription_status: canceled` |

Idempotency: each event ID is stored in Redis for 24 hours. Duplicate deliveries (Stripe retries) are detected and skipped.

---

## 5. Environment Variables

All variables confirmed set in Vercel production. Local `.env.local` mirrors these for development.

| Variable | Scope | Status |
|---|---|---|
| `STRIPE_SECRET_KEY` | All | ✅ |
| `STRIPE_PUBLISHABLE_KEY` | All | ✅ |
| `STRIPE_WEBHOOK_SECRET` | Production only | ✅ |
| `STRIPE_PRICE_ID` | All | ✅ (`price_1T5kidFJouFkgsrktGKkdX07`) |
| `STRIPE_CONTINUOUS_PRICE_ID` | All | ✅ (`price_1T5pqcFJouFkgsrkWghtlIvW`) |
| `STRIPE_METER_EVENT_NAME` | All | ✅ (`afloat_session_minutes`) |
| `OPENAI_API_KEY` | All | ✅ |
| `UPSTASH_REDIS_REST_URL` | All | ✅ (`https://pleased-marmoset-37365.upstash.io`) |
| `UPSTASH_REDIS_REST_TOKEN` | All | ✅ |
| `JWT_SECRET` | All | ✅ |
| `PROVENANCE_SIGNING_KEY` | All | ✅ (distinct from JWT_SECRET) |
| `NEXT_PUBLIC_APP_URL` | All | ✅ (`https://afloat-six.vercel.app`) |
| `CRON_SECRET` | All | ✅ |

**Local development only** (`.env.local`, never committed):

| Variable | Value |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | `whsec_4137bd968284cf0eea61df614f50c720dfa6fc6c952073b0a8160c6510a1772a` (from `stripe listen`) |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` |

---

## 6. Deployment Pipeline

### CI/CD Flow

```
git push origin main
        │
        ▼
GitHub Actions: ci-cd.yml
        │
        ├── quality job
        │       ├── npm ci
        │       ├── eslint (0 errors required)
        │       ├── vitest run (all tests must pass)
        │       └── next build (clean build required)
        │
        └── deploy_production job (runs only on main, after quality passes)
                ├── vercel pull --environment=production
                ├── vercel build --prod
                └── vercel deploy --prebuilt --prod
```

**Trigger rule:** Any push to any branch that changes non-Markdown, non-docs files triggers CI. Only pushes to `main` trigger production deploy.

**Known behaviour:** Empty commits do not trigger the workflow (GitHub's `paths-ignore` evaluation skips commits with no file changes). Always include a real file change to force a deploy.

### Stripe CLI (local development)

The Stripe CLI v1.37.1 is installed at `C:\tools\stripe\stripe.exe` and added to the user PATH.

**Local webhook testing workflow:**

```
Terminal 1:  stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe
Terminal 2:  npm run dev
Terminal 3:  stripe trigger <event_name>
```

The local signing secret (`whsec_4137bd...`) is stable per machine — it does not change between `stripe listen` sessions on the same device and Stripe account.

---

## 7. What Is Complete

### Infrastructure

- [x] Upstash Redis provisioned and connected
- [x] Vercel project deployed and live
- [x] GitHub Actions CI/CD pipeline operational
- [x] All 13 environment variables set in Vercel
- [x] Stripe CLI installed locally
- [x] Local webhook listener configured and tested

### Stripe Billing

- [x] Stripe account activated (live mode)
- [x] Product created: Afloat (`prod_U3sTAipQcQ0hZL`)
- [x] Trial price created: $9.00 / quarter (`price_1T5kid...`)
- [x] Billing meter created: `afloat_session_minutes` (`mtr_61UFD...`)
- [x] Continuous price created: $0.05 / minute metered (`price_1T5pqc...`)
- [x] Webhook endpoint registered: 4 events, active, URL correct
- [x] Webhook signing secret confirmed matching between Stripe and Vercel

### Application Code

- [x] Two-tier subscription system (trial + continuous)
- [x] Stripe Checkout for both tiers (flat + metered)
- [x] Webhook handler — all 4 events — with idempotency guard
- [x] Tier detection from checkout line items
- [x] Session controller with per-tier limits (turns + duration)
- [x] Metered usage reporting (`reportUsage()` called at session end)
- [x] Safety gradient layer (fail-closed, continuous tier blocks rapid-fire)
- [x] JWT authentication middleware
- [x] Rate limiting on all public endpoints
- [x] Audit logging (append-only, IP hashed)
- [x] Consent management (CM-01 / CM-02 / CM-03)
- [x] Data rights API (export, delete, rectify)
- [x] Provenance chain
- [x] Auto-deletion cron job (`/api/cron/cleanup`, daily 02:00 UTC)
- [x] Privacy policy page (`/privacy`, effective 2026-03-01)
- [x] Health endpoint (`/api/v1/health`, returns version)
- [x] Subscribe page with two-tier comparison layout
- [x] Chat UI with dynamic session limits from tier

### Compliance Documents

- [x] DPIA (Data Protection Impact Assessment) — `DPIA.md`
- [x] Privacy Policy — `src/app/privacy/page.tsx`

### Testing

- [x] 153+ unit and integration tests passing
- [x] 0 ESLint errors
- [x] Clean production build
- [x] All 4 webhook events verified `[200]` locally
- [x] Milestones 1 and 3 quality gates passed

---

## 8. What Remains

Items are listed in priority order for launch readiness.

### 8.1 Compliance Documents (blocking for GDPR readiness)

These documents are required by the contract (`§7g`) and are the last compliance gap.

#### ROPA — Record of Processing Activities (`§7g.4`)
A formal register of all data processing activities as required under GDPR Article 30.

**Must cover:**
- Name and contact of controller (Irfan Kabir, sole operator)
- Purposes of processing for each activity
- Categories of data subjects and personal data
- Recipients and third-country transfers (OpenAI — US, Stripe — US, Vercel — US)
- Retention periods per category
- Technical and organisational security measures

**Suggested file:** `docs/ROPA.md`

#### Incident Response Plan (`§7g.5`)
A documented procedure for handling personal data breaches, including the 72-hour notification obligation under GDPR Article 33.

**Must cover:**
- Detection criteria (what counts as a breach)
- Immediate containment steps (revoke keys, kill sessions, disable endpoints)
- Assessment: scope, severity, number of affected data subjects
- 72-hour notification to supervisory authority (if >250 users affected or high risk)
- Notification to affected users (if high risk to their rights and freedoms)
- Post-incident review and hardening steps
- Contact details for the supervisory authority

**Suggested file:** `docs/INCIDENT_RESPONSE.md`

#### Internal Compliance Runbook (`§7g.6`)
An operational guide for the sole operator covering day-to-day compliance tasks.

**Must cover:**
- How to process a GDPR data subject request (access / deletion / rectification)
- How to handle a consent withdrawal
- How to rotate secrets (JWT_SECRET, PROVENANCE_SIGNING_KEY, Stripe keys)
- How to verify the cron job ran successfully
- How to check and respond to audit log alerts
- Monthly transparency ledger update process
- Annual DPIA review process

**Suggested file:** `docs/RUNBOOK.md`

### 8.2 Compliance Test Cases (`§7g.7`)

Eight test cases defined in the contract that must be manually executed and recorded.

| ID | Test | How to execute |
|---|---|---|
| TC-01 | Consent opt-in is not pre-checked | Visit `/consent` in fresh session; verify no boxes pre-checked |
| TC-02 | Consent can be withdrawn per category | Grant then revoke `session_telemetry`; verify telemetry not written on next session |
| TC-03 | Data export returns correct structure | Call `GET /api/v1/user/data-export` with valid JWT; verify JSON schema |
| TC-04 | Data deletion removes profile within 7 days | Call `DELETE /api/v1/user/data`; run cron; verify `GET` returns null |
| TC-05 | Session text is never persisted | Start session, send message, check Redis for message content; must not exist |
| TC-06 | IP address is stored hashed only | Trigger any audit event; verify `ip_hash` field is SHA-256 format, not raw IP |
| TC-07 | Webhook signature verification rejects unsigned requests | POST to webhook without `stripe-signature` header; expect `401` |
| TC-08 | Canceled subscription blocks `/chat` access | Cancel subscription in Stripe; verify `/chat` returns 402 or redirects to `/subscribe` |

### 8.3 Baseline Performance Tests (`§2.11`)

Record real latency measurements from the live production deployment.

**Target:** Average LLM response latency ≤ 3.0 seconds  
**Method:** Start 10 test sessions in production with a real OpenAI key, measure `latency_per_turn` from session logs in Redis, compute average.

### 8.4 First User Acquisition (`§5.2–5.3`)

**Milestone:** 3 paying users within Phase 1 (90 days from 2026-03-01).

**Soft launch steps:**
1. Share `/subscribe` URL with at least 3 known contacts
2. Verify `checkout.session.completed` fires and user record is created
3. Verify the user can access `/chat` and complete a session
4. Verify metered billing reports usage (continuous tier) or flat invoice (trial tier)

**Acquisition fallback:** If fewer than 6 subscribers by Day 60 (2026-04-30), the contract triggers Model C (as defined in `contract.json` risk controls).

### 8.5 KPI Monitoring (ongoing from first user)

Once real sessions are running, these must be tracked monthly:

| KPI | Target | Data source |
|---|---|---|
| Session success rate | ≥ 95% | `session_completed: true` / total in Redis |
| Context gate pass rate | ≥ 70% | `gate_type != "out_of_scope"` / total |
| Average session duration | ≤ 2.0 min | `latency_per_turn` sum in session logs |
| Response latency | ≤ 3.0 s avg | `latency_per_turn` in session logs |

### 8.6 First Transparency Report (`§5.5`)

A public-facing summary of Afloat's first month of operation. Should cover:
- Number of sessions
- Revenue received
- Costs incurred
- KPI results vs targets
- Any incidents or anomalies

Publish as a page in the app or a linked document.

### 8.7 Cron Job Production Verification

The auto-deletion cron route is implemented and scheduled in `vercel.json` (`0 2 * * *`). It has not yet run in production as there is no data to delete.

**Verification method:** After first user is created, manually invoke the cron endpoint:
```
curl -H "Authorization: Bearer <CRON_SECRET>" \
  https://afloat-six.vercel.app/api/cron/cleanup
```
Expected response:
```json
{ "ok": true, "users_deleted": 0, "sessions_cleaned": 0, "errors": [] }
```

---

## 9. Compliance Status

### Data Privacy Framework

| Section | Item | Status |
|---|---|---|
| 7a | Data flow audit (DF-01–DF-05) | ✅ Complete |
| 7a | PII risk classification | ✅ Complete |
| 7a | Third-party DPAs (OpenAI, Stripe, Vercel) | ✅ Auto-incorporated |
| 7b | Consent mechanism (CM-01 opt-in) | ✅ Implemented |
| 7b | Granular opt-out (CM-02) | ✅ Implemented |
| 7b | Consent renewal on policy change (CM-03) | ✅ Implemented |
| 7c | Right to access (DR-01) | ✅ Implemented |
| 7c | Right to erasure (DR-02) | ✅ Implemented |
| 7c | Right to portability (DR-03) | ✅ Implemented |
| 7c | Right to rectification (DR-04) | ✅ Implemented |
| 7d | Immutable audit log | ✅ Implemented |
| 7d | Alerting thresholds defined | ✅ Defined |
| 7e | Retention policies defined | ✅ Defined |
| 7e | User text never persisted (0-day) | ✅ Verified |
| 7e | Auto-deletion cron | ✅ Implemented, unverified in production |
| 7f | Privacy policy v1.0 | ✅ Published at `/privacy` |
| 7f | Footer link | ✅ In `layout.tsx` |
| 7g | DPIA | ✅ `DPIA.md` complete |
| 7g | ROPA | ✅ `ROPA.md` complete (2026-03-01) |
| 7g | Incident Response Plan | ✅ `INCIDENT_RESPONSE.md` complete (2026-03-01) |
| 7g | Compliance Runbook | ✅ `RUNBOOK.md` complete (2026-03-01) |
| 7g | TC-01 through TC-08 | ✅ 14/14 passed (2026-03-01) |

### Key Security Properties

| Property | Enforcement | Status |
|---|---|---|
| User text never stored | `updateSession()` strips history before Redis write | ✅ |
| IPs stored hashed only | `hashIP()` with SHA-256 in `audit.ts` | ✅ |
| No card data stored | Stripe handles all payment PII | ✅ |
| Webhook signature verified | `constructWebhookEvent()` rejects unsigned requests | ✅ |
| JWT required on protected routes | `auth-middleware.ts` applied to session + user routes | ✅ |
| Cron endpoint fail-closed | Returns 500 if `CRON_SECRET` not set | ✅ |
| Safety gradient fail-closed | Returns `allowed: false` if evaluation throws | ✅ |

---

## 10. Product Roadmap Status

Full milestone definitions are in `ROADMAP.md`.

| Milestone | Description | Status |
|---|---|---|
| M1 — Technical Baseline | Core session, auth, export, provenance | ✅ Complete (107/107 tests) |
| M2 — Response Quality Foundation | Gate tag validation, response shape checks | ⏳ Not started |
| M3 — Session Depth & Tier System | Two-tier billing, safety gradient, metered usage | ✅ Complete |
| M4 — Data Retention & Cleanup | Session TTL enforcement, deletion probes | ⏳ Not started (cron implemented, probes not written) |
| M5 — Observability | Structured request logging, response quality metrics | ⏳ Not started |
| M6 — Product Behavior Baseline | `baseline.txt` v2.0.0 — response quality contract | ⏳ Not started |

### Next milestone: M2

M2 requires no infrastructure changes. It is pure code + tests:
1. Audit `prompt.ts` for enforceability
2. Add `[GATE: type]` tag parsing to the message route (observation only, no user-facing change)
3. Write D-series probes (REQ-D1 through REQ-D5)
4. Verify all existing 153+ tests still pass

---

## 11. Financial Model

### Pricing

| Tier | Billing | Effective monthly |
|---|---|---|
| Trial | $9.00 / quarter | $3.00 / month |
| Continuous | $0.05 / minute metered | Variable (avg $3.00 at 60 min/month) |

### 90-Day Contract Targets

| Metric | Target | Basis |
|---|---|---|
| Gross revenue | $108.00 | 12 subscribers × $9/quarter (trial tier, one billing cycle) |
| Payment processor fees | $3.24 | ~3% of gross |
| Infrastructure costs | $0.00 | All services on free tiers |
| Net revenue | ≥ $104.76 | Gross - fees - costs |

### Cost Controls

| Trigger | Condition | Action |
|---|---|---|
| Acquisition risk | < 6 subscribers by Day 60 | Activate Model C (pivot strategy) |
| Latency overrun | > 3.0s avg for 7 consecutive days | Downgrade prompt or model |
| Cost overrun | > 15% over estimate | Freeze discretionary spend |

### Ledger

The revenue ledger is defined in `contract.json` and must be updated with every real revenue or cost event. Initial entry (2026-02-26) shows $0.00 on all running totals.

---

## 12. Go-Live Checklist

The following is the authoritative ordered checklist for moving from infrastructure-ready to revenue-generating.

### Immediate (do before any user)

- [x] Write ROPA (`docs/ROPA.md`) — completed 2026-03-01
- [x] Write Incident Response Plan (`docs/INCIDENT_RESPONSE.md`) — completed 2026-03-01
- [x] Write compliance runbook (`docs/RUNBOOK.md`) — completed 2026-03-01
- [x] Execute TC-01 through TC-08 manually and record results — **14/14 passed** (2026-03-01)

### On first user

- [ ] Verify `checkout.session.completed` webhook delivers `[200]` in Stripe Dashboard → Webhooks → Event deliveries
- [ ] Verify user record created in Redis (check Upstash console)
- [ ] Verify user can access `/chat` and complete a session
- [ ] Verify metered usage appears in Stripe → Billing → Meters (continuous tier)
- [ ] Record first revenue entry in `contract.json` ledger
- [ ] Invoke cron endpoint manually and verify `{ "ok": true }` response

### Within first 30 days

- [ ] Run baseline performance tests (10 sessions, record avg latency)
- [ ] Confirm all KPI targets are being met
- [ ] Begin M2 (Response Quality Foundation)
- [ ] Publish first transparency report

### By Day 60

- [ ] Confirm ≥ 6 subscribers (or activate Model C if not)
- [ ] Begin M4 (Data Retention & Cleanup probes)

### By Day 90 (Phase 1 end: 2026-05-29)

- [ ] Verify net revenue ≥ $22.90
- [ ] Publish Phase 1 final transparency report
- [ ] Complete DPIA review (scheduled: 2026-05-29)
- [ ] Decide Phase 2 scope

---

## Appendix A — File Map

| File | Purpose |
|---|---|
| `ARCHITECTURE.md` | Full system architecture, 12 sections |
| `ROADMAP.md` | Milestone definitions and quality gates |
| `BUILD_GUIDE.md` | Step-by-step build instructions |
| `STRIPE_SETUP_GUIDE.md` | Stripe Dashboard configuration reference |
| `CONTRACT_LAUNCH_CHECKLIST.md` | Contract-bound launch checklist |
| `DPIA.md` | Data Protection Impact Assessment |
| `contract.json` | Machine-readable contract, ledger, and KPIs |
| `baseline.txt` | Technical baseline v1.0.0 (ratified) |
| `docs/LAUNCH_PROGRESS.md` | This document |
| `docs/ROPA.md` | ✅ Record of Processing Activities (GDPR Art 30) |
| `docs/INCIDENT_RESPONSE.md` | ✅ Breach response plan (72-hour notification) |
| `docs/RUNBOOK.md` | ✅ Operational compliance guide |
| `src/lib/stripe.ts` | Stripe client, checkout, webhook, metered billing |
| `src/lib/auth.ts` | JWT creation and verification |
| `src/lib/auth-middleware.ts` | Route-level auth enforcement |
| `src/lib/redis.ts` | Upstash Redis client |
| `src/lib/data-layer.ts` | User CRUD, session logs, deletion |
| `src/lib/audit.ts` | Append-only audit log writer |
| `src/lib/consent.ts` | Consent record management |
| `src/lib/safety.ts` | Safety gradient evaluation |
| `src/lib/session-controller.ts` | Session lifecycle, tier enforcement |
| `src/lib/llm.ts` | OpenAI call wrapper |
| `src/lib/prompt.ts` | System prompt definition |
| `src/app/api/v1/webhooks/stripe/route.ts` | Stripe webhook handler |
| `src/app/api/cron/cleanup/route.ts` | Auto-deletion cron job |
| `src/app/privacy/page.tsx` | Privacy policy (v1.0, effective 2026-03-01) |
| `vercel.json` | Cron schedule configuration |
| `.github/workflows/ci-cd.yml` | GitHub Actions CI/CD pipeline |

---

*This document reflects the state of the project as of 2026-02-28. Update the "Last updated" field and relevant sections whenever significant progress is made.*