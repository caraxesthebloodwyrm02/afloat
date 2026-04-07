# AGENTS.md — AI Agent Guidelines for Afloat

> Guidelines for AI agents (Cursor, Copilot, Claude, etc.) working in this codebase.

Workspace baseline for shared guardrails and repo hygiene: `E:\Seeds\ECOSYSTEM_BASELINE.md`.

## Build, Test, and Development Commands

| Command                                   | Purpose                                             |
| ----------------------------------------- | --------------------------------------------------- |
| `npm run dev`                             | Start dev server (localhost:3000)                   |
| `npm run build`                           | Production build                                    |
| `npm run start`                           | Start production server                             |
| `npm run lint`                            | Run ESLint                                          |
| `npm run test`                            | Run full Vitest suite                               |
| `npm run test:routing`                    | Run routing, adapter, and request-contract coverage |
| `npm run test:watch`                      | Run tests in watch mode                             |
| `npx vitest run src/path/to/test.test.ts` | Run single test file                                |
| `npx vitest run -t "test name"`           | Run single test by name                             |

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

## Routine Execution

Follow this sequence so work is consistent and verifiable. Baseline pattern: [GRID-main `.cursor/commands/workspace.md`](../../GRID-main/.cursor/commands/workspace.md).

### Session start

From Afloat repo root, with dependencies installed (`npm install`), run before writing new code:

```bash
npm run test:routing && npm run lint
```

### Session kickoff (example)

```md
- Repo/Path: E:\Seeds\afloat
- Branch/Worktree: main
- Task: One-sentence objective
- Done When: Completion criteria
- Constraints: Risk notes
- Verify With: npm run test && npm run lint
```

### One-shot verify / Before push

From repo root: `npm run lint && npm run typecheck && npm run test:routing && npm run test`. Run after changes and again before pushing.

### Routines and directory structure

| Area                               | When to run                            | Notes                                |
| ---------------------------------- | -------------------------------------- | ------------------------------------ |
| `src/app/api/`                     | Full verify (test + lint)              | API tests in `tests/` or colocated   |
| `src/lib/`                         | Tests covering affected modules + lint | See "Running Tests by Pattern" above |
| `src/app/` (UI), `src/components/` | Test + lint                            | Prefer colocated `*.test.ts(x)`      |

Use the same commands for single-file or pattern runs (e.g. `npx vitest run -k "session"`, `npx vitest run tests/session.test.ts`) as in the Build, Test, and Development Commands section.

**Example — adding a new API route:** (1) Session start, (2) Implement in `src/app/api/`, (3) Add or update test in `tests/` or next to route, (4) Verify with `npm run test && npm run lint`.

---

## Code Style Guidelines

### TypeScript (Strict Mode)

- **No `any` types** — use `unknown` with proper narrowing
- **Explicit return types** on exported functions
- **No `as` casts** — use type guards or Zod parsing instead

### Imports

```typescript
// ✓ Absolute imports
import { getUser } from '@/lib/data-layer';
import type { SessionLog } from '@/types/session';

// ✗ No relative imports across modules
// ✗ No wildcard imports
```

### Naming Conventions

| Type            | Convention           | Example               |
| --------------- | -------------------- | --------------------- |
| Components      | PascalCase           | `ChatWindow.tsx`      |
| Utils/hooks     | camelCase            | `useSession.ts`       |
| Types           | PascalCase           | `type SessionLog`     |
| Constants       | UPPER_SNAKE_CASE     | `MAX_HISTORY_ENTRIES` |
| Private methods | `_prefixedCamelCase` | `_cleanup()`          |

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
│   ├── llm.ts           # Ollama-first routing + rare OpenAI lifeguard
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

### Ollama-First Routing

- `callLLMWithFallback()` — derives a routing plan from task type, complexity, and scope
- `fetchOllamaCatalog()` — discovers local or remote Ollama models via `/api/tags`
- `selectOllamaCandidates()` — ranks candidates using scope, task, and consented routing-memory influence
- `buildLLMRoutingContext()` — derives `allow_routing_memory`, `deep_read_override`, and `openai_override` from the server-side request context
- `classifyError()` — normalizes provider errors into `LLMError` with reasons: `timeout`, `rate_limited`, `server_error`, `unknown`
- OpenAI is a rare lifeguard only: forced with `openai_override: "force"` or auto-selected only for deep-read, high-complexity failures

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

- `OLLAMA_BASE_URL` — Ollama endpoint
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — Session store
- `JWT_SECRET`, `PROVENANCE_SIGNING_KEY` — Auth (must differ)
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `STRIPE_CONTINUOUS_PRICE_ID`, `STRIPE_METER_EVENT_NAME` — Payment
- `CRON_SECRET` — Cron job auth
- `NEXT_PUBLIC_APP_URL` — App URL
- `PHASE4_MESSAGE_CAPABILITY_ENABLED` — Feature flag
- `ALLOWED_CALLERS` — Access control allowlist (optional; comma-separated user_ids)

---

Optional routing env vars:

- `OLLAMA_API_KEY`, `OLLAMA_AUTH_HEADER`, `OLLAMA_AUTH_SCHEME` — Authenticated Ollama gateways
- `OPENAI_API_KEY` — Rare OpenAI lifeguard escalation
- `OPENAI_LIFEGUARD_ENABLED`, `OPENAI_LIFEGUARD_MODEL` — Lifeguard warnings and model override

Runtime message args for agents and tooling:

- `deep_read: boolean` — Prefer deeper local-model analysis
- `openai_override: "auto" | "force" | "never"` — Escalation policy
- `allow_routing_memory` is never caller-controlled; it is derived from server-side consent

Example:

```json
{
  "message": "Do a deep read on the deployment trade-offs.",
  "deep_read": true,
  "openai_override": "auto"
}
```

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
