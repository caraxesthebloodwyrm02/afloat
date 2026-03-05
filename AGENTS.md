# AGENTS.md — AI Agent Guidelines for Afloat

> Guidelines for AI agents (Cursor, Copilot, Claude, etc.) working in this codebase.

## Build, Test, and Development Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server (localhost:3000) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run test` | Run full Vitest suite |
| `npm run test:watch` | Run tests in watch mode |
| `npx vitest run src/path/to/test.test.ts` | Run single test file |
| `npx vitest run -t "test name"` | Run single test by name |

### Running Tests by Pattern

```bash
# Tests matching pattern
npx vitest run -k "session"

# By file
npx vitest run tests/session.test.ts

# With coverage
npm run test -- --coverage
```

---

## Code Style Guidelines

### TypeScript (Strict Mode)

- **No `any` types** — use `unknown` with proper narrowing
- **Explicit return types** on exported functions
- **No `as` casts** — use type guards or Zod parsing instead

### Imports

```typescript
// ✓ Absolute imports
import { getUser } from "@/lib/data-layer";
import type { SessionLog } from "@/types/session";

// ✗ No relative imports across modules
// ✗ No wildcard imports
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `ChatWindow.tsx` |
| Utils/hooks | camelCase | `useSession.ts` |
| Types | PascalCase | `type SessionLog` |
| Constants | UPPER_SNAKE_CASE | `MAX_HISTORY_ENTRIES` |
| Private methods | `_prefixedCamelCase` | `_cleanup()` |

### Formatting

- **Formatter**: ESLint + Prettier (via `npm run lint`)
- **Line length**: 120 characters
- **Indentation**: 2 spaces ( ESLint config )
- **Semicolons**: Required
- **Quotes**: Double quotes for strings

### Error Handling

```typescript
// ✓ Proper error handling with typed errors
try {
  await riskyOperation();
} catch (err) {
  if (err instanceof LLMError) {
    // Handle typed error
  }
  // Always re-throw or handle unknown errors
}

// ✗ Never swallow errors silently
// ✗ Never use console.log for errors in production
```

### React Components

- **Functional components only** — no class components
- **Hooks** for all logic — `useState`, `useEffect`, `useCallback`, `useMemo`
- **No inline styles** — use TailwindCSS classes
- **Co-located tests**: `Component.test.tsx` next to component

### API Routes

- **Location**: `src/app/api/`
- **Validation**: Use Zod schemas with `.strict()` at external boundaries
- **Response**: Return typed responses with proper HTTP status codes
- **No secrets in responses**: Never return API keys or tokens

---

## Architecture Summary

```
src/
├── app/              # Next.js 16 App Router
│   ├── api/v1/      # 14 API endpoints
│   ├── chat/        # Subscriber chat UI
│   ├── consent/     # Consent management
│   └── subscribe/   # Stripe checkout flow
├── components/       # React components
├── lib/              # Server-side logic
│   ├── llm.ts           # Multi-provider LLM fallback
│   ├── session-controller.ts  # Turn/timer enforcement
│   ├── safety-pipeline.ts     # Unified safety interface
│   ├── safety.ts        # PII detection, content filtering
│   ├── auth.ts          # JWT creation/verification (jose)
│   ├── secrets.ts       # Secret governance (two-step validation)
│   ├── data-layer.ts    # Session logs, user store
│   └── provenance/      # Decision audit trail (DPR chain)
└── types/            # TypeScript definitions
```

---

## Key Patterns

### Multi-Provider LLM Fallback

- `buildProviders()` — registers providers based on env vars (OPENAI_API_KEY, GROQ_API_KEY, GEMINI_API_KEY)
- `callLLMWithFallback()` — tries providers in rank order: OpenAI → Groq → Gemini
- `classifyError()` — normalizes SDK errors into `LLMError` with reasons: `timeout`, `rate_limited`, `server_error`, `unknown`

### Session Constraints

- **Trial tier**: 2 turns, 120 seconds max
- **Continuous tier**: 6 turns, 30 minutes max
- **Word limit**: 150 words per response
- **Privacy**: Conversation history never persisted to disk

### Safety Pipeline

```
Input → Auth → Rate Limit → Session Lock → Pre-Check → PII Detection → Content Filter → LLM
```

### Secret Governance (Two-Step)

1. **Step 1 (Entry)**: `instrumentation.ts` runs `enforceSecretGovernance()` at startup — validates all secrets exist, meet complexity, cross-check JWT_SECRET ≠ PROVENANCE_SIGNING_KEY
2. **Step 2 (Cleanup)**: `scrubSecrets()` called on SIGTERM/SIGINT/uncaughtException

---

## Project-Specific Rules

### Safety Engineering

- **Never** use First Person ("I", "We") or Second Person ("You") pronouns in safety patterns
- **Never** log user-submitted text content (TC-05 compliance)
- Use abstract nouns for harmful actions (e.g., "sexual violence" not "raping")
- Distress signals (suicide, self-harm) → trigger care pathways, NOT blocking
- Malicious threats → blocking and audit

### Technical Safeguards

- **Fail-closed**: Safety exceptions should deny, not allow
- **Provenance**: All decisions tracked with HMAC-signed DPR chains
- **No conversation persistence**: Strip history before Redis writes
- **Never** weaken rate limiting or authentication checks

### Environment Variables

Required (14 total):
- `OPENAI_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY` — LLM providers (at least one)
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — Session store
- `JWT_SECRET`, `PROVENANCE_SIGNING_KEY` — Auth (must differ)
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `STRIPE_CONTINUOUS_PRICE_ID`, `STRIPE_METER_EVENT_NAME` — Payment
- `CRON_SECRET` — Cron job auth
- `NEXT_PUBLIC_APP_URL` — App URL
- `PHASE4_MESSAGE_CAPABILITY_ENABLED` — Feature flag
- `ALLOWED_CALLERS` — Access control allowlist (optional; comma-separated user_ids)

---

## CI/CD Pipeline

- **Trigger**: Push to any branch (docs-only paths ignored)
- **Quality Gate**: lint → test → build
- **Preview Deploy**: Non-main branches → Vercel preview
- **Production Deploy**: main branch → Vercel production

---

## Testing

- **Framework**: Vitest
- **Location**: `tests/` directory
- **Single test**: `npx vitest run tests/session.test.ts`
- **By name**: `npx vitest run -t "test name"`

---

## File References

- Environment template: `.env.example`
- Architecture docs: `docs/`
- Contract spec: `contract.json`, `contract.hardened.json`
- Claude rules: `.claude/rules/`
