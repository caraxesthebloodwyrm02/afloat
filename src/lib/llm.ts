import type { GateType } from '@/types/session';
import {
  recordRoutingMemorySignal,
  getRoutingMemoryProfile,
} from './data-layer';
import { SYSTEM_PROMPT } from './prompt';
import { recordSafetyEvent } from './safety-telemetry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LLMRoutingContext {
  user_id?: string;
  allow_routing_memory?: boolean;
  deep_read_override?: boolean;
  openai_override?: 'auto' | 'force' | 'never';
}

type ProviderType = 'ollama' | 'openai';
type TaskType = 'coding' | 'analysis' | 'quick' | 'general';
type RoutingScope = 'fast' | 'balanced' | 'deep_read';

export interface LLMRoutingTrace {
  task_type: TaskType;
  scope: RoutingScope;
  complexity_score: number;
  openai_policy: 'auto' | 'force' | 'never';
  attempted_models: string[];
  selected_candidates: string[];
  memory_influence_applied: boolean;
  escalated_to_openai: boolean;
}

export interface LLMResponse {
  gate_type: GateType;
  brief: string;
  raw: string;
  provider: ProviderType;
  model_id: string;
  model_parameters: Record<string, unknown>;
  routing_trace: LLMRoutingTrace;
}

export interface ResponseQualityFlags {
  missing_gate_tag: boolean;
  exceeds_word_limit: boolean;
  word_count: number;
  ends_with_question: boolean;
}

export class LLMError extends Error {
  reason: 'timeout' | 'rate_limited' | 'server_error' | 'unknown';

  constructor(message: string, reason: LLMError['reason']) {
    super(message);
    this.name = 'LLMError';
    this.reason = reason;
  }
}

interface ModelCandidate {
  provider: ProviderType;
  model: string;
  quality: number;
  speed: number;
  reasoning: number;
  coding: number;
}

interface RoutingPlan {
  task_type: TaskType;
  scope: RoutingScope;
  complexity_score: number;
  openai_policy: 'auto' | 'force' | 'never';
}

interface ProviderAttempt {
  provider: ProviderType;
  model: string;
  parameters: Record<string, unknown>;
  call: (
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  ) => Promise<string>;
}

interface OllamaTagsResponse {
  models?: Array<{ name?: string }>;
}

// ---------------------------------------------------------------------------
// Parsing & quality
// ---------------------------------------------------------------------------

const VALID_GATE_TYPES: GateType[] = [
  'meeting_triage',
  'priority_decision',
  'quick_briefing',
  'context_gate_resolution',
  'out_of_scope',
];

const DEFAULT_OLLAMA_MODELS = [
  'llama3.1:70b',
  'mixtral:8x7b',
  'qwen2.5:72b',
  'llama3.1:8b',
  'gemma2:9b',
  'qwen2.5:7b',
  'mistral:7b',
  'qwen2.5-coder:7b',
  'deepseek-coder-v2:16b',
  'codellama',
  'gemma2:2b',
  'llama3.2:3b',
  'phi3:mini',
];

const CATALOG_CACHE_TTL_MS = 60_000;

let cachedCatalog: { expires_at: number; models: string[] } | null = null;

function getOllamaHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const apiKey = process.env.OLLAMA_API_KEY?.trim();
  if (!apiKey) {
    return headers;
  }

  const headerName = process.env.OLLAMA_AUTH_HEADER?.trim() || 'Authorization';
  const authScheme = process.env.OLLAMA_AUTH_SCHEME?.trim() || 'Bearer';
  headers[headerName] =
    authScheme.toLowerCase() === 'none' ? apiKey : `${authScheme} ${apiKey}`;

  return headers;
}

function parseGateAndBrief(raw: string): {
  gate_type: GateType;
  brief: string;
} {
  const gateMatch = raw.match(/\[GATE:\s*(\w+)\]/);

  let gate_type: GateType = 'unclassified';
  if (gateMatch) {
    const parsed = gateMatch[1] as GateType;
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

/**
 * Heuristic token count for GPT models (~4 chars per token for English).
 * Used for REQ-D5: SYSTEM_PROMPT must stay under 500 tokens.
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

export function assessResponseQuality(
  gateType: GateType,
  brief: string
): ResponseQualityFlags {
  const wordCount = brief.split(/\s+/).filter(Boolean).length;
  return {
    missing_gate_tag: gateType === 'unclassified',
    exceeds_word_limit: wordCount > 150,
    word_count: wordCount,
    ends_with_question: brief.trimEnd().endsWith('?'),
  };
}

// ---------------------------------------------------------------------------
// Routing intelligence
// ---------------------------------------------------------------------------

function normalizeModelName(name: string): string {
  return name.trim().toLowerCase();
}

function parseBillionSize(modelName: string): number {
  const clean = modelName.toLowerCase();
  const moe = clean.match(/(\d+)x(\d+(?:\.\d+)?)b/);
  if (moe) {
    return Number.parseFloat(moe[1]) * Number.parseFloat(moe[2]);
  }

  const match = clean.match(/(\d+(?:\.\d+)?)b/);
  if (match) {
    return Number.parseFloat(match[1]);
  }

  if (clean.includes('mini')) return 3;
  return 7;
}

function getModelCandidate(model: string): ModelCandidate {
  const normalized = normalizeModelName(model);
  const sizeB = parseBillionSize(normalized);
  const isCoder =
    normalized.includes('coder') || normalized.includes('codellama');
  const isLarge = sizeB >= 65;
  const isTiny = sizeB <= 4;

  const quality = Math.min(100, 40 + sizeB * 0.8 + (isCoder ? 4 : 0));
  const speed = Math.max(10, 95 - sizeB * 1.2);
  const reasoning = Math.min(
    100,
    35 + sizeB + (normalized.includes('qwen') ? 6 : 0)
  );
  const coding = Math.min(
    100,
    (isCoder ? 70 : 30) +
      (normalized.includes('qwen') ? 10 : 0) +
      (normalized.includes('deepseek') ? 10 : 0)
  );

  if (isLarge) {
    return {
      provider: 'ollama',
      model,
      quality: Math.max(quality, 92),
      speed: Math.min(speed, 35),
      reasoning: Math.max(reasoning, 92),
      coding,
    };
  }

  if (isTiny) {
    return {
      provider: 'ollama',
      model,
      quality: Math.min(quality, 70),
      speed: Math.max(speed, 82),
      reasoning: Math.min(reasoning, 70),
      coding,
    };
  }

  return {
    provider: 'ollama',
    model,
    quality,
    speed,
    reasoning,
    coding,
  };
}

function detectTaskType(userMessage: string): TaskType {
  const text = userMessage.toLowerCase();
  if (
    /code|debug|bug|refactor|typescript|javascript|python|stack trace|compile|test/i.test(
      text
    )
  ) {
    return 'coding';
  }
  if (
    /analy[sz]e|compare|trade-?off|architecture|strategy|root cause|why|evaluate/i.test(
      text
    )
  ) {
    return 'analysis';
  }
  if (/quick|brief|tl;dr|one line|short answer|fast/i.test(text)) {
    return 'quick';
  }
  return 'general';
}

function detectSentiment(
  userMessage: string
): 'positive' | 'neutral' | 'frustrated' {
  const text = userMessage.toLowerCase();
  if (/stuck|urgent|blocked|frustrat|annoy|broken|failing|hate/i.test(text)) {
    return 'frustrated';
  }
  if (/great|thanks|awesome|good|perfect|nice/i.test(text)) {
    return 'positive';
  }
  return 'neutral';
}

function computeComplexityScore(
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  deepReadOverride: boolean
): number {
  let score = 20;
  score += Math.min(35, Math.floor(userMessage.length / 90));
  score += Math.min(20, conversationHistory.length * 4);

  if (
    /step by step|detailed|deep read|full analysis|exhaustive|comprehensive/i.test(
      userMessage
    )
  ) {
    score += 20;
  }
  if (
    /compare|architecture|multi-step|trade-?off|evaluate/i.test(userMessage)
  ) {
    score += 15;
  }
  if (/code|debug|refactor|implement|fix|test/i.test(userMessage)) {
    score += 10;
  }
  if (deepReadOverride) {
    score = Math.max(score, 85);
  }

  return Math.min(100, score);
}

function deriveRoutingPlan(
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  routingContext?: LLMRoutingContext
): RoutingPlan {
  const deepReadOverride = Boolean(routingContext?.deep_read_override);
  const complexity = computeComplexityScore(
    userMessage,
    conversationHistory,
    deepReadOverride
  );

  let scope: RoutingScope = 'balanced';
  if (deepReadOverride || complexity >= 80) {
    scope = 'deep_read';
  } else if (complexity <= 35 || /quick|brief|fast|short/i.test(userMessage)) {
    scope = 'fast';
  }

  return {
    task_type: detectTaskType(userMessage),
    scope,
    complexity_score: complexity,
    openai_policy: routingContext?.openai_override ?? 'auto',
  };
}

async function fetchOllamaCatalog(): Promise<string[]> {
  const now = Date.now();
  if (cachedCatalog && cachedCatalog.expires_at > now) {
    return cachedCatalog.models;
  }

  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      headers: getOllamaHeaders(),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Ollama tags endpoint failed with status ${response.status}`,
        {
          cause: { status: response.status },
        }
      );
    }

    const data = (await response.json()) as OllamaTagsResponse;
    const discovered = (data.models ?? [])
      .map((entry) => entry.name)
      .filter(
        (name): name is string =>
          typeof name === 'string' && name.trim().length > 0
      )
      .map((name) => normalizeModelName(name));

    const merged = Array.from(
      new Set([
        ...discovered,
        ...DEFAULT_OLLAMA_MODELS.map((m) => normalizeModelName(m)),
      ])
    );
    cachedCatalog = { expires_at: now + CATALOG_CACHE_TTL_MS, models: merged };
    return merged;
  } catch {
    const fallback = DEFAULT_OLLAMA_MODELS.map((m) => normalizeModelName(m));
    cachedCatalog = {
      expires_at: now + CATALOG_CACHE_TTL_MS,
      models: fallback,
    };
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}

function scoreCandidate(
  candidate: ModelCandidate,
  plan: RoutingPlan,
  memoryModelStats: {
    success_count?: number;
    failure_count?: number;
    average_latency_ms?: number;
  } | null
): number {
  let score = 0;

  if (plan.scope === 'deep_read') {
    score +=
      candidate.quality * 0.5 +
      candidate.reasoning * 0.4 +
      candidate.speed * 0.1;
  } else if (plan.scope === 'fast') {
    score +=
      candidate.speed * 0.6 +
      candidate.quality * 0.25 +
      candidate.reasoning * 0.15;
  } else {
    score +=
      candidate.quality * 0.4 +
      candidate.reasoning * 0.35 +
      candidate.speed * 0.25;
  }

  if (plan.task_type === 'coding') {
    score += candidate.coding * 0.45;
  } else if (plan.task_type === 'analysis') {
    score += candidate.reasoning * 0.25;
  } else if (plan.task_type === 'quick') {
    score += candidate.speed * 0.2;
  }

  if (memoryModelStats) {
    const successes = memoryModelStats.success_count ?? 0;
    const failures = memoryModelStats.failure_count ?? 0;
    const total = successes + failures;
    if (total > 0) {
      const successRate = successes / total;
      score += successRate * 20;
      score -= Math.min(12, failures * 2);
    }

    if (
      (memoryModelStats.average_latency_ms ?? 0) > 0 &&
      plan.scope !== 'deep_read'
    ) {
      const latencyPenalty = Math.min(
        12,
        (memoryModelStats.average_latency_ms ?? 0) / 1500
      );
      score -= latencyPenalty;
    }
  }

  return score;
}

function selectOllamaCandidates(
  models: string[],
  plan: RoutingPlan,
  memoryProfile: Awaited<ReturnType<typeof getRoutingMemoryProfile>> | null
): string[] {
  const ranked = models
    .map((model) => {
      const candidate = getModelCandidate(model);
      const memoryStats = memoryProfile?.model_performance?.[model] ?? null;
      return {
        model,
        score: scoreCandidate(candidate, plan, memoryStats),
      };
    })
    .sort((a, b) => b.score - a.score);

  const preferred =
    memoryProfile?.preferred_models?.filter((model) =>
      models.includes(model)
    ) ?? [];
  const merged = Array.from(
    new Set([...preferred, ...ranked.map((entry) => entry.model)])
  );
  return merged.slice(0, 8);
}

// ---------------------------------------------------------------------------
// Provider calls
// ---------------------------------------------------------------------------

function getOllamaParameters(
  plan: RoutingPlan,
  model: string
): { timeout_ms: number; options: Record<string, unknown> } {
  const sizeB = parseBillionSize(model);
  const deepRead = plan.scope === 'deep_read';

  let timeoutMs = 10_000;
  if (sizeB >= 65) timeoutMs = deepRead ? 45_000 : 30_000;
  else if (sizeB >= 15) timeoutMs = deepRead ? 30_000 : 18_000;
  else if (sizeB <= 4) timeoutMs = deepRead ? 12_000 : 7_000;

  return {
    timeout_ms: timeoutMs,
    options: {
      temperature: 0.25,
      num_predict: deepRead ? 520 : 300,
      num_ctx: deepRead ? 8192 : 4096,
    },
  };
}

async function callOllama(
  model: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  plan: RoutingPlan
): Promise<{ raw: string; parameters: Record<string, unknown> }> {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const params = getOllamaParameters(plan, model);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeout_ms);

  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: getOllamaHeaders(),
      body: JSON.stringify({
        model,
        prompt: messages.map((m) => `${m.role}: ${m.content}`).join('\n'),
        stream: false,
        options: params.options,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Ollama generation failed with status ${response.status}`,
        {
          cause: { status: response.status },
        }
      );
    }

    const data = (await response.json()) as {
      response?: string;
      error?: string;
    };
    if (typeof data.error === 'string' && data.error.trim()) {
      throw new Error(data.error);
    }

    return {
      raw: data.response ?? '',
      parameters: {
        ...params.options,
        timeout_ms: params.timeout_ms,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenAILifeguard(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  plan: RoutingPlan
): Promise<{
  raw: string;
  parameters: Record<string, unknown>;
  model: string;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new LLMError(
      'OpenAI escalation requested but OPENAI_API_KEY is missing.',
      'unknown'
    );
  }

  const model = process.env.OPENAI_LIFEGUARD_MODEL || 'gpt-5.4';
  const deepRead = plan.scope === 'deep_read';
  const maxTokens = deepRead ? 900 : 500;
  const timeoutMs = deepRead ? 45_000 : 25_000;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.2,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI lifeguard failed with status ${response.status}`,
        {
          cause: { status: response.status },
        }
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const raw = data.choices?.[0]?.message?.content ?? '';
    return {
      raw,
      model,
      parameters: {
        temperature: 0.2,
        max_tokens: maxTokens,
        timeout_ms: timeoutMs,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

function extractStatus(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;

  if (
    'status' in err &&
    typeof (err as { status: unknown }).status === 'number'
  ) {
    return (err as { status: number }).status;
  }

  if ('cause' in err) {
    const cause = (err as { cause?: unknown }).cause;
    if (cause && typeof cause === 'object' && 'status' in cause) {
      const status = (cause as { status?: unknown }).status;
      if (typeof status === 'number') {
        return status;
      }
    }
  }

  return null;
}

function classifyError(err: unknown, providerName: string): LLMError {
  if (err instanceof Error && err.name === 'AbortError') {
    return new LLMError('That took too long. Please try again.', 'timeout');
  }

  const status = extractStatus(err);
  if (status === 429) {
    return new LLMError(
      `${providerName} rate limit reached. Trying next provider.`,
      'rate_limited'
    );
  }
  if (status !== null && status >= 500) {
    return new LLMError(
      "I couldn't process that. Please try again.",
      'server_error'
    );
  }

  if (err instanceof Error && /model|not found/i.test(err.message)) {
    return new LLMError(
      `${providerName} model not available. Trying next provider.`,
      'server_error'
    );
  }

  if (
    err instanceof Error &&
    /fetch|network|connect|econnrefused|failed to fetch/i.test(err.message)
  ) {
    return new LLMError(
      `Network error connecting to ${providerName}. Trying next provider.`,
      'server_error'
    );
  }

  return new LLMError("I couldn't process that. Please try again.", 'unknown');
}

// ---------------------------------------------------------------------------
// Core call — single provider
// ---------------------------------------------------------------------------

async function callProvider(
  provider: ProviderAttempt,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  routingTrace: LLMRoutingTrace
): Promise<LLMResponse> {
  routingTrace.attempted_models.push(`${provider.provider}:${provider.model}`);

  try {
    const raw = await provider.call(messages);

    if (!raw) {
      return {
        gate_type: 'unclassified',
        brief:
          "I wasn't able to generate a useful response. Please try rephrasing.",
        raw: '',
        provider: provider.provider,
        model_id: provider.model,
        model_parameters: provider.parameters,
        routing_trace: routingTrace,
      };
    }

    const { gate_type, brief } = parseGateAndBrief(raw);
    const qualityFlags = assessResponseQuality(gate_type, brief);

    if (
      qualityFlags.missing_gate_tag ||
      qualityFlags.exceeds_word_limit ||
      qualityFlags.ends_with_question
    ) {
      recordSafetyEvent({
        event_type: 'response_quality_flag',
        flags: qualityFlags,
      }).catch(() => {});
    }

    return {
      gate_type,
      brief,
      raw,
      provider: provider.provider,
      model_id: provider.model,
      model_parameters: provider.parameters,
      routing_trace: routingTrace,
    };
  } catch (err) {
    throw classifyError(err, `${provider.provider}:${provider.model}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the message array that every provider receives.
 */
function buildMessages(
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    ...conversationHistory.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: userMessage },
  ];
}

function shouldAutoEscalateToOpenAI(
  plan: RoutingPlan,
  routingContext: LLMRoutingContext | undefined
): boolean {
  if (!process.env.OPENAI_API_KEY) return false;
  if (routingContext?.openai_override === 'never') return false;
  if (routingContext?.openai_override === 'force') return true;

  // "Very rare" auto-escalation: only for deep-read/high-complexity requests.
  return plan.scope === 'deep_read' && plan.complexity_score >= 88;
}

async function persistRoutingSignal(
  response: LLMResponse | null,
  userMessage: string,
  plan: RoutingPlan,
  routingContext: LLMRoutingContext | undefined,
  success: boolean,
  latencyMs: number,
  escalatedToOpenAI: boolean
): Promise<void> {
  if (!routingContext?.user_id || !routingContext.allow_routing_memory) {
    return;
  }

  if (!response) return;

  await recordRoutingMemorySignal(routingContext.user_id, {
    timestamp: new Date().toISOString(),
    provider: response.provider,
    model_id: response.model_id,
    success,
    latency_ms: latencyMs,
    task_type: plan.task_type,
    scope: plan.scope,
    intent: userMessage.slice(0, 220),
    sentiment: detectSentiment(userMessage),
    deep_read: plan.scope === 'deep_read',
    escalated_to_openai: escalatedToOpenAI,
    escalation_type: escalatedToOpenAI
      ? routingContext.openai_override === 'force'
        ? 'forced'
        : 'auto'
      : 'none',
  }).catch(() => {});
}

/**
 * Call the LLM with dynamic Ollama-first fallback.
 *
 * Strategy:
 *   - Build a scenario-aware plan (task type + complexity + scope).
 *   - Discover locally available Ollama models via /api/tags and rank by scenario.
 *   - Apply routing-memory preference only if user consented.
 *   - Attempt ranked Ollama models first.
 *   - Escalate to OpenAI lifeguard only when explicitly forced, or a rare high-complexity auto trigger.
 */
export async function callLLMWithFallback(
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  routingContext?: LLMRoutingContext
): Promise<LLMResponse> {
  const plan = deriveRoutingPlan(
    userMessage,
    conversationHistory,
    routingContext
  );
  const messages = buildMessages(userMessage, conversationHistory);

  const memoryProfile =
    routingContext?.user_id && routingContext.allow_routing_memory
      ? await getRoutingMemoryProfile(routingContext.user_id)
      : null;

  const catalog = await fetchOllamaCatalog();
  if (catalog.length === 0 && routingContext?.openai_override !== 'force') {
    throw new LLMError(
      'No Ollama models are available. Ensure Ollama is running and models are pulled.',
      'unknown'
    );
  }

  const ollamaCandidates = selectOllamaCandidates(catalog, plan, memoryProfile);
  const routingTrace: LLMRoutingTrace = {
    task_type: plan.task_type,
    scope: plan.scope,
    complexity_score: plan.complexity_score,
    openai_policy: plan.openai_policy,
    attempted_models: [],
    selected_candidates: [...ollamaCandidates],
    memory_influence_applied: Boolean(memoryProfile),
    escalated_to_openai: false,
  };

  const lastErrorRef: { value: LLMError | null } = { value: null };
  const tryProvider = async (
    provider: ProviderAttempt
  ): Promise<LLMResponse | null> => {
    try {
      return await callProvider(provider, messages, routingTrace);
    } catch (error) {
      const llmErr =
        error instanceof LLMError
          ? error
          : new LLMError('Unknown error', 'unknown');
      lastErrorRef.value = llmErr;

      if (llmErr.reason === 'server_error') {
        try {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return await callProvider(provider, messages, routingTrace);
        } catch (retryErr) {
          const retryClassified =
            retryErr instanceof LLMError
              ? retryErr
              : new LLMError('Unknown error', 'unknown');
          lastErrorRef.value = retryClassified;
        }
      }

      return null;
    }
  };

  if (routingContext?.openai_override === 'force') {
    const start = Date.now();
    const openaiResult = await callOpenAILifeguard(messages, plan);
    const response = await callProvider(
      {
        provider: 'openai',
        model: openaiResult.model,
        parameters: openaiResult.parameters,
        call: async () => openaiResult.raw,
      },
      messages,
      routingTrace
    );
    routingTrace.escalated_to_openai = true;
    await persistRoutingSignal(
      response,
      userMessage,
      plan,
      routingContext,
      true,
      Date.now() - start,
      true
    );
    return response;
  }

  for (const model of ollamaCandidates) {
    const params = getOllamaParameters(plan, model);
    const provider: ProviderAttempt = {
      provider: 'ollama',
      model,
      parameters: {
        ...params.options,
        timeout_ms: params.timeout_ms,
      },
      call: async (providerMessages) =>
        (await callOllama(model, providerMessages, plan)).raw,
    };

    const start = Date.now();
    const response = await tryProvider(provider);
    if (!response) continue;

    const quality = assessResponseQuality(response.gate_type, response.brief);
    const severeQualityIssue =
      quality.missing_gate_tag || quality.exceeds_word_limit;

    if (
      severeQualityIssue &&
      shouldAutoEscalateToOpenAI(plan, routingContext)
    ) {
      try {
        const openaiStart = Date.now();
        const openaiResult = await callOpenAILifeguard(messages, plan);
        const openaiResponse = await callProvider(
          {
            provider: 'openai',
            model: openaiResult.model,
            parameters: openaiResult.parameters,
            call: async () => openaiResult.raw,
          },
          messages,
          routingTrace
        );
        routingTrace.escalated_to_openai = true;
        await persistRoutingSignal(
          openaiResponse,
          userMessage,
          plan,
          routingContext,
          true,
          Date.now() - openaiStart,
          true
        );
        return openaiResponse;
      } catch (err) {
        lastErrorRef.value =
          err instanceof LLMError
            ? err
            : new LLMError('Unknown error', 'unknown');
      }
    }

    await persistRoutingSignal(
      response,
      userMessage,
      plan,
      routingContext,
      true,
      Date.now() - start,
      false
    );
    return response;
  }

  if (shouldAutoEscalateToOpenAI(plan, routingContext)) {
    try {
      const start = Date.now();
      const openaiResult = await callOpenAILifeguard(messages, plan);
      const response = await callProvider(
        {
          provider: 'openai',
          model: openaiResult.model,
          parameters: openaiResult.parameters,
          call: async () => openaiResult.raw,
        },
        messages,
        routingTrace
      );
      routingTrace.escalated_to_openai = true;
      await persistRoutingSignal(
        response,
        userMessage,
        plan,
        routingContext,
        true,
        Date.now() - start,
        true
      );
      return response;
    } catch (err) {
      lastErrorRef.value =
        err instanceof LLMError
          ? err
          : new LLMError('Unknown error', 'unknown');
    }
  }

  await persistRoutingSignal(
    {
      gate_type: 'unclassified',
      brief: '',
      raw: '',
      provider: 'ollama',
      model_id:
        routingTrace.attempted_models.at(-1)?.split(':').slice(1).join(':') ??
        'unknown',
      model_parameters: {},
      routing_trace: routingTrace,
    },
    userMessage,
    plan,
    routingContext,
    false,
    0,
    routingTrace.escalated_to_openai
  );

  throw (
    lastErrorRef.value ??
    new LLMError(
      'All providers unavailable. Please try again later.',
      'unknown'
    )
  );
}

/**
 * Backward-compatible alias.
 */
export const callLLMWithRetry = callLLMWithFallback;

/**
 * Low-level single call to the primary dynamically selected Ollama model.
 * Does not perform cross-provider fallback.
 */
export async function callLLM(
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  routingContext?: LLMRoutingContext
): Promise<LLMResponse> {
  const plan = deriveRoutingPlan(
    userMessage,
    conversationHistory,
    routingContext
  );
  const messages = buildMessages(userMessage, conversationHistory);
  const catalog = await fetchOllamaCatalog();
  if (catalog.length === 0) {
    throw new LLMError(
      'No Ollama models are available. Ensure Ollama is running and models are pulled.',
      'unknown'
    );
  }

  const primary = selectOllamaCandidates(catalog, plan, null)[0];
  if (!primary) {
    throw new LLMError(
      'No Ollama models are available. Ensure Ollama is running and models are pulled.',
      'unknown'
    );
  }

  const params = getOllamaParameters(plan, primary);
  const routingTrace: LLMRoutingTrace = {
    task_type: plan.task_type,
    scope: plan.scope,
    complexity_score: plan.complexity_score,
    openai_policy: plan.openai_policy,
    attempted_models: [],
    selected_candidates: [primary],
    memory_influence_applied: false,
    escalated_to_openai: false,
  };

  return callProvider(
    {
      provider: 'ollama',
      model: primary,
      parameters: {
        ...params.options,
        timeout_ms: params.timeout_ms,
      },
      call: async (providerMessages) =>
        (await callOllama(primary, providerMessages, plan)).raw,
    },
    messages,
    routingTrace
  );
}
