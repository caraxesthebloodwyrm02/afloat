# Incident Response Plan

**Project:** Afloat — Cognitive Decision Support Tool  
**Contract reference:** `contract.json` v1.7.0 · §7g.5  
**Responsible party:** Irfan Kabir (sole operator)  
**Date prepared:** 2026-03-01  
**Review due:** 2026-05-29

---

## 1. Scope

This plan covers personal data breaches and security incidents affecting the Afloat application, its users, and its third-party processors (OpenAI, Stripe, Upstash/Redis, Vercel).

A **personal data breach** is any breach of security leading to accidental or unlawful destruction, loss, alteration, unauthorised disclosure of, or access to, personal data (GDPR Article 4(12)).

---

## 2. Detection Criteria

### What constitutes a breach

| Category                | Example                                                         | Severity |
| ----------------------- | --------------------------------------------------------------- | -------- |
| **Unauthorised access** | JWT secret compromised, someone accessing other users' sessions | HIGH     |
| **Data exposure**       | User text accidentally persisted to Redis or logs               | HIGH     |
| **Third-party breach**  | OpenAI/Stripe/Upstash reports a breach affecting our data       | HIGH     |
| **Service compromise**  | Vercel deployment tampered with, malicious code injected        | CRITICAL |
| **Credential exposure** | API keys committed to source code or publicly accessible        | HIGH     |
| **Data loss**           | Redis data unexpectedly deleted without authorisation           | MEDIUM   |
| **Availability**        | Extended outage affecting user access (>4 hours)                | LOW      |

### Detection sources

- Audit logs (`audit:{YYYY-MM-DD}` in Redis) — monitor for unexpected patterns
- Stripe webhook failures or signature verification rejects
- Vercel deployment logs — unexpected deployments or build failures
- Email/notifications from third-party processors about breaches
- User reports of suspicious activity
- Automated alerting thresholds (defined in `contract.json`)

---

## 3. Immediate Containment (First 60 Minutes)

Upon detecting or suspecting a breach, execute these steps in order:

### Step 1: Stop the bleeding (0–15 min)

| Action                         | How                                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **Revoke compromised secrets** | Rotate `JWT_SECRET`, `PROVENANCE_SIGNING_KEY`, `STRIPE_WEBHOOK_SECRET` in Vercel → Environment Variables |
| **Kill active sessions**       | Delete all `session:*` keys in Upstash Redis console                                                     |
| **Disable endpoints**          | If source is compromised: pause Vercel deployment or set maintenance mode                                |
| **Revoke API keys**            | Rotate `OPENAI_API_KEY` in OpenAI dashboard, `STRIPE_SECRET_KEY` in Stripe dashboard                     |

### Step 2: Assess scope (15–60 min)

| Question                     | How to answer                                                          |
| ---------------------------- | ---------------------------------------------------------------------- |
| What data was affected?      | Check audit logs, Redis key access patterns, Vercel function logs      |
| How many users are affected? | Count distinct `user:*` keys with activity in the affected time window |
| Is it ongoing?               | Check if containment actions halted the breach                         |
| What is the entry vector?    | Review deployment history, access logs, third-party notifications      |

### Step 3: Document everything

Create a timestamped incident log entry. Record:

```
Incident ID: INC-YYYY-MM-DD-NNN
Detected at: [ISO timestamp]
Detected by: [source]
Category: [from table above]
Severity: [LOW / MEDIUM / HIGH / CRITICAL]
Affected data: [list]
Affected users: [count or "unknown"]
Containment actions taken: [list]
Status: [active / contained / resolved]
```

---

## 4. Notification Obligations (72-Hour Window)

### 4a. Supervisory Authority (GDPR Article 33)

**Trigger:** Breach results in risk to data subjects' rights and freedoms.

**Timeline:** Within **72 hours** of becoming aware of the breach.

**When NOT required:** If the breach is unlikely to result in risk — e.g., encrypted data exposed but key not compromised, or only pseudonymous session IDs leaked with no re-identification path.

**Notification content (Art 33(3)):**

1. Nature of the breach (categories of data, approx. number of subjects)
2. Name and contact of the controller (Irfan Kabir)
3. Likely consequences of the breach
4. Measures taken or proposed to address the breach

**How to file:** Contact the relevant supervisory authority via their online portal or email. If operating under UK GDPR, the ICO breach reporting tool: https://ico.org.uk/make-a-complaint/data-protection-complaints/data-protection-complaints/

### 4b. Affected Data Subjects (GDPR Article 34)

**Trigger:** Breach likely to result in **high risk** to data subjects' rights and freedoms.

**Timeline:** Without undue delay after determining high risk.

**When NOT required:**

- Data was pseudonymised/encrypted and keys were not compromised
- Subsequent measures ensure high risk is no longer likely
- It would involve disproportionate effort (use public communication instead)

**Notification method:** If email is available via Stripe customer records, send individual notifications. Otherwise, publish a notice on the application.

**Content:** Clear, plain language describing:

- What happened
- What data was affected
- What we've done about it
- What the user can do (change passwords, monitor accounts)
- Contact information for questions

### 4c. Third-Party Processors

| Processor | Contact method                 | What to communicate                                    |
| --------- | ------------------------------ | ------------------------------------------------------ |
| OpenAI    | support@openai.com / dashboard | If breach involves API key or prompts                  |
| Stripe    | Stripe Dashboard → Support     | If breach involves payment data or webhook secret      |
| Upstash   | Upstash Dashboard → Support    | If breach involves Redis credentials or stored data    |
| Vercel    | Vercel Dashboard → Support     | If breach involves deployment or environment variables |

---

## 5. Recovery

### Restore operations

1. Deploy clean build from verified git commit: `git log --oneline -5` → identify last known-good commit
2. Rebuild and redeploy: `vercel --prod` from clean branch
3. Generate new secrets (all — treat as full rotation):
   - `openssl rand -hex 32` for JWT_SECRET
   - `openssl rand -hex 32` for PROVENANCE_SIGNING_KEY
   - Generate new CRON_SECRET
4. Update all secrets in Vercel Environment Variables
5. Verify health endpoint: `GET /api/v1/health` returns 200
6. Run test suite: `npm run test` — all 153+ tests must pass
7. Verify webhook delivery in Stripe Dashboard

### Verify containment

- [ ] All compromised secrets rotated
- [ ] No unauthorised Redis keys remain
- [ ] Audit logs show no further suspicious activity for 24 hours
- [ ] All third-party processors notified (if applicable)
- [ ] Stripe webhook endpoint receiving events normally

---

## 6. Post-Incident Review

Conduct within **7 days** of resolution.

### Review checklist

1. **Root cause analysis:** What was the entry vector? Could it have been prevented?
2. **Detection delay:** How long between breach start and detection? Can we detect faster?
3. **Response effectiveness:** Were containment actions sufficient? What was the total exposure window?
4. **Notification compliance:** Were all required parties notified within required timelines?
5. **Hardening actions:** What changes prevent this category of breach in the future?

### Document and archive

- Complete the incident log entry with resolution details
- Update this Incident Response Plan if gaps were identified
- Update `DPIA.md` risk assessment if new risks emerged
- Update `ROPA.md` if processing activities or security measures changed
- Record the incident in the audit log: `audit:{YYYY-MM-DD}`

---

## 7. Secret Rotation Reference

| Secret                     | Location         | Rotation method                                                            |
| -------------------------- | ---------------- | -------------------------------------------------------------------------- |
| `JWT_SECRET`               | Vercel env       | `openssl rand -hex 32` → update in Vercel; all active sessions invalidated |
| `PROVENANCE_SIGNING_KEY`   | Vercel env       | `openssl rand -hex 32` → update; new DPR chains use new key                |
| `STRIPE_SECRET_KEY`        | Stripe Dashboard | Roll key in Stripe → update in Vercel                                      |
| `STRIPE_WEBHOOK_SECRET`    | Stripe Dashboard | Delete and recreate webhook endpoint → update in Vercel                    |
| `OPENAI_API_KEY`           | OpenAI Dashboard | Revoke and create new key → update in Vercel                               |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Console  | Rotate token → update in Vercel                                            |
| `CRON_SECRET`              | Vercel env       | `openssl rand -hex 32` → update in Vercel                                  |

---

_Prepared by: Irfan Kabir — 2026-03-01_
