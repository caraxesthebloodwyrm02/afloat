# Standards (Next.js + React + TypeScript)

Applies to: `src/**`, `app/**`, `components/**`, `lib/**`

## Stack

- Next.js 16 (App Router)
- React 19 with functional components and hooks only
- TypeScript strict mode — no `any` types, explicit return types on exported functions
- TailwindCSS 4 for all styling (no inline styles, no CSS modules)
- Vitest for testing
- npm as package manager (not yarn, not pnpm)

## Dev Commands

- Dev server: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
- Test: `npm run test`
- Test watch: `npm run test:watch`

## Conventions

- File naming: PascalCase for components (`Button.tsx`), camelCase for utils (`useSession.ts`)
- Named exports preferred over default exports
- Use `zod` for runtime validation at API boundaries
- Use `jose` for JWT handling — never roll custom token logic
- Rate limiting via `@upstash/ratelimit` — never bypass or weaken limits

## API Routes

- All API routes in `app/api/`
- Return typed responses with proper HTTP status codes
- Validate all request bodies with zod schemas before processing
