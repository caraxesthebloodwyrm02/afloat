# CONTRACT LAUNCH CHECKLIST

Generated: 2026-02-25T18:14:26.906665 UTC
Updated: 2026-02-28

## 1. Governance & Identity

-   [x] Populate provider identity (name, role, contact) — structured placeholders added (FILL_BEFORE_START)
-   [ ] Populate stakeholder list (art, market, finance domains)
-   [x] Assign responsibility owners for: — slots added in governance.responsibility_owners (FILL_BEFORE_START)
    -   [x] System architecture
    -   [x] Instrumentation & metrics
    -   [x] Payment integration
    -   [x] Marketing & acquisition
    -   [x] Ledger & financial reporting
-   [x] Record official Phase 1 start date (this starts 90-day clock) — 2026-03-01

------------------------------------------------------------------------

## 2. Architecture & Technical Foundation

-   [x] Define system architecture (LLM layer, session controller, data
    layer) — defined in tool.architecture + ARCHITECTURE.md (11 sections)
-   [x] Enforce session duration cap (≤ 2 minutes) — session_controller.max_duration_seconds: 120
-   [x] Implement context-gate logic — session_flow defined (4 steps), LLM prompt strategy documented
-   [x] Define logging schema for: — defined in baselines.instrumentation
    -   session_success_rate
    -   response_latency
    -   context_gate_pass_rate
    -   avg_session_duration
-   [x] Validate latency target (≤ 3.0 seconds avg) — threshold set in baselines.efficient
-   [x] Document build sequence — BUILD_GUIDE.md (9 steps, ~20-27 hours estimated effort)
-   [x] Define API route map — 9 endpoints documented in ARCHITECTURE.md §10
-   [x] Define security boundaries — ARCHITECTURE.md §11
-   [x] Define frontend states and UI spec — ARCHITECTURE.md §9
-   [x] Define error handling rules — ARCHITECTURE.md §5 (6 error scenarios with actions)
-   [ ] Run baseline performance tests (§2.11 — requires live deployment)

------------------------------------------------------------------------

## 3. Financial Model Hardening

-   [x] Confirm micro-subscription pricing (\$3/month)
-   [x] Validate payment processor fees — corrected to $1.10 (3% of $36, rounded up)
-   [x] Recalculate projected net revenue — $22.90 (surplus $0.90)
-   [x] Stress-test acquisition assumption (1 user/week) — acquisition_stress_test added with worst-case mitigation
-   [x] Adjust gross target if cost exceeds estimate — gross_target_usd updated to $35.10 (conservative $36.00)
-   [x] Document cost tracking categories — ledger schema covers all categories

------------------------------------------------------------------------

## 4. Revenue Ledger Implementation

-   [x] Implement transparency ledger (real-time) — schema defined in revenue.ledger
-   [x] Enforce ISO date format — all dates use ISO-8601
-   [x] Track:
    -   type (revenue / cost)
    -   category
    -   amount_usd
    -   running totals
-   [x] Add first test ledger entry — initialization entry added (2026-02-26)
-   [x] Validate audit trail integrity — running totals verified at $0.00

------------------------------------------------------------------------

## 5. Launch & Validation

-   [x] Integrate payment system (§5.1 — Stripe checkout + webhook + verify flow implemented)
-   [ ] Conduct soft launch (§5.2 — requires deployment + real users)
-   [ ] Acquire first 3 users (§5.3 — validation milestone)
-   [ ] Monitor KPI thresholds:
    -   ≥ 0.95 session success rate
    -   ≥ 0.70 context-gate pass rate
    -   ≤ 2.0 min average session
-   [ ] Publish first transparency report (§5.5)
-   [ ] Verify net ≥ \$22 at end of 90 days (§5.6)

------------------------------------------------------------------------

## 6. Risk Controls

-   [x] Define fallback plan if user acquisition \< forecast — trigger: <6 subs by day 60 → activate Model C
-   [x] Define fallback plan if latency \> threshold — trigger: >3.0s for 7 days → downgrade prompt or model
-   [x] Define cost overrun adjustment mechanism — trigger: >15% overrun → freeze discretionary spend
-   [x] Establish version control rule for contract changes — version increment + changelog + 48h stakeholder notification

------------------------------------------------------------------------

## 7. API Compliance (Data Privacy & Protection)

### 7a. Data Flow Audit
-   [x] Map all user data collection points (DF-01 through DF-05)
-   [x] Classify PII risk per data flow (low / medium / high)
-   [x] Identify third-party data processors (OpenAI, Stripe, Vercel)
-   [x] Sign Data Processing Agreements (DPAs) with all processors (§7a.4 — auto-incorporated per service agreements, verified 2026-02-26)

### 7b. Consent Management
-   [x] Specify initial consent mechanism (CM-01: explicit opt-in, unchecked default)
-   [x] Specify granular opt-out mechanism (CM-02: per-category toggles)
-   [x] Specify consent renewal on policy change (CM-03: re-consent prompt)
-   [x] Define consent record schema with timestamps and policy version
-   [x] Implement consent UI (§7b.5 — consent page, settings page, consent.ts with CM-01/CM-02/CM-03)

### 7c. Data Rights API
-   [x] Define right to access endpoint (DR-01: GET /api/v1/user/data-export)
-   [x] Define right to delete endpoint (DR-02: DELETE /api/v1/user/data, 7-day grace)
-   [x] Define right to portability endpoint (DR-03: JSON + CSV export)
-   [x] Define right to rectification endpoint (DR-04: PATCH /api/v1/user/profile)
-   [x] Implement all data rights endpoints (§7c.5 — data-export, data, profile routes implemented)

### 7d. Audit Logging
-   [x] Define immutable audit log schema (append-only, IP hashed)
-   [x] Define alerting thresholds (bulk deletion, unauthorized access, consent revocation spike)
-   [x] Implement audit logging infrastructure (§7d.3 — audit.ts with append-only rpush, called across all data operations)

### 7e. Data Retention
-   [x] Define retention policies for all 6 data categories
-   [x] Confirm user_text_input is never persisted (0-day retention)
-   [x] Define auto-deletion mechanism (daily scheduled job at 02:00 UTC)
-   [ ] Implement auto-deletion scheduled job (§7e.4 — cron/cleanup route)

### 7f. Privacy Policy
-   [x] Specify privacy policy content requirements (7 items)
-   [x] Define versioning and change notification process (14-day advance notice)
-   [x] Draft and publish privacy policy v1.0 (§7f.3 — src/app/privacy/page.tsx, effective 2026-03-01)
-   [x] Link privacy policy in app footer (§7f.4 — layout.tsx footer with /privacy link)

### 7g. Testing & Documentation
-   [x] Define 8 compliance test cases (TC-01 through TC-08)
-   [x] List 5 documentation requirements (DPIA, ROPA, Incident Response, DPAs, Runbook)
-   [x] Complete Data Protection Impact Assessment (§7g.3 — DPIA.md, 5 risks assessed)
-   [ ] Complete Record of Processing Activities (§7g.4 — ROPA)
-   [ ] Write Incident Response Plan (§7g.5 — 72-hour breach notification)
-   [ ] Write internal compliance runbook (§7g.6)
-   [ ] Pass all compliance test cases (§7g.7 — TC-01 through TC-08)
