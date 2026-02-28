# Afloat — RSP 3.0 Alignment & Safety Framework

**Version:** 1.0.0
**Contract reference:** `contract.json` v1.6.0
**Effective:** 2026-03-01

---

## 1. ASL Classification

Afloat operates at **ASL-1** (minimal risk):

- No autonomous task completion — the tool assists, the user decides
- No persistent user data — ephemeral stream architecture (DF-01)
- Limited session scope — 2-minute trial / 30-minute continuous max
- No access to external systems, credentials, or sensitive data
- No capability to take real-world actions

Safety measures are proportional to this minimal risk level while maintaining fail-closed defaults for all safety checks.

---

## 2. Frontier Safety Roadmap Alignment

### Security

| Measure | Implementation |
|---------|---------------|
| Authentication | JWT bearer tokens on all session/data routes (REQ-B1) |
| Payment security | Stripe PCI-DSS compliant, no card data on our servers (DF-04) |
| Input validation | Server-side enforcement, 2000-char limit, rate limiting |
| Webhook integrity | Stripe signature verification on all webhook events |
| IP privacy | SHA-256 hashed IPs in audit logs, never raw |

### Alignment

| Measure | Implementation |
|---------|---------------|
| Prompt guardrails | System prompt constrains: 150-word max, no speculation, no task completion |
| Gate-type detection | Structured response format ensures on-topic responses |
| Proportional assistance | Brief enables user's decision without replacing it |
| Scope enforcement | Out-of-scope requests receive honest "outside what I can help with" response |

### Safeguards

| Measure | Implementation |
|---------|---------------|
| Session limits | Tier-aware turn counting and timer enforcement (server-side only) |
| Safety gradient | Tier-proportional abuse detection (rapid-fire blocking for continuous tier) |
| Fail-closed defaults | All safety evaluations deny access on error (src/lib/safety.ts) |
| Exhaustion handling | 409 status code at tier boundary — clean session termination |
| Rate limiting | Per-user and per-IP rate limits on all endpoints |

### Policy

| Measure | Implementation |
|---------|---------------|
| User consent | Explicit opt-in (CM-01), granular controls (CM-02), renewal on policy change (CM-03) |
| Data rights | Right to access (DR-01), delete (DR-02), portability (DR-03), rectification (DR-04) |
| GDPR/CCPA/DPDPA | Full compliance framework in api_compliance section of contract.json |
| Audit trail | Immutable append-only logs, 365-day retention |
| Auto-deletion | Scheduled daily cleanup of expired records |

---

## 3. Fail-Closed Architecture

Following RSP 3.0's fail-closed principle, Afloat defaults to denial when safety checks encounter errors:

```
evaluateSafetyGradient(tier, messageCount, sessionDurationMs)
  → allowed: true/false

failClosedSafetyCheck(evaluationFn)
  → If evaluationFn throws → { allowed: false }
  → If evaluationFn returns → pass through result
```

This ensures that:
1. A bug in safety logic never results in unintended access
2. Unknown tiers fall back to the most restrictive (trial) limits
3. Sessions without tier metadata are treated as trial (backward-compatible and safe)

---

## 4. DPR Chain Provenance

Every session generates a Decision Provenance Record (DPR) chain that documents:

- Authentication check (JWT validation)
- Rate limit evaluation
- Session limit enforcement
- LLM response generation (model ID, parameters, gate type)
- Error events (if any)

Each DPR is cryptographically signed and chained to its predecessor, providing an auditable trail of every decision the system makes. DPR chains survive session deletion (REQ-B2) and can be verified for integrity (REQ-B5).

---

## 5. Tier System & Safety Proportionality

Safety measures scale with capability:

| Tier | Capability | Safety Overhead | Rationale |
|------|-----------|----------------|-----------|
| Trial | 2 turns, 2 min | Minimal (session limits only) | Low capability = low risk |
| Continuous | 6 turns, 30 min | Session limits + rapid-fire detection | Higher capability = proportional safety |

This graduated approach avoids over-restricting low-risk users while maintaining appropriate guardrails for extended sessions.

---

*This document maps Afloat's safety architecture to Anthropic's RSP 3.0 framework (effective February 24, 2026). It is not a compliance certification — it documents alignment intent and implementation.*
