# Internal Compliance Runbook

**Project:** Afloat — Cognitive Decision Support Tool  
**Contract reference:** `contract.json` v1.7.0 · §7g.6  
**Operator:** Irfan Kabir  
**Date prepared:** 2026-03-01  
**Review due:** 2026-05-29

---

## 1. Processing a Data Subject Request

### Right to Access (DR-01)

**When:** User requests a copy of their data.  
**How:** The user can self-serve via `GET /api/v1/user/data-export` (authenticated).  
**Manual fallback:**

1. Identify the user in Redis: `GET user:{user_id}`
2. Collect session logs: `LRANGE sessions:{YYYY-MM-DD} 0 -1` (filter by user_id, scan up to 90 days back)
3. Collect consent records: embedded in user record
4. Compile and deliver via secure channel
5. Log in audit: action = `manual_data_export`

**SLA:** Within 30 days (GDPR Art 12(3)). Self-serve is immediate.

### Right to Erasure (DR-02)

**When:** User requests deletion of their data.  
**How:** The user calls `DELETE /api/v1/user/data` → 7-day grace period → auto-deletion by cron.  
**Manual fallback:**

1. Mark user for deletion: set `deletion_requested: true`, `deletion_date: <7 days from now>` in user record
2. After grace period, delete: `DEL user:{user_id}`, `DEL stripe_customer:{customer_id}`
3. Delete session logs: scan `sessions:{YYYY-MM-DD}` lists, remove entries matching user_id
4. Delete provenance chains: `DEL dpr_chain:{session_id}` for all user sessions
5. Request Stripe customer deletion: use `deleteStripeCustomer(customerId)` from `stripe.ts`
6. Log in audit: action = `user_data_deleted`, cascade count

**SLA:** Within 30 days. Grace period: 7 days (cancellable by user).

### Right to Rectification (DR-04)

**When:** User requests correction of their data.  
**How:** `PATCH /api/v1/user/profile` — fields: `display_name`, `email_preference`.  
**Manual fallback:** Update the user record in Redis directly.

### Right to Portability (DR-03)

**When:** User requests data in a portable format.  
**How:** `GET /api/v1/user/data-export?format=portable` → returns ZIP (data.json + data.csv).

---

## 2. Handling Consent Withdrawal

**When:** User toggles off a consent category in `/settings`.  
**System behavior:** `POST /api/v1/user/consent` updates the consent record immediately.

### Consequences by category

| Consent | If withdrawn | System action |
|---------|-------------|---------------|
| `essential_processing` | Cannot be withdrawn (required) | UI prevents unchecking |
| `session_telemetry` | Session telemetry not written for this user | `data-layer.ts` checks consent before writing |
| `marketing_communications` | No marketing messages sent | Checked before any outreach |

### Post-withdrawal verification

1. Start a new session as the user
2. Complete the session
3. Check `sessions:{YYYY-MM-DD}` — no entry for this user should appear (if telemetry was revoked)
4. Verify audit log records the consent change

---

## 3. Secret Rotation Procedures

### When to rotate

- **Immediately:** On suspected compromise, employee departure, or dependency breach
- **Scheduled:** Every 90 days (aligned with contract phase boundaries)
- **Triggered:** When a third-party processor reports a breach

### Rotation steps

#### JWT_SECRET

```powershell
# Generate new secret
openssl rand -hex 32
# Update in Vercel Dashboard → Settings → Environment Variables → JWT_SECRET
# Impact: All active JWTs are invalidated immediately. Users must re-authenticate.
# No code change needed.
```

#### PROVENANCE_SIGNING_KEY

```powershell
openssl rand -hex 32
# Update in Vercel
# Impact: New DPR chains use new key. Old chains remain verifiable IF old key is retained for verification.
# Recommendation: Store old key in a PREV_PROVENANCE_KEY env var for chain verification continuity.
```

#### STRIPE_SECRET_KEY

1. Go to Stripe Dashboard → Developers → API Keys
2. Roll the secret key (Stripe provides a migration period)
3. Update in Vercel
4. Verify webhooks still deliver: check Stripe Dashboard → Webhooks → Event deliveries

#### OPENAI_API_KEY

1. Go to OpenAI Dashboard → API Keys
2. Create a new key
3. Update in Vercel
4. Delete the old key in OpenAI Dashboard
5. Verify: `curl -H "Authorization: Bearer $KEY" https://api.openai.com/v1/models`

#### CRON_SECRET

```powershell
openssl rand -hex 32
# Update in Vercel
# Impact: Cron job auth changes. Vercel cron scheduler handles this automatically via env var.
```

---

## 4. Cron Job Verification

### Daily check (production)

The cron job runs at `02:00 UTC` daily via `vercel.json`.

**Manual invocation:**

```powershell
curl -H "Authorization: Bearer <CRON_SECRET>" https://afloat-six.vercel.app/api/cron/cleanup
```

**Expected response:**

```json
{
  "ok": true,
  "users_deleted": 0,
  "sessions_cleaned": 0,
  "errors": []
}
```

**Verify in Vercel:** Dashboard → Project → Settings → Cron Jobs → Execution History

### Troubleshooting

| Issue | Check |
|-------|-------|
| Cron didn't run | Vercel → Cron Jobs → check execution history and errors |
| `401` response | `CRON_SECRET` mismatch — verify env var matches request header |
| `500` response | Check Vercel function logs for Redis connection or runtime errors |
| Users not deleted | Check if `deletion_date` has passed (7-day grace period) |

---

## 5. Audit Log Monitoring

### Check audit logs

```powershell
# In Upstash Redis console or via REST API:
# List today's audit entries
LRANGE audit:2026-03-01 0 -1
```

### Alert thresholds (from contract)

| Trigger | Threshold | Action |
|---------|-----------|--------|
| Bulk deletion | > 3 deletion requests in 24 hours | Investigate for abuse or compromised account |
| Unauthorised access | Any 403 on session/provenance endpoints | Check if foreign session claim or hijack attempt |
| Consent revocation spike | > 5 revocations in 24 hours | Review recent changes for trust-breaking events |
| Rate limit blocks | > 20 blocks in 1 hour | Check for bot traffic or misconfigured client |

### Weekly review process

1. Scan audit logs for the past 7 days
2. Count and categorise actions: `session_logged`, `user_created`, `deletion_requested`, `consent_updated`, `data_exported`
3. Flag any unexpected patterns
4. Document findings in a simple weekly note (no formal report required for micro-scale)

---

## 6. Monthly Transparency Ledger Update

### Process

1. Open `contract.json` → `revenue.ledger.entries`
2. Add entries for:
   - Revenue received (Stripe → payouts)
   - Costs incurred (OpenAI API usage, any paid services)
   - Running totals updated
3. Cross-reference Stripe Dashboard → Payments for actual amounts
4. Cross-reference OpenAI Dashboard → Usage for actual costs
5. Commit the updated `contract.json` with message: `ledger: update YYYY-MM ledger entries`

### First entry template

```json
{
  "date": "2026-03-31",
  "type": "revenue",
  "category": "subscription",
  "description": "March subscriptions",
  "amount_usd": 0.00,
  "running_total_revenue": 0.00,
  "running_total_cost": 0.00,
  "running_total_net": 0.00
}
```

---

## 7. Annual DPIA Review

**Current DPIA:** `docs/DPIA.md` (dated 2026-02-26)  
**Next review:** 2026-05-29 (or earlier — see triggers below)

### Review triggers

- User base exceeds 50 subscribers
- A data breach or near-miss occurs
- Processing activities materially change (new data category, new processor)
- A data subject raises a formal complaint
- Regulatory guidance changes affecting the lawful basis

### Review checklist

1. Re-assess all 5 risks in DPIA §3 against current state
2. Verify all mitigations are still in place and functioning
3. Update user count and data volume estimates
4. Verify third-party DPAs are current
5. Update `ROPA.md` if any changes
6. Record review completion in audit log

---

*Prepared by: Irfan Kabir — 2026-03-01*
