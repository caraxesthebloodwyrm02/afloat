# Afloat Copilot Instructions

## Review Guardrails

- TypeScript strict mode: no `any`, no `as` casts — use `unknown` with Zod or type guards.
- Explicit return types on exported functions.
- No inline styles — use TailwindCSS classes.
- Never return API keys, tokens, or secrets in API responses.
- Validate external input with Zod `.strict()` at API route boundaries.
- Prefer the smallest change that keeps `npm run check` green.
- Do not weaken CI, coverage, or security checks to make a change pass.
- Treat `.github/`, `scripts/`, and deployment files as high risk.

## Stack

Next.js 16, React 19, TypeScript 5 (strict), TailwindCSS 4, Vitest, ESLint + Prettier, Vercel deployment.
Auth via `jose` (JWT). Payments via Stripe. Rate limiting via Upstash Redis.
LLM: multi-provider fallback (Google Generative AI, Groq, OpenAI) in `src/lib/llm.ts`.

## Commands

```bash
npm run dev          # localhost:3000
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run test         # vitest run
npm run check        # lint + typecheck + test:coverage + build
```

## Architecture

- `src/app/api/v1/` — 14 API endpoints (Zod validation, typed responses).
- `src/lib/safety*.ts` — PII detection, content filtering. Changes require tests.
- `src/lib/auth.ts` — JWT via jose. Do not weaken verification or token scoping.
- `src/lib/secrets.ts` — Two-step secret validation. Do not bypass.
- `src/components/` — Functional components only, hooks for logic, co-located tests.

## Secrets & Environment

- Secrets via env vars only. Never hardcode Vercel or scheduling credentials.
- `vercel.json` at project root controls deployment.
