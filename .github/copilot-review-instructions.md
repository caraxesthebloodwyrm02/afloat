# Copilot Code Review Instructions — Afloat

## Code Quality

- No `any` types in TypeScript.
- Zod validation at all input boundaries.
- Server-side only for sensitive operations (Stripe, auth).

## Security

- Rate limiting must not be weakened.
- Flag any secret/credential patterns.
- Verify rollback plan for data model changes.

## Shared Rules

- Flag scope expansion beyond PR description.
- Check dependency justification.
- Conventional commits.
