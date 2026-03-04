# Safety & Security Rules

Applies to: all files, with special attention to `app/api/**`, `lib/**`

See **docs/SAFETY_CORE.md** for the sanitized safety model: one gate (`runSafetyPipeline`), one audit write (`writeAuditLog`), minimal access (allowlist via `isAllowedCaller`). No second TrustLayer; all enforcement in-process (tool-call free).

## Golden Rules

- **Never** weaken rate limiting or authentication checks
- **Never** expose API keys, tokens, or secrets in client-side code
- **Never** log user-submitted text content (TC-05 compliance)
- **Never** add bypass paths or "dev mode" shortcuts to auth flows
- **Always** validate and sanitize all user input at API boundaries

## Input Validation

- All API route handlers must validate request bodies with zod before processing
- Reject unexpected fields — use `.strict()` on zod schemas at external boundaries
- Sanitize any user text before rendering (React handles most XSS, but verify dynamic content)

## Stripe Integration

- All billing mutations must go through server-side API routes — never call Stripe from client
- Verify webhook signatures on all Stripe webhook handlers
- Never store raw card numbers or PII beyond what Stripe provides
- Test billing flows with Stripe test mode keys only

## Session & Auth

- Session tokens via `jose` — never store sensitive data in localStorage
- Keep session data minimal: user ID, role, expiry
- Token refresh must happen server-side
- Expired sessions must fail closed (deny access, not degrade gracefully)

## Injection Resistance

- Never use `eval()`, `new Function()`, or `dangerouslySetInnerHTML` with user content
- Never interpolate user input into SQL, shell commands, or dynamic imports
- API routes must not pass user input to `fetch()` URLs without allowlist validation
