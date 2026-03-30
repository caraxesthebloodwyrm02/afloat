# Record of Processing Activities (ROPA)

**Prepared under:** GDPR Article 30  
**Controller:** Irfan Kabir (sole operator)  
**Contact:** Via application (no public email collected)  
**Date prepared:** 2026-03-01  
**Review due:** 2026-05-29 (Phase 1 contract end)  
**Contract reference:** `contract.json` v1.7.0 · ID `7a55f0f1`

---

## 1. Controller Details

| Field | Value |
|-------|-------|
| Controller name | Irfan Kabir |
| Role | Sole developer and operator |
| Organisation | Individual / sole trader |
| Application | Afloat — cognitive decision support tool |
| Production URL | https://afloat-six.vercel.app |
| Supervisory authority | Not formally designated (micro-scale, <250 employees, low-risk) |

---

## 2. Processing Activities Register

### Activity 1: Session Delivery (Core Service)

| Field | Value |
|-------|-------|
| **Purpose** | Provide cognitive decision support — user submits text, receives a brief |
| **Legal basis** | Contract performance (GDPR Art 6(1)(b)) |
| **Data subjects** | Subscribers (trial and continuous tier users) |
| **Personal data categories** | User text input (transient), pseudonymous user_id |
| **Recipients** | OpenAI (LLM processing) |
| **Third-country transfers** | USA (OpenAI servers) — covered by DPA auto-incorporated in OpenAI API Terms of Use |
| **Retention** | User text: 0 days on our servers (in-memory only). OpenAI retains up to 30 days for abuse monitoring. |
| **Security measures** | TLS in transit, text never persisted, PII redaction before LLM call, 10s timeout |
| **Source code reference** | `src/lib/llm.ts`, `src/app/api/v1/session/[id]/message/route.ts` |

### Activity 2: Session Telemetry

| Field | Value |
|-------|-------|
| **Purpose** | Measure service quality (latency, success rate, gate classification) |
| **Legal basis** | Consent (GDPR Art 6(1)(a)) — opt-in at signup (CM-01), toggleable (CM-02) |
| **Data subjects** | Subscribers who opted in to `session_telemetry` |
| **Personal data categories** | Pseudonymous session_id, user_id, timestamps, turn count, gate type, latency |
| **Recipients** | None (internal use only) |
| **Third-country transfers** | USA (Upstash Redis, Iowa us-central1) — covered by Upstash DPA |
| **Retention** | 90 days → auto-deleted by daily cron job |
| **Security measures** | TLS-encrypted Redis, no user text in telemetry, consent-gated |
| **Source code reference** | `src/lib/data-layer.ts`, `src/app/api/cron/cleanup/route.ts` |

### Activity 3: Account Management

| Field | Value |
|-------|-------|
| **Purpose** | Authenticate users and manage subscription state |
| **Legal basis** | Contract performance (GDPR Art 6(1)(b)) |
| **Data subjects** | All subscribers |
| **Personal data categories** | Pseudonymous user_id, stripe_customer_id, subscription_status, tier, consent records |
| **Recipients** | Stripe (payment processing) |
| **Third-country transfers** | USA (Stripe servers) — covered by Stripe DPA |
| **Retention** | Account lifetime + 30 days after deletion request (7-day grace + cleanup cycle) |
| **Security measures** | JWT authentication (HS256, 1hr expiry), rate limiting, no email stored on our servers |
| **Source code reference** | `src/lib/auth.ts`, `src/lib/data-layer.ts`, `src/lib/consent.ts` |

### Activity 4: Payment Processing

| Field | Value |
|-------|-------|
| **Purpose** | Collect subscription payments |
| **Legal basis** | Contract performance (GDPR Art 6(1)(b)) |
| **Data subjects** | All subscribers |
| **Personal data categories** | Email address, payment card details (held by Stripe only) |
| **Recipients** | Stripe |
| **Third-country transfers** | USA (Stripe) — PCI-DSS Level 1 compliant |
| **Retention** | Governed by Stripe retention policies. No card data touches our servers. |
| **Security measures** | Webhook signature verification, idempotency guards, Stripe Checkout (hosted) |
| **Source code reference** | `src/lib/stripe.ts`, `src/app/api/v1/webhooks/stripe/route.ts` |

### Activity 5: Audit Logging

| Field | Value |
|-------|-------|
| **Purpose** | Security monitoring, compliance accountability, incident investigation |
| **Legal basis** | Legitimate interest (GDPR Art 6(1)(f)) + legal obligation |
| **Data subjects** | All users interacting with data operations |
| **Personal data categories** | SHA-256 hashed IP address, pseudonymous user_id, action type, timestamps |
| **Recipients** | None (internal use only) |
| **Third-country transfers** | USA (Upstash Redis) |
| **Retention** | 365 days (Redis) + 2 years cold storage |
| **Security measures** | Append-only writes, IP never stored in raw form, immutable once written |
| **Source code reference** | `src/lib/audit.ts` |

### Activity 6: Decision Provenance

| Field | Value |
|-------|-------|
| **Purpose** | Immutable audit trail of system decisions for accountability and tamper detection |
| **Legal basis** | Legitimate interest (GDPR Art 6(1)(f)) |
| **Data subjects** | All session users |
| **Personal data categories** | Pseudonymous actor_id, decision metadata, HMAC-signed chain |
| **Recipients** | None (internal use only) |
| **Third-country transfers** | USA (Upstash Redis) |
| **Retention** | Account lifetime + cascade deletion on user data deletion |
| **Security measures** | HMAC signing with dedicated PROVENANCE_SIGNING_KEY, hash-linked chain integrity |
| **Source code reference** | `src/lib/provenance/` (6 files) |

---

## 3. Third-Party Processors

| Processor | Service | Data Shared | DPA Status | Transfer Mechanism |
|-----------|---------|-------------|------------|-------------------|
| **Ollama / OpenAI** | LLM inference (local-first; OpenAI only for rare lifeguard escalation) | User text (transient) | Local deployment by default; OpenAI API Terms apply only on escalation | Local processing by default; SCCs when OpenAI is used |
| **Stripe** | Payment processing | Email, card details, billing | Auto-incorporated via Stripe Agreement | PCI-DSS Level 1 + SCCs |
| **Vercel** | Application hosting | HTTP requests, logs | Auto-incorporated via Terms of Service | SCCs |
| **Upstash** | Redis session/data store | All persisted data (pseudonymous) | Auto-incorporated via Terms of Service | Data stored in us-central1 |

---

## 4. Technical and Organisational Security Measures

### Technical

- TLS encryption for all data in transit (HTTPS enforced)
- Encrypted at rest (Upstash Redis, Stripe)
- JWT authentication with dedicated secret and 1-hour expiry
- Separate PROVENANCE_SIGNING_KEY for audit trail integrity
- Rate limiting on all endpoints (session: 30/hr, data rights: 10/hr)
- Session locking to prevent concurrent LLM calls
- PII detection and redaction before LLM processing
- Fail-closed safety gradient (exception → deny)
- Prompt injection detection (8 patterns)
- Input length cap (2000 characters)
- Environment variables for all secrets (never in source)

### Organisational

- Single operator with full access (no shared credentials)
- Consent management: CM-01 (opt-in), CM-02 (per-category toggle), CM-03 (re-consent on policy change)
- Privacy policy published and linked from every page
- DPIA completed and scheduled for review
- Incident response plan documented
- Daily automated cleanup cron for expired data

---

## 5. Data Subject Rights Implementation

| Right | GDPR Article | Endpoint | Response Time |
|-------|-------------|----------|---------------|
| Access | Art 15 | `GET /api/v1/user/data-export` | Immediate (JSON) |
| Erasure | Art 17 | `DELETE /api/v1/user/data` | 7-day grace → permanent |
| Portability | Art 20 | `GET /api/v1/user/data-export?format=portable` | Immediate (ZIP: JSON+CSV) |
| Rectification | Art 16 | `PATCH /api/v1/user/profile` | Immediate |
| Withdraw consent | Art 7(3) | `POST /api/v1/user/consent` | Immediate |

---

## 6. Review Schedule

| Event | Action |
|-------|--------|
| 2026-05-29 | Phase 1 contract end — full ROPA review |
| User base > 50 | Trigger expanded DPIA + ROPA update |
| Processing activity change | Update this register within 48 hours |
| Data breach | Update risk assessment + review security measures |
| Annual | Routine ROPA review (if project continues past Phase 1) |

---

*Prepared by: Irfan Kabir — 2026-03-01*
