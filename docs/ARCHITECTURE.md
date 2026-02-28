# Afloat — Architecture & Mechanics

**Contract reference:** `contract.json` v1.6.0 · Contract ID `7a55f0f1`
**Repository:** [github.com/caraxesthebloodwyrm02/afloat](https://github.com/caraxesthebloodwyrm02/afloat) (private)
**Purpose:** Baseline system design for Afloat, derived directly from the contract. This document reflects the deployed system as of Phase 1 launch (2026-03-01).

---

## 1. System Overview

Afloat is a **short-session cognitive assistant** — a web-based chat interface where a user asks a question, the system identifies what kind of "context gate" is blocking them, delivers a brief to unblock them, and ends the session. The entire interaction takes under 2 minutes (trial tier) or up to 30 minutes (continuous tier).

### What the tool does

A user comes in stuck. They can't decide, don't have enough context, or need a quick triage. The tool:

1. Listens to what they're stuck on
2. Figures out *what kind* of block it is (meeting triage? priority decision? need a summary?)
3. Gives them a short, honest brief — just enough to unblock
4. Lets them ask one follow-up, then the session ends

### What the tool does NOT do

- Complete tasks for the user
- Run multi-hour workflows
- Replace the user's judgment
- Handle anything requiring specialized credentials

---

## 2. The Five Layers

The system has five distinct layers. Each layer has one job.

```
┌─────────────────────────────────────────────────┐
│                   FRONTEND                       │
│          Minimal chat UI (web browser)           │
│   Sends user text → Receives assistant brief     │
├─────────────────────────────────────────────────┤
│              SESSION CONTROLLER                  │
│   Manages the 4-step flow, enforces limits       │
│   Trial: 2 calls·120s / Continuous: 6·1800s     │
├─────────────────────────────────────────────────┤
│                  LLM LAYER                       │
│   OpenAI gpt-4o-mini · Max 300 tokens/response   │
│   System prompt: gate detection + brief delivery │
├─────────────────────────────────────────────────┤
│                 DATA LAYER                       │
│   JSON session logs · Telemetry · Consent records│
│   No user text stored · Upgrade path → SQLite    │
├─────────────────────────────────────────────────┤
│               PAYMENT LAYER                      │
│   Stripe Checkout · Trial $9/qtr · Continuous    │
│   $3/hr metered · No card data on our servers    │
└─────────────────────────────────────────────────┘
```

### Layer responsibilities

| Layer | Job | Key constraint |
|---|---|---|
| **Frontend** | Render chat UI, send/receive messages, show session timer | Must work on free-tier Vercel deployment |
| **Session Controller** | Orchestrate the 4-step session flow, enforce turn + time limits, log telemetry | Server-side enforcement only (client cannot override) |
| **LLM Layer** | Detect context-gate type, generate proportional brief | ≤ 300 tokens per response, ≤ 3s latency target |
| **Data Layer** | Store session telemetry, consent records, subscription references | Never stores user text input. Stored in Upstash Redis (sessions, users, audit logs). |
| **Payment Layer** | Handle trial ($9/qtr) and continuous ($3/hr metered) subscriptions via Stripe Checkout | All PII stays on Stripe. We store `stripe_customer_id`, `subscription_tier`, and optionally `stripe_subscription_item_id`. |

---

## 3. Session Lifecycle (The 4-Step Flow)

Every session follows exactly four steps. This is the core mechanic of the tool.

### Step 1: User Input

The user types their question or describes what they're stuck on.

**What happens technically:**
- Frontend sends the user's text to the Session Controller via API
- Session Controller generates a `session_id` (UUID v4)
- Session Controller starts the **tier-aware timer** (120s trial / 1800s continuous, server-side)
- Session Controller records `start_time`
- Turn counter set to `1`

**Data flow:** `DF-01` — user text goes to session controller. User text is held **in memory only** for the duration of the API call. It is **never written to the data layer**.

### Step 2: Gate Detection

The LLM reads the user's input and classifies which type of context gate is blocking them.

**The four gate types:**

| Gate Type | Signal | Example |
|---|---|---|
| `meeting_triage` | User is deciding whether to attend/schedule something | "Should I go to this meeting? Here's the agenda..." |
| `priority_decision` | User has multiple options and can't pick | "I have these 5 tasks, which should I do first?" |
| `quick_briefing` | User needs a summary to engage with something | "What's the gist of this proposal so I can respond?" |
| `context_gate_resolution` | User is broadly stuck due to lack of understanding | "I don't understand what's happening in this project" |

**What happens technically:**
- Session Controller sends user text + system prompt to OpenAI API (`DF-02`)
- System prompt instructs the LLM to:
  1. Classify the gate type
  2. Generate the brief in the same response
- LLM returns a structured response containing `gate_type` and `brief`
- Session Controller records `gate_type` in telemetry
- Session Controller records `latency_per_turn[0]` (time from request to response)

**The LLM does steps 2 and 3 in a single API call** to minimize latency. The gate detection is embedded in the response, not a separate round-trip.

### Step 3: Brief Delivery

The brief is shown to the user.

**Brief rules:**
- Maximum **150 words** (enforced by system prompt instruction + max_tokens=300 as a hard backstop)
- Must be **proportional** — just enough to unblock, never more
- Must be **grounded** — no speculation, no filler
- Must be **honest** — if the tool doesn't have enough information, it says so
- Must **not replace the user's decision** — the brief enables the decision, the user makes it

**What happens technically:**
- Session Controller passes the LLM response to the Frontend
- Frontend renders the brief in the chat UI
- Turn counter is now `1` (LLM has responded once)

### Step 4: User Decision

The user either:
- **Proceeds** (leaves satisfied → session ends) — `user_proceeded = true`
- **Asks one follow-up** (turn 2 → LLM responds → turn counter = 2 → session ends)
- **Does nothing** (timer expires → session ends)

**Follow-up rules:**
- Maximum **1 follow-up** allowed
- After the follow-up response, the session ends regardless
- The follow-up uses the same session context (same system prompt + conversation history)
- If the user needs more help, they start a new session

**What happens technically:**
- If user sends a follow-up: Session Controller sends it to LLM (turn 2), records `latency_per_turn[1]`
- LLM responds (turn counter = 2, max reached) → Session Controller sends response + "session complete" signal
- Session Controller records: `end_time`, `turns`, `user_proceeded`, `session_completed = true`
- Telemetry written to data layer (`DF-03`)

### Session termination triggers

| Trigger | Result |
|---|---|
| User sends no follow-up (closes tab / clicks "done") | `session_completed = true`, `user_proceeded = true` |
| User sends 1 follow-up, gets response | `session_completed = true`, turn count = 2 |
| Turn limit reached (3 turns total including user messages) | `session_completed = true`, forced end |
| Timer expires (120s trial / 1800s continuous) | `session_completed = true`, timeout flag |
| Error (LLM failure, network issue) | `session_completed = false`, error logged |

---

## 4. The LLM Prompt Strategy

The system prompt is the single most important piece of logic in the tool. It controls gate detection, brief quality, and scope enforcement all at once.

### System Prompt Structure

The system prompt has four sections:

```
SECTION 1: IDENTITY
You are a cognitive decision-support assistant. You help users get past
context gates — moments where they're stuck because they lack a brief
summary or decision nudge.

SECTION 2: RULES
- Respond in 150 words or fewer
- Never complete the task for the user
- Never speculate or add filler
- If you don't have enough information, say so honestly
- Always identify which gate type applies before responding:
  meeting_triage | priority_decision | quick_briefing | context_gate_resolution

SECTION 3: RESPONSE FORMAT
Respond with:
[GATE: gate_type]
[BRIEF]
Your proportional response here.

SECTION 4: BEHAVIOR GUARDRAILS
- Do not offer to do more after the brief
- Do not ask open-ended follow-up questions
- Do not roleplay or adopt personas
- If the user's request is out of scope, say:
  "This is outside what I can help with in a quick session."
```

### Why this structure works

- **Section 1** grounds the LLM's identity so it doesn't drift into general assistant behavior
- **Section 2** enforces the contract's "no-fluff, grounded, transparent, honest" session style
- **Section 3** makes gate detection parseable by the session controller (it reads the `[GATE: ...]` line)
- **Section 4** prevents scope creep and ensures proportional assistance

### Parsing the LLM response

The Session Controller parses the `[GATE: ...]` tag from the first line of the LLM response to extract the `gate_type` for telemetry. The `[BRIEF]` tag and everything after it is what gets displayed to the user (with the tags stripped).

If the LLM response doesn't contain a valid `[GATE: ...]` tag, the Session Controller:
1. Logs `gate_type = "unclassified"`
2. Still delivers the response to the user (don't break the experience)
3. Flags the session for review in telemetry

---

## 5. Session Controller — Enforcement Rules

The Session Controller is the gatekeeper. It is the **only server-side component that talks to both the Frontend and the LLM**. Nothing bypasses it.

### Tier-aware limits

Session limits are configurable per subscription tier via `getTierLimits(tier)`:

| Tier | Max LLM Calls | Max Duration | Use Case |
|------|--------------|-------------|----------|
| `trial` | 2 | 120s (2 min) | Quick decision support |
| `continuous` | 6 | 1,800s (30 min) | Extended analysis sessions |

Unknown tiers fall back to trial limits. Existing sessions without a `tier` field default to `"trial"`.

### Turn counting (trial tier example)

```
Turn 1: User sends input    → Controller forwards to LLM → LLM responds (brief)
Turn 2: User sends follow-up → Controller forwards to LLM → LLM responds (final)
Turn 3: Hard stop. No more LLM calls. Session ends.
```

"Turns" in the contract means **total messages in the conversation** (user + assistant combined count toward the max_turns=3 limit on *LLM calls*, meaning the user gets at most 2 messages and the LLM gets at most 2 responses, but the initial user input + LLM response + optional follow-up exchange = max 3 LLM-touching interactions).

Practical implementation:
- `llm_call_count` starts at 0
- Each time the Session Controller sends a request to the LLM, increment `llm_call_count`
- If `llm_call_count >= 2`, reject further user input with a "session complete" response
- This maps to: initial brief (1 call) + optional follow-up (1 call) = max 2 LLM calls

### Timer enforcement

```
session_start = now()
max_duration = getTierLimits(session.tier).maxDurationMs  // 120_000 trial / 1_800_000 continuous
deadline = session_start + max_duration

On every user message:
  if now() > deadline:
    return "Session time limit reached."
    end session
```

The timer is **server-side only**. The frontend displays a countdown for UX, but the server is the authority. If the client sends a message after the deadline, the server rejects it.

### Error handling

| Error | Action |
|---|---|
| LLM API returns 5xx | Retry once after 1 second. If still failing, return "I couldn't process that. Please try again." and log `session_completed = false`. |
| LLM API returns 429 (rate limit) | Return "The service is busy. Please try again in a moment." and log `session_completed = false`. |
| LLM response takes > 10 seconds | Timeout the request. Return "That took too long. Please try again." and log latency as 10s. |
| LLM response is empty or malformed | Deliver a fallback: "I wasn't able to generate a useful response. Please try rephrasing." |
| User sends empty message | Reject with "Please describe what you're stuck on." (does not count as a turn). |

---

## 6. Data Layer — What Gets Stored (and What Doesn't)

### What IS stored (per session)

Written to data layer as a JSON log entry after session ends:

```json
{
  "session_id": "uuid-v4",
  "user_id": "uuid-v4",
  "tier": "trial",
  "start_time": "2026-03-15T14:30:00Z",
  "end_time": "2026-03-15T14:31:22Z",
  "turns": 2,
  "gate_type": "priority_decision",
  "user_proceeded": true,
  "session_completed": true,
  "latency_per_turn": [1.23, 1.45],
  "error": null
}
```

### What is NOT stored

- **User text input** — never written to disk. Held in server memory only during the API call, then discarded. (`DF-01` retention: transient)
- **LLM responses** — not stored. Delivered to the user and discarded.
- **Raw LLM API payloads** — transient. Not logged.
- **User IP addresses** — only stored as SHA-256 hash in audit logs, never raw.
- **Payment card data** — never touches our servers. Handled entirely by Stripe. (`DF-04`)

### What IS stored (per user account)

```json
{
  "user_id": "uuid-v4",
  "stripe_customer_id": "cus_abc123",
  "subscription_status": "active",
  "subscription_tier": "trial",
  "billing_cycle_anchor": "2026-03-01T00:00:00Z",
  "consents": {
    "essential_processing": { "granted": true, "timestamp": "...", "policy_version": "v1.0" },
    "session_telemetry": { "granted": true, "timestamp": "...", "policy_version": "v1.0" },
    "marketing_communications": { "granted": false, "timestamp": "...", "policy_version": "v1.0" }
  }
}
```

### Redis key schema (Upstash)

| Key pattern | Content | TTL |
|---|---|---|
| `user:{user_id}` | UserRecord JSON | Account lifetime |
| `stripe_map:{customer_id}` | `user_id` string | Account lifetime |
| `session:{session_id}` | SessionState JSON | ~150s (trial) / ~1830s (continuous) |
| `sessions:{YYYY-MM-DD}` | List of SessionLog JSON strings | 90 days |
| `audit:{YYYY-MM-DD}` | List of audit log JSON strings | 365 days |
| `stripe_event:{event_id}` | Idempotency marker (`"1"`) | 24 hours |
| `rl:{identifier}` | Rate limit counter | Sliding window |

---

## 7. Instrumentation — Where to Place the Measurement Hooks

Four KPI metrics must be measured. Here's exactly where each hook goes in the code:

### 7a. Session Success Rate (target: ≥ 95%)

**What to measure:** Did the session complete without errors?

**Hook location:** End of session handler, right before writing the session log.

```
At session end:
  if no errors occurred during session:
    session_completed = true
  else:
    session_completed = false

  write to session log
```

**Reporting:** Daily. Count `session_completed = true` / total sessions.

### 7b. Response Latency (target: ≤ 3.0 seconds avg)

**What to measure:** Time from sending request to LLM to receiving response.

**Hook location:** Wrap the LLM API call with timestamps.

```
For each LLM call:
  request_sent = now()
  response = await call_openai(...)
  response_received = now()
  latency = response_received - request_sent

  append latency to session.latency_per_turn[]
```

**Reporting:** Rolling 7-day average of all `latency_per_turn` values across all sessions.

### 7c. Context Gate Pass Rate (target: ≥ 70%)

**What to measure:** Did the user proceed after receiving the brief?

**Hook location:** Session termination handler. Determine based on how the session ended.

```
At session end:
  if user clicked "done" or sent a follow-up or closed tab after brief:
    user_proceeded = true
  if timer expired before brief was delivered:
    user_proceeded = false
  if error occurred before brief delivery:
    user_proceeded = false
```

The key distinction: if the user *saw the brief and then left*, that counts as proceeding. The brief unblocked them. If the session broke *before* the brief was delivered, that's a failure.

**Reporting:** Daily. Count `user_proceeded = true` / total sessions.

### 7d. Average Session Duration (target: ≤ 2.0 minutes)

**What to measure:** How long was the session from start to end?

**Hook location:** Already captured by `start_time` and `end_time` in the session log.

```
duration_minutes = (end_time - start_time) / 60
```

**Reporting:** Rolling 7-day average of `duration_minutes` across all sessions.

---

## 8. Payment Flow

### Subscription lifecycle

```
1. User visits the tool landing page (unauthenticated, can see what the tool does)
2. User selects a tier: Trial ($9/quarter) or Continuous ($3/hour metered)
3. Redirect to Stripe Checkout (hosted by Stripe, not us)
4. User enters email + payment method on Stripe's page
5. Stripe processes payment, creates customer + subscription
6. Stripe redirects back to our app with session_id
7. Our server calls Stripe API to verify the session
8. We store: stripe_customer_id, subscription_status, billing_cycle_anchor
9. User is now authenticated and can start sessions
```

### Access control

```
On every session request:
  1. Check user's subscription_status
  2. If "active" → allow session
  3. If "past_due" → show "Please update your payment method" (link to Stripe portal)
  4. If "canceled" → show "Your subscription has ended. Resubscribe to continue."
  5. If no account → redirect to subscribe page
```

### Stripe webhook events to handle

| Event | Action |
|---|---|
| `checkout.session.completed` | Create user account, store Stripe references |
| `invoice.paid` | Update subscription_status to "active" |
| `invoice.payment_failed` | Update subscription_status to "past_due" |
| `customer.subscription.deleted` | Update subscription_status to "canceled" |

---

## 9. Frontend — Minimal Chat UI

The frontend is intentionally simple. It's a single-page chat interface.

### Screen layout

```
┌──────────────────────────────────────┐
│  Afloat                ⏱ 1:42 / 2:00 │  ← Header with countdown timer
├──────────────────────────────────────┤
│                                      │
│  ┌────────────────────────────────┐  │
│  │ User: I have 4 tasks and can't │  │
│  │ decide which to tackle first.  │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Assistant: [brief displayed    │  │
│  │ here, max ~150 words]          │  │
│  └────────────────────────────────┘  │
│                                      │
├──────────────────────────────────────┤
│  [Type a follow-up or click Done]    │  ← Input bar
│  [         Send        ] [ Done ✓ ]  │  ← Two buttons
└──────────────────────────────────────┘
```

### Key UI behaviors

- **Timer** is displayed but **decorative** — the server enforces the real deadline
- **Input bar disables** after the follow-up response (session complete)
- **"Done" button** sends a `session_end` signal to the server and shows a brief "Session complete" message
- After session ends, show: **"Start a new session"** button
- **No chat history** is shown between sessions (each session is independent)

### States the UI must handle

| State | Display |
|---|---|
| `waiting_for_input` | Input bar active, timer running |
| `waiting_for_response` | Input disabled, loading indicator, timer running |
| `brief_delivered` | Brief shown, input active for optional follow-up, "Done" button visible |
| `follow_up_delivered` | Follow-up response shown, input disabled, "Session complete" message |
| `session_timed_out` | "Session time limit reached" message, input disabled |
| `error` | Error message shown, "Try again" button |
| `not_subscribed` | Subscribe CTA shown instead of chat |

---

## 10. API Route Map

All routes are server-side. The frontend calls these.

| Method | Path | Purpose | Auth required |
|---|---|---|---|
| `POST` | `/api/v1/session/start` | Start a new session, get session_id | Yes (subscriber) |
| `POST` | `/api/v1/session/{id}/message` | Send user message, get LLM response | Yes (subscriber) |
| `POST` | `/api/v1/session/{id}/end` | End session, trigger telemetry write | Yes (subscriber) |
| `GET` | `/api/v1/user/data-export` | Data rights: export user data | Yes |
| `DELETE` | `/api/v1/user/data` | Data rights: delete user data | Yes |
| `GET` | `/api/v1/user/data-export?format=portable` | Data rights: portable export | Yes |
| `PATCH` | `/api/v1/user/profile` | Data rights: rectify user data | Yes |
| `POST` | `/api/v1/webhooks/stripe` | Stripe webhook receiver | Stripe signature |
| `GET` | `/api/v1/health` | Health check (uptime monitoring) | No |

---

## 11. Safety Gradient Layer

The safety gradient provides tier-proportional safety checks, inspired by Grid's BoundaryContract and aligned with Anthropic RSP 3.0 fail-closed defaults.

### How it works

- **Trial tier:** Passes through with no additional checks (low capability = low risk)
- **Continuous tier:** Checks for rapid-fire abuse patterns — if average interval between messages is under 5 seconds, the request is blocked with 429
- **Fail-closed default:** If the safety evaluation function throws an exception, access is denied. This ensures that safety failures always err on the side of caution.

### Integration point

The safety gradient runs in the message route (`/api/v1/session/[id]/message`) after session limit enforcement passes but before the LLM call. A blocked request returns `429` with a reason string.

---

## 12. Security Boundaries

### What runs where

| Component | Runs on | Trust level |
|---|---|---|
| Frontend (chat UI) | User's browser | Untrusted — all input validated server-side |
| Session Controller + API routes | Vercel serverless functions | Trusted — server-side only |
| LLM calls | OpenAI API (external) | Third-party — DPA required |
| Payment | Stripe (external) | Third-party — PCI-DSS compliant, DPA required |
| Data storage | Upstash Redis (cloud, US-Central) | Trusted — TLS enforced, encrypted at rest |

### Key security rules

1. **Never trust the client.** Turn limits, session timers, and access control are server-side only.
2. **Never store user text.** It's processed in memory and discarded.
3. **Never store raw IPs.** Hash with SHA-256 for audit logs.
4. **Never store card data.** Stripe handles all payment PII.
5. **API keys in environment variables only.** Never in source code, never in client bundles.
6. **Rate limit all endpoints.** 10 requests/hour for data rights; reasonable limits for session endpoints.
7. **Validate Stripe webhook signatures.** Reject unsigned webhook calls.
