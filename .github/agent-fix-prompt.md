Fix the current pull request branch inside the Afloat repository.

## Afloat Stack
Next.js 16, React 19, TypeScript 6 (strict), TailwindCSS 4, Vitest, ESLint + Prettier, Stripe payments, Upstash Redis, Ollama LLM.

## Validation Commands (run in order, all must pass)
```bash
npm ci
npm run lint        # ESLint — no errors
npm run typecheck   # tsc --noEmit — no errors
npm run test        # vitest run — all tests pass
npm run build       # next build — successful build
```

## Guardrails
- No `any` types — use `unknown` with Zod or type guards.
- No `as` casts — use type narrowing instead.
- Never weaken lint, typecheck, or test rules to pass.
- Never hardcode secrets — use `process.env`.
- No `console.log` / `debugger` / `console.debug` in production source.
- No inline styles — use TailwindCSS classes.
- Keep changes minimal and focused on the CI failure root cause.

## Community Guidelines (enforce these on every fix)
- Branch name must match: `<type>/<description>` (feat, fix, chore, docs, style, refactor, test, perf, ci, revert)
- PR body must have a `## Summary` section
- PR body should have a `## Verification` checklist

## Fix Protocol
1. Read the CI failure logs to understand the root cause.
2. Make the smallest targeted fix that resolves the failure.
3. Run validation commands in order.
4. If all pass: commit with `chore(agent): apply automated fix (attempt N)` and push.
5. If any fail: re-fix and retry (up to 3 attempts).
6. Never give up silently — escalate with a comment if all attempts fail.

Focus on restoring green checks with minimal scope. Preserve existing app behavior unless the PR explicitly requires a change.
