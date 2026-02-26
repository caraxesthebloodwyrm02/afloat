# Afloat Product Development Roadmap

**Anchored to:** `baseline.txt` v1.0.0 (Level 1 Technical Baseline)
**Quality rule:** No milestone ships unless the validation gate passes (107/107 tests, 0 lint errors, clean build). If work drifts from a baseline-defined behavior, stop and reconcile before continuing.
**Methodology:** Each milestone adds probes before code. Tests define the contract; implementation satisfies it.

---

## How to read this roadmap

- **Milestones** are sequential. Each one depends on the previous passing its quality gate.
- **Quality Gate** at the end of every milestone is mandatory. It is the only exit condition.
- **Pause Triggers** are explicit. If any trigger fires, all work stops until resolved.
- **Baseline References** (REQ-*) tie back to `baseline.txt` §6.0 Incident Anchor Matrix.

---

## Pause Triggers (apply globally)

Work stops immediately if any of these occur. Resume only after the root cause is addressed.

| # | Trigger | Resolution |
|---|---------|------------|
| P1 | Any existing test fails after a change | Revert or fix before continuing |
| P2 | New code contradicts a baseline §1–§4 property | Reconcile with baseline, update baseline version if intentional |
| P3 | Lint errors introduced | Fix before commit |
| P4 | Build breaks | Fix before any other work |
| P5 | Ephemeral stream property violated (history persisted to store) | Immediate revert — REQ-A5 is non-negotiable |
| P6 | Auth bypass discovered (any route accessible without valid JWT) | Immediate fix — REQ-B1 is non-negotiable |
| P7 | Scope creep — feature work starts without test probes written first | Stop. Write probes. Then resume. |

---

## Milestone 1 — Technical Baseline (COMPLETE)

*Established the foundation. All work below builds on this.*

**What shipped:**
- Follow-up context via client-echoed history (REQ-A1–A5)
- Provenance authorization after session deletion (REQ-B1–B6)
- Portable export contract (REQ-C1–C5)
- 16 baseline probes + 20 existing API/unit tests = 107/107

**Quality Gate:** PASSED
- 107/107 tests | 0 lint errors | clean build
- `baseline.txt` v1.0.0 ratified

---

## Milestone 2 — Response Quality Foundation

*The system prompt defines what Afloat does. This milestone makes that definition testable and tightens it.*

**Goal:** Ensure every response the LLM produces is short, direct, gate-typed, and contains no filler. This is the product's core differentiator — responses that don't waste people's time.

**Baseline properties to preserve:** All of §1–§4. No changes to session lifecycle, auth, or export.

### 2.1 Tighten the system prompt

- **Current state:** `prompt.ts` defines 4 gate types, 150-word cap, no-filler rules.
- **Work:**
  - Audit each rule for enforceability (can the output be programmatically checked?).
  - Add explicit instruction for plain language — no jargon, no acronyms without expansion.
  - Add instruction to never pad responses with hedging phrases ("I think", "It seems like", "Perhaps").
  - Keep the prompt under 500 tokens to avoid eating into the context window.

### 2.2 Add response-shape validation to the message route

- **Work:**
  - After LLM returns a response, parse for the `[GATE: type]` tag.
  - If the tag is missing or the type is unrecognized, flag the response (log, don't block — this is observation phase).
  - Count response words. Log if over 150.
  - This is instrumentation, not enforcement. No user-facing behavior change.

### 2.3 Write probes (before any code)

| Probe | What it tests | Pass criteria |
|-------|--------------|---------------|
| REQ-D1 | Gate tag present in LLM response | Response contains `[GATE: ...]` |
| REQ-D2 | Gate type is one of the 4 defined types or `out_of_scope` | Enum validation |
| REQ-D3 | Response word count ≤ 150 | `split(/\s+/).length <= 150` |
| REQ-D4 | No open-ended follow-up question in response | Does not end with `?` after the brief |
| REQ-D5 | Prompt token count stays under 500 | Tokenizer check on SYSTEM_PROMPT |

### Quality Gate
- 107 existing + new D-series probes all pass
- 0 lint errors, clean build
- No baseline §1–§4 properties changed

---

## Milestone 3 — Session Depth (Controlled Expansion)

*Currently sessions are 2 turns / 2 minutes. This milestone explores whether more turns improve outcomes without degrading quality.*

**Goal:** Make session limits configurable per-tier without breaking the exhaustion handling contract (§4.0).

**Baseline properties to preserve:** §4.2 exhaustion handling (409 codes), §2.1 ephemeral stream, all auth.

### 3.1 Extract limits to configuration

- **Work:**
  - Move `MAX_LLM_CALLS` and `MAX_DURATION_MS` from hardcoded constants to a tier-aware config lookup.
  - Default tier returns current values (2 / 120000). No behavior change for existing users.
  - New tiers (if/when defined) return higher values.

### 3.2 Write probes (before any code)

| Probe | What it tests | Pass criteria |
|-------|--------------|---------------|
| REQ-E1 | Default tier returns MAX_LLM_CALLS = 2 | Exact match |
| REQ-E2 | Default tier returns MAX_DURATION_MS = 120000 | Exact match |
| REQ-E3 | Unknown tier falls back to default | Same as E1/E2 |
| REQ-E4 | Exhaustion still returns 409 at new tier boundary | Status code check |
| REQ-E5 | Ephemeral stream property holds across all tiers | History not persisted |

### Quality Gate
- All existing + E-series probes pass
- §4.0 baseline values unchanged for default tier
- 0 lint errors, clean build

---

## Milestone 4 — Data Retention & Cleanup

*The audit identified a gap: no automated retention/deletion scheduler exists.*

**Goal:** Implement session TTL enforcement and user data deletion that runs automatically.

**Baseline properties to preserve:** §2.2 channel ownership (DPR chains must survive session deletion), §3.3 export integrity.

### 4.1 Session TTL enforcement

- **Work:**
  - Redis key TTLs already exist per session. Verify they work correctly at scale.
  - Add a scheduled cleanup for orphaned keys (sessions that expired but left artifacts).

### 4.2 User data deletion (GDPR path)

- **Work:**
  - Wire the existing `deleteUserData` function in `data-layer.ts` to an API endpoint.
  - Ensure DPR chains are handled: deletion removes user-identifying fields but preserves chain integrity for audit.
  - Stripe customer cleanup already exists — verify it runs.

### 4.3 Write probes (before any code)

| Probe | What it tests | Pass criteria |
|-------|--------------|---------------|
| REQ-F1 | Expired session key is not retrievable | `getSession` returns null after TTL |
| REQ-F2 | DPR chain survives session deletion | Chain retrievable, actor_id present |
| REQ-F3 | User deletion removes profile data | `getUserData` returns null |
| REQ-F4 | User deletion preserves DPR chain integrity | Chain verification still passes |
| REQ-F5 | Export after deletion returns empty but valid structure | ZIP valid, session_logs = [] |

### Quality Gate
- All existing + F-series probes pass
- §2.2 ownership property verified for post-deletion scenario
- 0 lint errors, clean build

---

## Milestone 5 — Observability

*You can't improve what you can't measure. This milestone adds structured logging and metrics.*

**Goal:** Know what's happening in production without guessing.

**Baseline properties to preserve:** §2.1 ephemeral stream (logs must not contain user message content).

### 5.1 Structured request logging

- **Work:**
  - Log request path, status code, duration, user_id (hashed), session_id, gate_type.
  - **Never log message content or history.** REQ-A5 ephemeral property applies to logs too.

### 5.2 Response quality metrics

- **Work:**
  - Log word count, gate type, and whether the response was flagged (from M2 instrumentation).
  - Aggregate: average response length, gate-type distribution, flag rate.

### 5.3 Write probes (before any code)

| Probe | What it tests | Pass criteria |
|-------|--------------|---------------|
| REQ-G1 | Log entry contains required fields | path, status, duration, gate_type present |
| REQ-G2 | Log entry does not contain message content | No `message` or `history` field |
| REQ-G3 | Log entry does not contain raw user_id | Only hashed form |

### Quality Gate
- All existing + G-series probes pass
- REQ-A5 verified: no user content in any persistent store including logs
- 0 lint errors, clean build

---

## Milestone 6 — Product Behavior Baseline (Level 2)

*This is the milestone flagged in `baseline.txt` line 137 as "separate milestone." It defines what good looks like for response quality — not as code, but as a ratified contract.*

**Goal:** Write `baseline.txt` v2.0.0 that adds §7.0 Response Quality Contract alongside the existing §1–§6 technical sections.

**This milestone produces a document, not code.** It is the foundation for all future product work.

### 6.1 Define response quality properties

- What makes an Afloat response "good"?
- Plain language. No jargon. Direct mapping from question to answer.
- Removes surrounding noise. Addresses the direct input, not the concurrent context.
- Short. Proportional. Doesn't over-explain.

### 6.2 Define failure modes

- What makes an Afloat response "bad"?
- Jargon without expansion. Hedging phrases. Open-ended questions. Filler.
- Answering a question the user didn't ask. Adding context the user didn't request.

### 6.3 Ratify and version-bump

- Update `baseline.txt` to v2.0.0.
- Add §7.0 with the defined properties.
- All existing §1–§6 remain unchanged.

### Quality Gate
- `baseline.txt` v2.0.0 reviewed and accepted
- No code changes — document only
- All 107+ tests still pass (no regression from any preparatory work)

---

## Version History

| Version | Milestone | Tests | Status |
|---------|-----------|-------|--------|
| 1.0.0 | M1 — Technical Baseline | 107/107 | **COMPLETE** |
| — | M2 — Response Quality Foundation | TBD | Next |
| — | M3 — Session Depth | TBD | Planned |
| — | M4 — Data Retention & Cleanup | TBD | Planned |
| — | M5 — Observability | TBD | Planned |
| 2.0.0 | M6 — Product Behavior Baseline | TBD | Planned |

---

**End of Roadmap**
*Quality is the constraint, not the goal. Everything else flexes around it.*
*If a milestone can't pass its quality gate, it doesn't ship. No exceptions.*
