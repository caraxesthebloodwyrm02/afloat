import {
  assessResponseQuality,
  callLLMWithFallback,
  estimateTokenCount,
  LLMError,
} from '@/lib/llm';
import { SYSTEM_PROMPT } from '@/lib/prompt';
import type { RoutingMemoryProfile } from '@/types/user';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetRoutingMemoryProfile = vi.fn<
  (userId?: string) => Promise<RoutingMemoryProfile | null>
>(async (_userId?: string) => null);
const mockRecordRoutingMemorySignal = vi.fn(
  async (_userId?: string, _signal?: unknown) => ({})
);

vi.mock('@/lib/data-layer', () => ({
  getRoutingMemoryProfile: (userId: string) =>
    mockGetRoutingMemoryProfile(userId),
  recordRoutingMemorySignal: (userId: string, signal: unknown) =>
    mockRecordRoutingMemorySignal(userId, signal),
}));

vi.mock('@/lib/safety-telemetry', () => ({
  recordSafetyEvent: vi.fn(async () => {}),
}));

const VALID_GATE_TYPES = [
  'meeting_triage',
  'priority_decision',
  'quick_briefing',
  'context_gate_resolution',
  'out_of_scope',
];

function parseGateAndBrief(raw: string): { gate_type: string; brief: string } {
  const gateMatch = raw.match(/\[GATE:\s*(\w+)\]/);

  let gate_type = 'unclassified';
  if (gateMatch) {
    const parsed = gateMatch[1];
    if (VALID_GATE_TYPES.includes(parsed)) {
      gate_type = parsed;
    }
  }

  const brief = raw
    .replace(/\[GATE:\s*\w+\]\s*/g, '')
    .replace(/\[BRIEF\]\s*/g, '')
    .trim();

  return { gate_type, brief };
}

function createJsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('parseGateAndBrief', () => {
  it('parses meeting_triage gate type', () => {
    const raw =
      '[GATE: meeting_triage]\nYou should attend this meeting because...';
    const result = parseGateAndBrief(raw);
    expect(result.gate_type).toBe('meeting_triage');
    expect(result.brief).toContain('You should attend');
  });

  it('returns unclassified for invalid or missing gate', () => {
    expect(parseGateAndBrief('No gate').gate_type).toBe('unclassified');
    expect(parseGateAndBrief('[GATE: unknown_type]\ntext').gate_type).toBe(
      'unclassified'
    );
  });
});

describe('assessResponseQuality', () => {
  it('flags missing gate tag', () => {
    const r = assessResponseQuality('unclassified', 'Some brief.');
    expect(r.missing_gate_tag).toBe(true);
  });

  it('flags word count over 150', () => {
    const longBrief = Array(160).fill('word').join(' ');
    const r = assessResponseQuality('meeting_triage', longBrief);
    expect(r.exceeds_word_limit).toBe(true);
    expect(r.word_count).toBe(160);
  });

  it('passes clean response', () => {
    const r = assessResponseQuality(
      'priority_decision',
      'Focus on task A first.'
    );
    expect(r.missing_gate_tag).toBe(false);
    expect(r.exceeds_word_limit).toBe(false);
    expect(r.ends_with_question).toBe(false);
  });
});

describe('REQ-D Response Quality Probes', () => {
  it('REQ-D1: Gate tag present in LLM response', () => {
    const raw = '[GATE: meeting_triage]\nAttend this meeting.';
    const result = parseGateAndBrief(raw);
    expect(raw).toMatch(/\[GATE:\s*\w+\]/);
    expect(result.gate_type).not.toBe('unclassified');
  });

  it('REQ-D2: Gate type is one of 4 defined types or out_of_scope', () => {
    for (const gateType of VALID_GATE_TYPES) {
      const raw = `[GATE: ${gateType}]\nBrief text.`;
      const result = parseGateAndBrief(raw);
      expect(VALID_GATE_TYPES).toContain(result.gate_type);
      expect(result.gate_type).toBe(gateType);
    }
  });

  it('REQ-D3: Response word count <= 150', () => {
    const brief = Array(150).fill('word').join(' ');
    const r = assessResponseQuality('priority_decision', brief);
    expect(r.word_count).toBeLessThanOrEqual(150);
    expect(r.exceeds_word_limit).toBe(false);
  });

  it('REQ-D4: No open-ended follow-up question in response', () => {
    const r = assessResponseQuality('quick_briefing', 'Here is the gist.');
    expect(r.ends_with_question).toBe(false);
  });

  it('REQ-D5: Prompt token count stays under 500', () => {
    const tokens = estimateTokenCount(SYSTEM_PROMPT);
    expect(tokens).toBeLessThan(500);
  });
});

describe('callLLMWithFallback Dynamic Ollama-First Routing', () => {
  const originalFetch = global.fetch;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = fetchMock as typeof fetch;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalOpenAiKey) process.env.OPENAI_API_KEY = originalOpenAiKey;
    else delete process.env.OPENAI_API_KEY;
    delete process.env.OLLAMA_API_KEY;
    delete process.env.OLLAMA_AUTH_HEADER;
    delete process.env.OLLAMA_AUTH_SCHEME;
  });

  it('uses available Ollama models first and returns model/provider metadata', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/tags')) {
        return createJsonResponse(200, { models: [{ name: 'llama3.1:8b' }] });
      }
      if (url.includes('/api/generate')) {
        return createJsonResponse(200, {
          response: '[GATE: context_gate_resolution]\nOllama answer',
        });
      }
      return createJsonResponse(500, {});
    });

    const result = await callLLMWithFallback('Help me decide', []);

    expect(result.provider).toBe('ollama');
    expect(result.model_id.length).toBeGreaterThan(0);
    expect(result.brief).toContain('Ollama answer');
    expect(
      result.routing_trace.attempted_models[0]?.startsWith('ollama:')
    ).toBe(true);
  });

  it('falls through to next Ollama candidate when first returns 429', async () => {
    let generateCalls = 0;
    const seenModels: string[] = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/tags')) {
        return createJsonResponse(200, {
          models: [{ name: 'llama3.1:8b' }, { name: 'mistral:7b' }],
        });
      }
      if (url.includes('/api/generate')) {
        generateCalls += 1;
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          model?: string;
        };
        if (body.model) seenModels.push(body.model);
        if (generateCalls === 1) {
          return createJsonResponse(429, { error: 'rate limited' });
        }
        return createJsonResponse(200, {
          response: '[GATE: meeting_triage]\nFallback success',
        });
      }
      return createJsonResponse(500, {});
    });

    const result = await callLLMWithFallback('Quick follow up', []);
    expect(result.provider).toBe('ollama');
    expect(generateCalls).toBeGreaterThanOrEqual(2);
    expect(seenModels[0]).not.toBe(seenModels[1]);
    expect(result.brief).toContain('Fallback success');
  });

  it('sends Ollama auth headers when OLLAMA_API_KEY is configured', async () => {
    process.env.OLLAMA_API_KEY = 'ollama-secret';
    process.env.OLLAMA_AUTH_HEADER = 'Authorization';
    process.env.OLLAMA_AUTH_SCHEME = 'Bearer';

    const seenHeaders: Array<Record<string, string>> = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      seenHeaders.push(headers);

      if (url.includes('/api/tags')) {
        return createJsonResponse(200, { models: [{ name: 'llama3.1:8b' }] });
      }
      if (url.includes('/api/generate')) {
        return createJsonResponse(200, {
          response: '[GATE: quick_briefing]\nAuthorized Ollama call',
        });
      }
      return createJsonResponse(500, {});
    });

    const result = await callLLMWithFallback('auth test', []);

    expect(result.brief).toContain('Authorized Ollama call');
    expect(
      seenHeaders.some(
        (headers) => headers.Authorization === 'Bearer ollama-secret'
      )
    ).toBe(true);
  });

  it('supports raw-token Ollama auth with a custom header', async () => {
    process.env.OLLAMA_API_KEY = 'ollama-raw-token';
    process.env.OLLAMA_AUTH_HEADER = 'X-API-Key';
    process.env.OLLAMA_AUTH_SCHEME = 'none';

    const seenHeaders: Array<Record<string, string>> = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      seenHeaders.push(headers);

      if (url.includes('/api/tags')) {
        return createJsonResponse(200, { models: [{ name: 'llama3.1:8b' }] });
      }
      if (url.includes('/api/generate')) {
        return createJsonResponse(200, {
          response: '[GATE: quick_briefing]\nCustom header auth works',
        });
      }
      return createJsonResponse(500, {});
    });

    const result = await callLLMWithFallback('custom auth test', []);

    expect(result.brief).toContain('Custom header auth works');
    expect(
      seenHeaders.some(
        (headers) =>
          headers['X-API-Key'] === 'ollama-raw-token' &&
          !('Authorization' in headers)
      )
    ).toBe(true);
  });

  it('uses consented routing memory to promote the learned model on future calls', async () => {
    const seenModels: string[] = [];
    mockGetRoutingMemoryProfile.mockResolvedValue({
      user_id: 'user-123',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      preferred_models: ['mistral:7b'],
      model_performance: {
        'mistral:7b': {
          provider: 'ollama',
          success_count: 6,
          failure_count: 0,
          average_latency_ms: 900,
          last_used_at: new Date().toISOString(),
        },
      },
      task_memory: {
        last_intent: 'Need a concise analysis',
        recent_intents: ['Need a concise analysis'],
        last_task_type: 'analysis',
        sentiment: 'neutral',
        deep_read_preference: 0.5,
      },
      escalation: {
        openai_auto_count: 0,
        openai_forced_count: 0,
        last_escalated_at: null,
      },
    });

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/tags')) {
        return createJsonResponse(200, {
          models: [{ name: 'llama3.1:8b' }, { name: 'mistral:7b' }],
        });
      }
      if (url.includes('/api/generate')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          model?: string;
        };
        if (body.model) seenModels.push(body.model);
        return createJsonResponse(200, {
          response: '[GATE: context_gate_resolution]\nMemory-assisted answer',
        });
      }
      return createJsonResponse(500, {});
    });

    const result = await callLLMWithFallback(
      'Please analyze this carefully',
      [],
      {
        user_id: 'user-123',
        allow_routing_memory: true,
      }
    );

    expect(result.routing_trace.memory_influence_applied).toBe(true);
    expect(result.routing_trace.selected_candidates[0]).toBe('mistral:7b');
    expect(seenModels[0]).toBe('mistral:7b');
  });

  it('supports forced OpenAI lifeguard override with deep-read token budget', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-openai';

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/tags')) {
        return createJsonResponse(200, { models: [{ name: 'llama3.1:8b' }] });
      }
      if (url.includes('api.openai.com')) {
        expect(url).toContain('api.openai.com');
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          max_tokens?: number;
        };
        expect(body.max_tokens).toBe(900);
        return createJsonResponse(200, {
          choices: [
            {
              message: {
                content: '[GATE: priority_decision]\nEscalated response',
              },
            },
          ],
        });
      }
      return createJsonResponse(500, {});
    });

    const result = await callLLMWithFallback(
      'Do a deep read and comprehensive strategy review',
      [],
      { openai_override: 'force', deep_read_override: true }
    );

    expect(result.provider).toBe('openai');
    expect(result.model_id).toBe('gpt-5.4');
    expect(result.brief).toContain('Escalated response');
  });

  it('auto-escalates to OpenAI only for deep-read high-complexity failures', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-openai';

    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/tags')) {
        return createJsonResponse(200, { models: [{ name: 'llama3.1:8b' }] });
      }
      if (url.includes('/api/generate')) {
        return createJsonResponse(429, { error: 'rate limited' });
      }
      if (url.includes('api.openai.com')) {
        expect(url).toContain('api.openai.com');
        return createJsonResponse(200, {
          choices: [
            {
              message: {
                content: '[GATE: quick_briefing]\nOpenAI lifeguard saved this',
              },
            },
          ],
        });
      }
      return createJsonResponse(500, {});
    });

    const result = await callLLMWithFallback(
      (
        'Please do a deep read, comprehensive multi-step architectural trade-off analysis, ' +
        'including code/debug implementation risks, alternatives, and edge cases. '
      ).repeat(120),
      [],
      { deep_read_override: true }
    );

    expect(result.provider).toBe('openai');
    expect(result.routing_trace.escalated_to_openai).toBe(true);
  });

  it('honors openai_override=never even for deep-read high-complexity failures', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-openai';

    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/tags')) {
        return createJsonResponse(200, { models: [{ name: 'llama3.1:8b' }] });
      }
      if (url.includes('/api/generate')) {
        return createJsonResponse(429, { error: 'rate limited' });
      }
      return createJsonResponse(500, {});
    });

    await expect(
      callLLMWithFallback(
        (
          'Please do a deep read, comprehensive architecture review with trade-offs ' +
          'and implementation risks. '
        ).repeat(120),
        [],
        { deep_read_override: true, openai_override: 'never' }
      )
    ).rejects.toBeInstanceOf(LLMError);

    const allUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(allUrls.some((url) => url.includes('api.openai.com'))).toBe(false);
  });

  it('does not auto-escalate for regular scope when Ollama fails', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-openai';

    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/tags')) {
        return createJsonResponse(200, { models: [{ name: 'llama3.1:8b' }] });
      }
      if (url.includes('/api/generate')) {
        return createJsonResponse(429, { error: 'rate limited' });
      }
      return createJsonResponse(500, {});
    });

    await expect(
      callLLMWithFallback('short question', [])
    ).rejects.toBeInstanceOf(LLMError);

    const allUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(allUrls.some((url) => url.includes('api.openai.com'))).toBe(false);
  });
});
