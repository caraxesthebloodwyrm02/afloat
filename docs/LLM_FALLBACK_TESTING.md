# LLM Routing Testing

**Date:** 2026-03-31
**Scope:** `src/lib/llm.ts`, `src/lib/session-message-request.ts`, `src/lib/session-message-adapter.ts`

## What The Router Does

The current `callLLMWithFallback()` path is no longer a fixed provider chain. It follows this shape:

1. Build a routing plan from task type, complexity, and scope
2. Discover Ollama models from `/api/tags`
3. Rank local candidates by scope, task, and consented routing memory
4. Try Ollama candidates first
5. Escalate to OpenAI only when:
   - `openai_override` is `"force"`, or
   - the request is deep-read, high-complexity, and local execution fails or produces a severe quality issue

## What We Test

The routing suite covers these cases:

| Test | What it proves |
|---|---|
| Ollama-first success | A discovered Ollama model is used before any escalation |
| 429 fallthrough | A rate-limited Ollama candidate falls through to the next local candidate |
| Bearer auth | `OLLAMA_API_KEY` is attached to both tags and generation calls |
| Custom-header raw token | `OLLAMA_AUTH_HEADER` and `OLLAMA_AUTH_SCHEME=none` work for gateway-style auth |
| Forced OpenAI rescue | `openai_override: "force"` jumps directly to the OpenAI lifeguard |
| Rare auto escalation | Deep-read, high-complexity failure can escalate automatically |
| Local-only guarantee | `openai_override: "never"` blocks escalation even when the request is complex |
| Routing-memory influence | A consented learned model is promoted in future candidate ordering |
| Adapter passthrough | The phase-4 adapter preserves routing context through both success and fallback branches |
| Route normalization | Invalid or missing runtime args normalize to the stable request contract |

## Request Contract Under Test

The public message route accepts:

```json
{
  "message": "Analyze the trade-offs here.",
  "history": [
    { "role": "assistant", "content": "Prior context." }
  ],
  "deep_read": true,
  "openai_override": "auto"
}
```

Normalization rules:

- `deep_read` defaults to `false`
- `openai_override` defaults to `"auto"`
- unknown `openai_override` values normalize to `"auto"`
- history is filtered to `user` and `assistant`, bounded to the last 4 entries, and truncated per entry
- `allow_routing_memory` is never client-provided; the server derives it from consent

## Commands

Focused routing verification:

```bash
npm run test:routing
```

Full regression pass:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:smoke
npm run build
```

## Operational Insight

The most important regression boundary is no longer “which cloud provider wins first.” It is whether the router preserves these invariants:

- local models do the heavy lifting by default
- request-time overrides are predictable
- consented routing memory influences ranking but never grants new capabilities
- OpenAI remains a rare, explicit rescue path rather than the default execution path
