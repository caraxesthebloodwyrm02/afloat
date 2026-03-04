# Safety and Security at the Core (Sanitized Approach)

This document defines the minimal, in-process safety model. All enforcement is **tool-call free**: no external MCP tools or services are required for core safety.

## One gate

- **Single sanitization path**: `runSafetyPipeline()` in `src/lib/safety-pipeline.ts`.
- It runs in order: `preCheckGate` (control chars, injection patterns, length) → PII shield → safety gradient (rate/tier).
- All mutation paths that accept user text must call this pipeline; there is no second "TrustLayer" or duplicate safety module.
- Entry point for user content: `preCheckGate()` and `detectAndRedactPII()` in `src/lib/safety.ts`.

## One audit write

- **Single write path**: `writeAuditLog()` in `src/lib/audit.ts`.
- Append-only (Redis `rpush`); no delete/update APIs.
- Every state-changing action (session start/end, consent, export, etc.) must call `writeAuditLog` after the mutation.
- Optional per-entry `payload_hash` (SHA-256 of payload) is stored for integrity; no parent/child chain in v1.

## Minimal access control

- **Identity**: JWT via `auth-middleware`; `verifyToken()` yields `user_id` / `sub`.
- **Allowlist**: When `ALLOWED_CALLERS` is set (comma-separated list of identities), only those identities may call protected operations. Use `isAllowedCaller(identity)` from `src/lib/access.ts` after authentication.
- When `ALLOWED_CALLERS` is unset, all authenticated callers are allowed (backward compatible).
- No roles DB or permission matrix in v1.

## Fail-closed

- Safety checks and auth failures deny by default (`failClosedSafetyCheck` in `safety.ts`).
- No silent fallbacks that bypass the gate or audit.

## Rollback and audit retrieval

- **Rollback**: Operational only; not part of the core security model. No audit-chain dependency for v1.
- **Audit read**: Single read path by date/range (e.g. Redis key `audit:YYYY-MM-DD`). No workflow-specific audit API required for v1.

## Config

- One env var for access: `ALLOWED_CALLERS` (optional). No full users/roles config for v1.
