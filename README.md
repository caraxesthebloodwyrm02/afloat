# Afloat — 90-Day Assistive Tool Contract

## Overview

This repository contains the structured contract for a **standalone cognitive-assistive micro-tool**: a no-fluff, ~2-minute AI chat that helps general users make quick decisions and get past "context gates."

The contract defines baselines, deliverables, a transparent revenue model, and a real-time financial ledger — all in a single `contract.json` file.

---

## What Is a Context Gate?

A context gate is the moment a user **cannot engage** with a task because they lack a brief summary of what's happening. Examples:

- "Should I set this meeting or skip it?" — the user doesn't know the agenda well enough to decide
- "Which of these should I tackle first?" — the user needs a quick priority triage
- "I'm stuck because I don't understand the situation" — the user needs a 30-second gist

The tool provides **proportional assistance** — just enough to unblock the user, never enough to replace their judgment.

---

## Contract Summary

| Field | Value |
|---|---|
| **Contract ID** | `7a55f0f1-84be-43b7-8385-5dc0cbb49bed` |
| **Version** | 1.4.0 (pre-launch) |
| **Time Window** | 90 days: 2026-03-01 → 2026-05-29 |
| **Tool Type** | Assistive, collaborative |
| **Target Users** | General (anyone) |
| **Session Duration** | ~2 minutes max |
| **Revenue Target (Net)** | $22.00 USD |
| **Revenue Model** | Micro-Subscription — $3/month |
| **Gross Target** | $36.00 USD (conservative, covers worst-case costs) |
| **Stakeholder Domains** | Art, Market, Finance |

---

## Baselines

The tool must meet these thresholds to satisfy the contract:

| Baseline | Target |
|---|---|
| Session success rate | >= 95% |
| Response latency | < 3 seconds per turn |
| Context gate pass rate | >= 70% of sessions |
| Avg session duration | <= 2 minutes |
| Net revenue (90 days) | >= $22.00 USD |
| Cost transparency | 100% — gross covers everything |

---

## Revenue Model: Micro-Subscription

**Selected: Option A — $3/month**

- **Users needed:** 12 paying subscribers over 90 days
- **Acquisition pace:** ~1 new user per week (organic)
- **Projected gross:** $36.00
- **Projected costs (worst-case):** $13.10
- **Projected net:** $22.90
- **Surplus:** $0.90

### Cost Breakdown (Worst-Case Estimates)

| Category | 90-Day Estimate |
|---|---|
| LLM API (GPT-4o-mini) | $6.00 |
| Hosting (free tier) | $0.00 |
| Marketing (organic + minimal ads) | $5.00 |
| Domain (optional) | $1.00 |
| Payment processing (~3%) | $1.10 |
| **Total** | **$13.10** |

### Transparency Rule

> Gross revenue must always cover the $22 net target **plus** all actual costs. If costs exceed estimates, the gross target adjusts upward. No hidden extras. Every dollar in and out is recorded in the contract ledger.

---

## Deliverables (3 Phases)

### Phase 1: Contract & Architecture (Days 1–30)
- [x] Finalize `contract.json` v1.0
- [x] Define cognitive scope boundaries
- [x] Select revenue model
- [x] Design session flow
- [x] System architecture
- [x] Baseline instrumentation plan

### Phase 2: Build & Test (Days 31–60)
- [ ] Build core tool
- [ ] Agent-based reliability testing
- [ ] Session scope validation
- [ ] Payment/revenue integration
- [ ] Update `contract.json` v1.1
- [ ] Soft launch

### Phase 3: Revenue & Verification (Days 61–90)
- [ ] User acquisition
- [ ] Daily revenue vs. ledger tracking
- [ ] Hit $22 net milestone
- [ ] Final `contract.json` v1.2
- [ ] Stakeholder reliability report
- [ ] Financial verification

---

## File Structure

```
Afloat — Assistive Tool Contract/
├── contract.json                # The structured contract (source of truth)
├── CONTRACT_LAUNCH_CHECKLIST.md # Pre-launch gap checklist
├── ARCHITECTURE.md              # Baseline system design (5 layers, session lifecycle, mechanics)
├── BUILD_GUIDE.md               # Plain-English 9-step build & test guide
└── README.md                    # This file (human-readable summary)

App repository: github.com/caraxesthebloodwyrm02/afloat (private)
```

---

## How to Read the Contract

Open `contract.json` and navigate to:

- **`contract`** — ID, version, time window, parties
- **`tool`** — What the tool is, its scope, principles, behavior constraints, architecture, and documentation references
- **`baselines`** — Success criteria with thresholds and measurement formulas
- **`revenue`** — Financial model, cost estimates, gross/net targets, and the transparency ledger
- **`deliverables`** — Phased milestones with status tracking
- **`compliance`** — Transparency guarantees, audit trail policy, amendment rules, API data compliance blockers
- **`risk_controls`** — Triggers and fallback actions for acquisition, latency, and cost risks
- **`api_compliance`** — Data flows, consent management, data rights API, audit logging, retention, privacy policy, test plan
- **`changelog`** — Version history of the contract itself

---

## API Compliance (v1.2.0)

The contract now includes a full **data privacy and protection specification** under `api_compliance`, covering:

| Area | Key Artifacts |
|---|---|
| Data Flow Audit | 5 flows mapped (DF-01–DF-05), PII risk classified |
| Consent Management | 3 mechanisms (CM-01–CM-03), consent record schema |
| Data Rights API | 4 endpoints (DR-01–DR-04): access, delete, portability, rectification |
| Audit Logging | Immutable append-only log, IP hashing, 3 alert thresholds |
| Data Retention | 6 policies, auto-deletion job, user_text_input never persisted |
| Privacy Policy | 7 content requirements, versioning, 3 third-party DPAs pending |
| Testing | 8 test cases (TC-01–TC-08), 5 documentation requirements |

**Applicable frameworks:** GDPR, CCPA, DPDPA

---

## Amendment Policy

Any changes to baselines, revenue targets, or compliance terms require:
1. A new contract version (increment `contract.version`)
2. A changelog entry documenting the changes
3. Updated `gross_target_usd` if costs change (to preserve $22 net)
