# Afloat

A no-fluff cognitive assistant. Get past context gates in under 2 minutes.

## What It Does

You describe what you're stuck on. Afloat identifies the block type (meeting triage, priority decision, quick briefing, or context gate resolution), gives you a short honest brief, and lets you ask one follow-up. Session over.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, TypeScript) |
| LLM | OpenAI gpt-4o-mini |
| Session Store | Upstash Redis |
| Payment | Stripe ($3/mo subscription) |
| Auth | JWT (jose) |
| Rate Limiting | @upstash/ratelimit |
| Hosting | Vercel (free tier) |

## Setup

```bash
# 1. Clone and install
git clone https://github.com/caraxesthebloodwyrm02/afloat.git
cd afloat
npm install

# 2. Configure environment
cp .env.example .env.local
# Fill in all values in .env.local

# 3. Run locally
npm run dev
```

### Required Environment Variables

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | OpenAI API key for gpt-4o-mini |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis connection URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth token |
| `JWT_SECRET` | Secret for signing JWTs |
| `STRIPE_SECRET_KEY` | Stripe API secret key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PRICE_ID` | Stripe price ID for the $3/mo plan |
| `NEXT_PUBLIC_APP_URL` | App URL (e.g. `https://your-app.vercel.app`) |

## API Routes

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| `GET` | `/api/v1/health` | Health check | No |
| `POST` | `/api/v1/session/start` | Start session | JWT |
| `POST` | `/api/v1/session/{id}/message` | Send message | JWT |
| `POST` | `/api/v1/session/{id}/end` | End session | JWT |
| `POST` | `/api/v1/subscribe` | Create Stripe checkout | No |
| `POST` | `/api/v1/subscribe/verify` | Verify checkout + issue JWT | No |
| `POST` | `/api/v1/user/consent` | Update consent preferences | JWT |
| `GET` | `/api/v1/user/data-export` | Export user data | JWT |
| `DELETE` | `/api/v1/user/data` | Request data deletion | JWT |
| `PATCH` | `/api/v1/user/profile` | Update display name / email pref | JWT |
| `GET` | `/api/v1/provenance/session/{id}` | Get session provenance chain | JWT |
| `GET` | `/api/v1/provenance/verify/{id}` | Verify session chain integrity | JWT |
| `POST` | `/api/v1/webhooks/stripe` | Stripe webhook receiver | Stripe sig |

## Project Structure

```
src/
├── app/                  # Next.js pages and API routes
│   ├── api/v1/           # 11 API route handlers
│   ├── chat/             # Chat UI (subscribers)
│   ├── consent/          # Post-signup consent form (CM-01)
│   ├── settings/         # Consent toggles + data rights (CM-02)
│   ├── subscribe/        # Subscribe flow + success page
│   └── privacy/          # Privacy policy
├── components/           # Chat window, input, timer, status
├── lib/                  # Server-side logic
│   ├── session-controller.ts  # Turn + timer enforcement
│   ├── llm.ts                 # OpenAI wrapper + gate parsing
│   ├── prompt.ts              # System prompt
│   ├── redis.ts               # Upstash Redis client
│   ├── auth.ts                # JWT create/verify
│   ├── auth-middleware.ts     # Route-level JWT validation
│   ├── rate-limit.ts          # Rate limiter
│   ├── data-layer.ts          # Session logs, user store
│   ├── audit.ts               # Immutable audit log
│   ├── consent.ts             # Consent management
│   └── stripe.ts              # Stripe client
└── types/                # TypeScript type definitions
```

## Contract Reference

The design spec lives in a separate contract repo (`e:\assistive-tool-contract`):
- `contract.json` v1.4.0 — source of truth
- `ARCHITECTURE.md` — 11-section system design
- `BUILD_GUIDE.md` — 9-step build sequence
- `BUILD_MAP.md` — file-level implementation blueprint

## KPI Baselines

| Metric | Target |
|--------|--------|
| Session success rate | >= 95% |
| Response latency | <= 3.0 seconds |
| Context gate pass rate | >= 70% |
| Avg session duration | <= 2.0 minutes |
| Net revenue (90 days) | >= $22.00 USD |
