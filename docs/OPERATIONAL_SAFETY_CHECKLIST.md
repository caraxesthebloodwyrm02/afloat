# Operational safety checklist

Use this checklist in PRs that touch auth, audit, or execution paths.

## Before merge

- [ ] **Auth**: Protected routes use `requireAuth(request)` (not raw `authenticateRequest`) so allowlist (`ALLOWED_CALLERS`) is enforced when set.
- [ ] **Audit**: State-changing actions call `auditAction(request, user, { ... })` or `writeAuditLog` (single write path). No ad-hoc logging that bypasses it.
- [ ] **Tool execution** (if added): Any new tool or subprocess execution must go through a single **tool gate** that logs via `writeAuditLog` (e.g. action `tool_execution_request` and outcome). No `eval`, `Function()`, or `child_process.exec` with user-supplied strings.
- [ ] **Secrets**: No secrets in repo; `.env*` and secret patterns remain in `.gitignore`.
- [ ] **Debug and observability**: No debug endpoints or verbose logging enabled in production unless explicitly gated. `console.log`/`console.warn` in app code are intentional (e.g. instrumentation, secrets governance) and do not log secret values.

## Reference

- Safety model: `docs/SAFETY_CORE.md`
- Access control: `src/lib/access.ts` (`isAllowedCaller`)
