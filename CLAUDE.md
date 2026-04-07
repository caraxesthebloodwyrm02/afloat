# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Afloat** is a no-fluff cognitive assistant micro-tool. Users describe what they're stuck on, get a short honest brief identifying the block type (meeting triage, priority decision, quick briefing, or context gate resolution), ask one follow-up, and the session ends. ~2 minute sessions.

**Version**: 0.1.1
**Stack**: Next.js 16 (App Router), React 19, TypeScript, Ollama-first routing with rare OpenAI lifeguard escalation, Upstash Redis, Stripe ($3/mo), JWT (jose), Vitest
**Node**: >=22.0.0
**Package Manager**: npm (not yarn, not pnpm)

## Commands

```bash
npm run dev          # Dev server
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest (run once)
npm run test:routing # Focused routing and request-contract suite
npm run test:watch   # Vitest (watch mode)
```

**Session start protocol** — run before writing any new code:

```bash
npm run test:routing && npm run lint
```

## Architecture

- **App Router**: All routes in `app/` (Next.js 16 conventions)
- **API Routes**: `app/api/` — all server-side logic, Stripe calls, auth
- **Auth**: JWT via `jose` — tokens are httpOnly cookies, refresh is server-side
- **Rate Limiting**: `@upstash/ratelimit` — never bypass or weaken limits
- **Validation**: `zod` schemas at all API boundaries (use `.strict()` at external boundaries)
- **Payments**: Stripe server-side only — never call Stripe from client code
- **Session Store**: Upstash Redis for ephemeral session data

## Code Standards

- TypeScript strict mode — no `any` types, explicit return types on exports
- React 19 functional components and hooks only
- TailwindCSS 4 for styling (no inline styles, no CSS modules)
- PascalCase for components (`Button.tsx`), camelCase for utils (`useSession.ts`)
- Named exports preferred over default exports

## Safety Rules

- Never weaken rate limiting or authentication checks
- Never expose API keys/tokens/secrets in client-side code
- Never log user-submitted text content (TC-05 compliance)
- Never use `eval()`, `new Function()`, or `dangerouslySetInnerHTML` with user content
- All billing mutations go through server-side API routes
- Verify webhook signatures on all Stripe webhook handlers
- Expired sessions must fail closed (deny access)

## Environment

14 required environment variables — see `.env.example`. Key notes:

- `OLLAMA_BASE_URL` is the default model endpoint
- `OPENAI_API_KEY` is optional and used only for rare lifeguard escalation
- `JWT_SECRET` and `PROVENANCE_SIGNING_KEY` must be different values
- `PHASE4_MESSAGE_CAPABILITY_ENABLED`: keep `false` for initial setup
- Stripe webhooks point to `/api/v1/webhooks/stripe`
