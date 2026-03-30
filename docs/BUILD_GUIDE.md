# Afloat — Build Guide (Plain English)

**Contract reference:** `contract.json` v1.4.0 · Architecture reference: `ARCHITECTURE.md`
**Repository:** [github.com/caraxesthebloodwyrm02/afloat](https://github.com/caraxesthebloodwyrm02/afloat) (private)
**Audience:** The person (or team) building Afloat during Phase 2 (Days 31–60).

This guide tells you **what to build, in what order, and how to know it's working** — in plain language.

---

## How to Read This Guide

Each section is one **buildable unit**. They're ordered so that each one builds on the last. Don't skip ahead — later sections depend on earlier ones being done.

Each section has:
- **What you're building** — the plain description
- **Inputs** — what you need before starting
- **Outputs** — what exists when you're done
- **How to test it** — how you know it works
- **Watch out for** — common pitfalls

---

## Step 1: Set Up the Project Skeleton

### What you're building

An empty web project that deploys to Vercel's free tier. Nothing functional yet — just a page that loads and an API route that responds.

### Inputs
- A Vercel account (free)
- A GitHub repo (this one, or a new one for the app code)
- Node.js installed locally

### What to do

1. Create a new web project. Use Next.js (App Router) — it gives you both the frontend and API routes in one project, and deploys to Vercel with zero config.
2. Create one page: `/` — just show the tool name (or "Coming Soon") and a basic layout.
3. Create one API route: `GET /api/v1/health` — return `{ "status": "ok", "timestamp": "..." }`.
4. Deploy to Vercel. Confirm the page loads and the health endpoint responds.

### Outputs
- A live URL on Vercel (e.g., `your-app.vercel.app`)
- A `/api/v1/health` endpoint returning 200

### How to test it
- Open the URL in a browser. You see the page.
- Hit `/api/v1/health` in the browser. You see `{"status":"ok"}`.

### Watch out for
- Don't install a bunch of libraries yet. Keep it minimal.
- Make sure environment variables work on Vercel (test with a dummy `TEST_VAR`).

---

## Step 2: Build the Session Controller (Server-Side)

### What you're building

The heart of the tool: a server-side component that manages sessions. It creates sessions, counts turns, enforces the timer, and decides when a session is over.

### Inputs
- Working project from Step 1

### What to do

1. Create a session store — for now, an in-memory JavaScript `Map` keyed by `session_id`. Each entry holds:
   ```
   {
     session_id: "uuid",
     start_time: timestamp,
     turns: 0,
     max_turns: 2,          // max LLM calls (initial brief + 1 follow-up)
     max_duration_ms: 120000, // 120 seconds
     gate_type: null,
     latency_per_turn: [],
     session_completed: null,
     user_proceeded: null,
     error: null
   }
   ```

2. Create three API routes:
   - `POST /api/v1/session/start` — generates a session_id, stores it, returns it
   - `POST /api/v1/session/{id}/message` — accepts user text, checks turn limit + timer, returns a placeholder response (we'll connect the LLM in Step 3)
   - `POST /api/v1/session/{id}/end` — marks session complete, writes telemetry

3. Implement the enforcement rules:
   - **Turn check:** Before calling the LLM, check if `turns >= max_turns`. If so, reject with `{ "error": "session_complete", "message": "Session limit reached." }`.
   - **Timer check:** Before calling the LLM, check if `now() - start_time > max_duration_ms`. If so, reject with `{ "error": "session_timeout", "message": "Session time limit reached." }`.
   - **Empty input check:** If user message is empty or whitespace, reject without incrementing turn count.

4. For now, the `/message` endpoint should return a **hardcoded placeholder** response instead of calling the LLM:
   ```json
   {
     "gate_type": "placeholder",
     "brief": "This is a placeholder response. LLM not connected yet.",
     "session_status": "active",
     "turns_remaining": 1
   }
   ```

### Outputs
- Three working API routes
- Session state managed in memory
- Turn limit and timer enforced server-side

### How to test it

Run these tests manually (or write them as automated tests — even better):

| Test | Expected result |
|---|---|
| Start a session | Get back a session_id |
| Send a message | Get back placeholder response, turns_remaining = 1 |
| Send a second message | Get back placeholder response, turns_remaining = 0 |
| Send a third message | Get rejected: "Session limit reached." |
| Start a session, wait 121 seconds, send a message | Get rejected: "Session time limit reached." |
| Send an empty message | Get rejected, turn count unchanged |
| End a session | Session marked complete |

### Watch out for
- The session store is in-memory, which means it resets on every deploy. That's fine for now. Persistence comes later.
- Make sure the timer uses **server time**, not anything from the client.
- Vercel serverless functions are stateless — the in-memory Map won't survive across function invocations in production. For Phase 2 testing, this is acceptable. For production, you'll need a lightweight external store (e.g., Vercel KV, Upstash Redis, or a simple JSON file). Plan for this but don't build it yet.

---

## Step 3: Connect the LLM

### What you're building

Replace the placeholder response with the current Ollama-first router. The routing layer detects the gate type, picks a local model, and only uses OpenAI in rare lifeguard cases.

### Inputs
- Working session controller from Step 2
- An Ollama endpoint (`OLLAMA_BASE_URL`)
- An optional OpenAI API key for rare escalation (`OPENAI_API_KEY`)

### What to do

2. Create a function `callLLM(userMessage, conversationHistory)` that:
   - Builds the messages array: `[system_prompt, ...conversationHistory, { role: "user", content: userMessage }]`
   - Derives a routing plan from task type, complexity, and scope
   - Discovers and ranks Ollama candidates first
   - Uses a compact output budget for default paths and a larger budget for `deep_read`
   - Escalates to OpenAI only when explicitly forced or in rare rescue cases
   - Returns the response text

3. Write the system prompt. Here's the exact one to start with (refine after testing):

   ```
   You are a cognitive decision-support assistant. You help users get past context gates — moments where they're stuck because they lack a brief summary or decision nudge.

   RULES:
   - Respond in 150 words or fewer.
   - Never complete the task for the user.
   - Never speculate. Never add filler.
   - If you don't have enough information, say so honestly.
   - Identify which gate type applies:
     meeting_triage | priority_decision | quick_briefing | context_gate_resolution

   RESPONSE FORMAT:
   [GATE: gate_type_here]
   Your proportional brief here. Just enough to unblock the user.

   BEHAVIOR:
   - Do not offer to do more after the brief.
   - Do not ask open-ended follow-up questions.
   - Do not roleplay or adopt personas.
   - If the request is out of scope, respond:
     "[GATE: out_of_scope] This is outside what I can help with in a quick session."
   ```

4. Update the `/message` endpoint to:
   - Record `request_sent` timestamp before calling `callLLM()`
   - Call `callLLM()` with the user's message
   - Record `response_received` timestamp after
   - Calculate `latency = response_received - request_sent` and store in `latency_per_turn[]`
   - Parse the `[GATE: ...]` tag from the first line of the response
   - Store the `gate_type` in the session
   - Return the brief (with tags stripped) to the frontend

5. Handle the parsing: if the response doesn't start with `[GATE: ...]`, set `gate_type = "unclassified"` and return the full response anyway.

6. Handle errors:
   - LLM returns 5xx → retry once after 1 second
   - LLM returns 429 → return "Service is busy" message
   - LLM takes > 10 seconds → timeout, return error message
   - LLM returns empty → return fallback message

### Outputs
- The `/message` endpoint now returns real LLM-generated briefs
- Gate types are detected and logged
- Latency is measured per turn

### How to test it

| Test | Expected result |
|---|---|
| "Should I attend this meeting? The agenda is about Q3 planning." | Response contains `[GATE: meeting_triage]` and a brief < 150 words |
| "I have 5 things to do, what should I tackle first?" | Response contains `[GATE: priority_decision]` |
| "What's the gist of the new company policy?" | Response contains `[GATE: quick_briefing]` |
| "I'm stuck, I don't understand what's going on with this project" | Response contains `[GATE: context_gate_resolution]` |
| "Write me a 2000-word essay on climate change" | Response contains `[GATE: out_of_scope]` |
| Send same message twice in one session (follow-up) | Second response uses conversation context |
| Measure response time | Should be under 3 seconds |

### Watch out for
- **Never log the user's text input to disk.** Keep it in memory only.
- **Never log the LLM's response to disk.** Only log the gate_type and latency.
- Set `temperature: 0.3`, not the default `1.0`. You want consistent, grounded responses.
- The `max_tokens: 300` is a hard backstop. The system prompt's "150 words or fewer" instruction does the real limiting. 300 tokens ≈ 225 words, so even if the LLM slightly overshoots the word limit, the token limit catches it.
- Your OpenAI API key must be in an **environment variable**, never in source code.

---

## Step 4: Build the Data Layer

### What you're building

A simple file-based storage system that writes session telemetry, user accounts, and audit logs to JSON files.

### Inputs
- Working session controller + LLM from Steps 2–3

### What to do

1. Create a `data/` directory with three subdirectories: `sessions/`, `users/`, `audit/`

2. **Session logger:** At session end, append the session log entry to the day's session file (`data/sessions/YYYY-MM-DD.json`). The entry contains only the fields listed in the architecture — no user text.

3. **User store:** When a user subscribes (Step 6), create `data/users/{user_id}.json` with their subscription reference and consent records.

4. **Audit logger:** Every data operation (session write, user create, data export, etc.) gets an entry appended to `data/audit/YYYY-MM-DD.audit.json`. Use the schema from the contract: log_id, timestamp, actor, action, resource_type, resource_id, outcome, ip_hash.

5. For the IP hash: take the client's IP address, hash it with SHA-256, and store only the hash. Never store the raw IP.

6. **Respect consent:** Before writing session telemetry, check the user's `session_telemetry` consent. If `granted: false`, skip the telemetry write (but still track session_completed for the success rate — that's covered under `essential_processing`).

### Outputs
- Session telemetry written to daily JSON files after each session
- Audit log entries for every data operation
- User files created on subscription

### How to test it

| Test | Expected result |
|---|---|
| Complete a session | Check `data/sessions/` — a new entry appears with correct fields |
| Verify no user text in session file | The session log contains session_id, times, turns, gate_type, latency — no message content |
| Check audit log | Every session write has a corresponding audit entry |
| Opt out of telemetry, complete a session | No session telemetry written (but session still works) |

### Watch out for
- **File locking:** If two sessions end at the same time, they might both try to write to the same day's file. Use an append strategy or a write queue.
- **Don't store user text.** Check this three times. Grep your code for any place where the user's message or the LLM's response might accidentally end up on disk.
- On Vercel serverless, you can't write to the local filesystem in production. You'll need an alternative: Vercel KV, an external JSON store, or a lightweight database. For local development and testing, the file approach works.

---

## Step 5: Build the Frontend

### What you're building

A minimal chat page. One text input, one send button, one "Done" button, a timer display, and a message area.

### Inputs
- Working API routes from Steps 2–4

### What to do

1. **Layout:** A single page at `/` (or `/chat` for subscribers). Header with tool name + timer. Chat area in the middle. Input bar at the bottom.

2. **Flow:**
   - Page loads → call `POST /api/v1/session/start` → get `session_id`
   - User types and clicks Send → call `POST /api/v1/session/{id}/message` with user text → display response
   - User can type one follow-up → same endpoint → display response → input disables
   - User clicks "Done" → call `POST /api/v1/session/{id}/end` → show "Session complete"
   - Show a "Start new session" button after completion

3. **Timer:** Start a countdown from 2:00 when the session starts. This is **cosmetic** — the server enforces the real timer. If the server returns a timeout error, the frontend shows the timeout message regardless of what the local timer says.

4. **States:** The UI needs to handle these states (disable/enable input, show/hide buttons accordingly):
   - `waiting_for_input` — input active, timer ticking
   - `waiting_for_response` — input disabled, loading spinner
   - `brief_delivered` — input active (for follow-up), "Done" button visible
   - `session_complete` — input disabled, "Start new session" button
   - `error` — error message, "Try again" button

5. **Styling:** Keep it clean and minimal. Use system fonts. Light background, readable text. Mobile-friendly. No animations, no fancy effects. The tool is about **getting out of the way** and letting the user focus on their decision.

### Outputs
- A working chat UI that communicates with the Session Controller
- Timer display
- Proper state management (input enables/disables at the right times)

### How to test it

| Test | Expected result |
|---|---|
| Load the page | Session starts, timer counting down |
| Type a question and send | Brief appears in < 3 seconds |
| Send a follow-up | Response appears, input disables |
| Click "Done" after first brief | Session ends cleanly |
| Wait 2+ minutes without interacting | Timeout message appears |
| Send something while loading | Send button is disabled during loading |
| Refresh the page | New session starts (old one is gone) |

### Watch out for
- **Don't store messages in localStorage or cookies.** Each session is ephemeral.
- **Don't send the session_id in the URL** where it could end up in browser history or analytics. Send it in request headers or body.
- The loading state is important — without it, users will double-send messages.

---

## Step 6: Integrate Stripe Payment

### What you're building

A subscription flow where users pay $3/month to access the tool. Stripe handles all the money and PII.

### Inputs
- A Stripe account (free to create, test mode available)
- Working app from Steps 1–5

### What to do

1. **Create a Stripe product + price:**
   - Product: Afloat
   - Price: $3.00 USD, recurring monthly

2. **Build the subscribe flow:**
   - Landing page shows what the tool does + a "Subscribe — $3/month" button
   - Button click → call your API route → your server creates a Stripe Checkout Session → redirect user to Stripe's hosted checkout page
   - After payment, Stripe redirects back to your app's success URL
   - Your server verifies the checkout session, creates the user account, stores `stripe_customer_id`

3. **Build the webhook endpoint:**
   - `POST /api/v1/webhooks/stripe` — receives events from Stripe
   - Verify the webhook signature (Stripe provides a signing secret)
   - Handle these events:
     - `checkout.session.completed` → create user account
     - `invoice.paid` → set subscription_status = "active"
     - `invoice.payment_failed` → set subscription_status = "past_due"
     - `customer.subscription.deleted` → set subscription_status = "canceled"

4. **Add access control to session endpoints:**
   - Before starting a session, check that the user has an active subscription
   - If not active → return 403 with a message pointing them to subscribe

5. **Test in Stripe's test mode first.** Stripe provides test card numbers (e.g., `4242 4242 4242 4242`). Never use real card data during development.

### Outputs
- Users can subscribe via Stripe Checkout
- Subscription status is tracked
- Session endpoints are gated behind active subscription
- Webhook handles lifecycle events

### How to test it

| Test | Expected result |
|---|---|
| Click subscribe, use test card | Redirected to Stripe, payment succeeds, redirected back, session access granted |
| Try to start a session without subscribing | 403 error, message to subscribe |
| Simulate `invoice.payment_failed` webhook | User status changes to "past_due" |
| Simulate `customer.subscription.deleted` webhook | User status changes to "canceled", session access revoked |

### Watch out for
- **Webhook signature verification is not optional.** Without it, anyone could fake webhook events.
- **Use Stripe's test mode** for all development. Switch to live mode only at launch.
- **Don't store any payment data** on your server. Stripe handles it all.
- The Stripe Checkout Session has a `success_url` and `cancel_url`. Make sure both lead somewhere sensible.

---

## Step 7: Implement Consent & Data Rights

### What you're building

The consent forms (opt-in at signup, settings page for opt-out) and the data rights API endpoints (export, delete, portability, rectification).

### Inputs
- Working user accounts from Step 6
- Data layer from Step 4

### What to do

1. **Consent at signup (CM-01):**
   - After Stripe checkout success, before activating the account, show a consent form
   - Three checkboxes (unchecked by default):
     - Essential processing (required — can't be unchecked)
     - Session telemetry (optional)
     - Marketing communications (optional)
   - Store consent decisions with timestamp and privacy policy version

2. **Settings page (CM-02):**
   - A page at `/settings` where users can toggle telemetry and marketing consents
   - Changes take effect immediately
   - Every change is logged in the audit log

3. **Data rights endpoints** (refer to `contract.json` → `api_compliance.data_rights_api`):
   - `GET /api/v1/user/data-export` — collect all user data (session logs, consent records, subscription reference), return as JSON
   - `DELETE /api/v1/user/data` — start deletion process (7-day grace period), then permanently delete everything
   - `GET /api/v1/user/data-export?format=portable` — same as export but bundled as JSON + CSV in a ZIP
   - `PATCH /api/v1/user/profile` — allow editing display_name and email_preference only

4. **Deletion grace period:**
   - When user requests deletion, mark account as `pending_deletion` with a `deletion_date` 7 days out
   - If user logs in during grace period, offer to cancel the deletion
   - After 7 days, the auto-deletion job removes everything

### Outputs
- Consent collected at signup, modifiable in settings
- All four data rights endpoints working
- Audit log captures all consent changes and data operations

### How to test it
- These map to test cases TC-01 through TC-08 in the contract. Run all of them.

### Watch out for
- The export endpoint must return **only the requesting user's data** — never another user's.
- Deletion must cascade to session logs, consent records, and subscription references. Request Stripe customer deletion via their API too.
- Log every data rights action in the audit log.

---

## Step 8: Agent-Based Reliability Testing

### What you're building

Automated test scripts that simulate real users to verify the tool meets its KPI baselines.

### Inputs
- Fully working tool from Steps 1–7

### What to do

1. Write a test script that:
   - Creates a session via API
   - Sends a realistic user message (use a set of 20–30 test prompts covering all 4 gate types)
   - Checks that the response contains a valid `[GATE: ...]` tag
   - Checks that the response is under 150 words
   - Checks that the response time is under 3 seconds
   - Sends a follow-up
   - Ends the session
   - Repeats 100 times

2. After the 100-session run, calculate:
   - **Session success rate:** should be ≥ 95%
   - **Avg response latency:** should be ≤ 3.0 seconds
   - **Context gate pass rate:** for automated tests, count every completed session as "proceeded" (since there's no real user deciding). This metric is better measured during soft launch with real users.
   - **Avg session duration:** should be ≤ 2.0 minutes

3. Write a second test script for **edge cases:**
   - Empty messages
   - Very long messages (1000+ characters)
   - Messages in non-English languages
   - Messages with special characters, emoji, code snippets
   - Rapid-fire messages (send 3 messages without waiting)
   - Messages sent after session timeout

4. Write a third test script for **security:**
   - Try to access session endpoints without auth → expect 401/403
   - Try to access another user's session → expect 403
   - Try to send more turns than allowed → expect rejection
   - Try to call data export for another user → expect only your data
   - Verify no user text appears in any data files

### Outputs
- Automated test suite covering happy path, edge cases, and security
- KPI baseline report from 100-session run
- Any failures documented and triaged

### How to test it
- Run the test suite. It's self-testing.
- The KPI report should show all metrics meeting or exceeding their thresholds.

### Watch out for
- Don't hardcode the OpenAI API key in test scripts. Use environment variables.
- The 100-session run will cost real money (API calls). Estimate: ~$0.10–0.30 in API costs. Budget this under the $6.00 LLM cost estimate.
- If latency tests fail, check if it's the LLM or your server code. Log both separately.

---

## Step 9: Soft Launch Prep

### What you're building

The final preparations before letting real users in.

### What to do

1. **Deploy everything to Vercel production** (not just preview).
2. **Switch Stripe to live mode.** Update the API keys in environment variables.
3. **Verify all environment variables** are set in Vercel's production environment.
4. **Run the full test suite** against the production URL.
5. **Create a simple landing page** that explains what the tool does, shows the price, and has a subscribe button.
6. **Publish the privacy policy.** Link it in the footer of every page.
7. **Test the full flow end-to-end** as a real user: subscribe, consent, chat, follow-up, session end.
8. **Check the ledger:** Record the first real cost entry in `contract.json` (Stripe test charges don't count, but your Vercel deployment and OpenAI API usage during testing does).

### The soft launch checklist

- [ ] Production deployment live and accessible
- [ ] Health endpoint responding
- [ ] Stripe live mode working
- [ ] Full user flow works (subscribe → consent → chat → end)
- [ ] Privacy policy published and linked
- [ ] Session telemetry being recorded
- [ ] Audit logs being written
- [ ] No user text stored anywhere
- [ ] All KPI baselines met in automated tests
- [ ] First real cost entry recorded in contract ledger

---

## Summary: Build Order at a Glance

| Step | What | Depends on | Estimated effort |
|---|---|---|---|
| 1 | Project skeleton + deploy | Nothing | 1–2 hours |
| 2 | Session controller | Step 1 | 3–4 hours |
| 3 | Connect LLM | Step 2 | 2–3 hours |
| 4 | Data layer | Step 2 | 2–3 hours |
| 5 | Frontend chat UI | Steps 2–3 | 3–4 hours |
| 6 | Stripe payment | Steps 1, 4 | 3–4 hours |
| 7 | Consent + data rights | Steps 4, 6 | 3–4 hours |
| 8 | Reliability testing | Steps 1–7 | 2–3 hours |
| 9 | Soft launch prep | Steps 1–8 | 1–2 hours |
| **Total** | | | **~20–27 hours** |

This fits within the 30-day Phase 2 window even at a few hours per day.

---

## One Last Thing

Every decision in this guide traces back to `contract.json`. If something here conflicts with the contract, **the contract wins**. If you need to deviate from this guide during the build, update the contract (new version + changelog entry) before or immediately after the change.

The whole point of this tool is *transparency*. That starts with how we build it.
