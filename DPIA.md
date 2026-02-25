# Data Protection Impact Assessment (DPIA)

**Project:** Afloat — Cognitive Decision Support Tool
**Contract ID:** 7a55f0f1-84be-43b7-8385-5dc0cbb49bed
**Assessor:** Irfan Kabir (sole operator)
**Date:** 2026-02-26
**Review due:** 2026-05-29 (contract end)

---

## 1. Description of Processing

### What is Afloat?

Afloat is a micro-subscription ($3/month) web application that provides short-session cognitive decision support. Users describe what they are stuck on, and the tool returns a brief (under 300 tokens) to help them proceed. Sessions are capped at 2 minutes and 2 LLM calls.

### Data processing overview

| Data Category | Contains PII? | Storage Location | Retention |
|---------------|---------------|------------------|-----------|
| User text input | Yes (transient) | In-memory only (server) + sent to OpenAI | 0 days on our servers; OpenAI retains up to 30 days for abuse monitoring |
| Session telemetry | No | Upstash Redis | 90 days → aggregated → deleted |
| Account data (user_id, Stripe ref, consents) | Pseudonymous | Upstash Redis | Account lifetime + 30–365 days |
| Audit logs | No (IP hashed) | Upstash Redis | 365 days + 2 years cold |
| Payment data (card details) | Yes | Stripe only (never touches our servers) | Governed by Stripe retention |

### Scale of processing

- **Target user base:** 12 subscribers over 90 days
- **Expected sessions:** ~200–500 total across the contract period
- **Data volume:** Minimal — each session produces ~0.5 KB of telemetry

---

## 2. Necessity and Proportionality

### Lawful basis

| Processing Activity | Legal Basis | Justification |
|---------------------|-------------|---------------|
| Session delivery (text → LLM → brief) | Contract performance | Necessary to provide the service the user paid for |
| Session telemetry | Consent (opt-in) | User explicitly opts in post-checkout; can opt out anytime |
| Marketing communications | Consent (opt-in) | User explicitly opts in; can opt out anytime |
| Audit logging | Legitimate interest / legal obligation | Necessary for security, compliance, and accountability |
| Payment processing via Stripe | Contract performance | Necessary to collect subscription payments |

### Data minimization measures

1. **User text is never persisted.** It exists in server memory only during the LLM call and is discarded after the response is delivered. The `updateSession()` function explicitly strips `conversation_history` before writing to Redis.
2. **No email addresses stored.** User identity is a pseudonymous UUID. Stripe holds the email; we only hold a Stripe customer reference.
3. **IP addresses are hashed** (SHA-256) before storage. Raw IPs are never written to any data store.
4. **Session telemetry records zero personal text.** Only: session_id, timestamps, turn count, gate type, latency, and completion status.
5. **LLM responses are not stored** in the data layer. Only the gate type classification is recorded.

---

## 3. Risk Assessment

### Risk 1: User text exposure via OpenAI

| Dimension | Assessment |
|-----------|------------|
| **Likelihood** | Medium — OpenAI retains prompts in abuse monitoring logs for up to 30 days by default |
| **Severity** | Low — text is short decision-context queries, not sensitive PII. No health, financial, or identity data is solicited. |
| **Overall risk** | Low-Medium |
| **Mitigation** | (a) Privacy policy discloses OpenAI retention clearly. (b) System prompt instructs the LLM not to solicit personal details. (c) OpenAI's API terms prohibit training on API data (since March 2023). (d) Future: apply for OpenAI Zero Data Retention if user base grows. |

### Risk 2: Session telemetry re-identification

| Dimension | Assessment |
|-----------|------------|
| **Likelihood** | Very Low — telemetry contains no text, no email, no IP. Only timestamps, durations, and gate types. |
| **Severity** | Negligible — even if accessed, the data reveals nothing personally identifiable |
| **Overall risk** | Negligible |
| **Mitigation** | (a) Telemetry is opt-in (consent required). (b) Aggregated after 90 days. (c) No cross-referencing with external datasets. |

### Risk 3: Unauthorized access to user accounts

| Dimension | Assessment |
|-----------|------------|
| **Likelihood** | Low — JWT authentication with 1-hour expiry, rate limiting on all endpoints |
| **Severity** | Low — accounts contain no sensitive PII (pseudonymous ID + Stripe ref only) |
| **Overall risk** | Low |
| **Mitigation** | (a) JWT signed with dedicated secret (HS256). (b) Provenance signing key isolated from auth key. (c) Rate limiting: 30 req/hr session endpoints, 10 req/hr data rights. (d) Session locks prevent concurrent LLM calls. |

### Risk 4: Data breach at third-party processor

| Dimension | Assessment |
|-----------|------------|
| **Likelihood** | Very Low — OpenAI, Stripe, and Vercel are enterprise-grade with SOC 2, PCI-DSS, etc. |
| **Severity** | Low-Medium — depends on which processor. Stripe breach would be most impactful (payment data). |
| **Overall risk** | Low |
| **Mitigation** | (a) DPAs in place with all three processors (auto-incorporated into service agreements). (b) Stripe handles all card data — it never touches our servers. (c) Breach notification: all three processors have contractual obligations to notify within 72 hours. |

### Risk 5: Failure to honor deletion requests

| Dimension | Assessment |
|-----------|------------|
| **Likelihood** | Low — deletion flow is implemented with 7-day grace period and cascade delete |
| **Severity** | Medium — regulatory non-compliance risk |
| **Overall risk** | Low-Medium |
| **Mitigation** | (a) DELETE /api/v1/user/data endpoint implemented with cascade deletion (user record, session logs, Stripe customer). (b) Audit log records all deletion events. (c) 7-day grace period allows user to cancel if accidental. (d) All deletions logged immutably. |

---

## 4. Risk Summary Matrix

| Risk | Likelihood | Severity | Overall | Acceptable? |
|------|------------|----------|---------|-------------|
| User text via OpenAI | Medium | Low | Low-Medium | Yes, with disclosure |
| Telemetry re-identification | Very Low | Negligible | Negligible | Yes |
| Unauthorized access | Low | Low | Low | Yes |
| Third-party breach | Very Low | Low-Medium | Low | Yes |
| Deletion failure | Low | Medium | Low-Medium | Yes, with testing |

**Overall assessment:** All identified risks are within acceptable levels for a micro-scale application serving ~12 users with minimal PII processing. No high or critical risks identified.

---

## 5. Measures Implemented

### Technical safeguards

- User text never persisted (DF-01 compliant)
- IP hashing before storage (SHA-256)
- JWT authentication on all protected endpoints
- Provenance signing key isolated from auth key
- Rate limiting on all API endpoints
- Session locking to prevent race conditions
- Fail-fast on missing environment variables (no default secrets)
- Fail-closed on unknown boundary IDs

### Organizational safeguards

- Privacy policy v1.0 published at /privacy (accessible from every page)
- Consent management: opt-in post-checkout (CM-01), settings toggles (CM-02), re-consent on policy changes (CM-03)
- Data rights: export (DR-01), deletion with 7-day grace (DR-02), portability (DR-03), rectification (DR-04)
- Immutable audit logs for all data operations
- DPAs auto-incorporated with OpenAI, Stripe, and Vercel

### Data subject rights

| Right | Implementation | Endpoint |
|-------|---------------|----------|
| Access | JSON export of all user data | GET /api/v1/user/data-export |
| Erasure | Cascade deletion with 7-day grace | DELETE /api/v1/user/data |
| Portability | JSON download | GET /api/v1/user/data-export?format=portable |
| Rectification | Update display_name, email_preference | PATCH /api/v1/user/profile |
| Withdraw consent | Toggle in settings | POST /api/v1/user/consent |

---

## 6. Consultation

Given the minimal scale (12 users, $36 gross revenue, 90-day window) and low-risk profile (no sensitive categories, no profiling, no automated decision-making with legal effects), **supervisory authority consultation is not required** under GDPR Article 36.

---

## 7. Decision

**Proceed with processing.** All identified risks are mitigated to acceptable levels. This DPIA will be reviewed at contract end (2026-05-29) or earlier if:

- User base exceeds 50 subscribers
- A data breach or near-miss occurs
- Processing activities materially change
- A data subject raises a complaint

---

*Assessed by: Irfan Kabir — 2026-02-26*
