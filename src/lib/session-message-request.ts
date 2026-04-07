import type { LLMRoutingContext } from '@/lib/llm';
import type {
  NormalizedSessionMessageRequest,
  OpenAIOverridePolicy,
  SessionMessageHistoryEntry,
  SessionMessageRequestBody,
} from '@/types/api';
import type { UserRecord } from '@/types/user';
import { shouldWriteRoutingMemory } from './consent';

export const MAX_SESSION_MESSAGE_HISTORY_ENTRIES = 4;
export const MAX_SESSION_MESSAGE_HISTORY_CONTENT_LENGTH = 2000;

export function normalizeOpenAIOverridePolicy(
  value: unknown
): OpenAIOverridePolicy {
  return value === 'force' || value === 'never' ? value : 'auto';
}

export function normalizeSessionMessageHistory(
  value: unknown
): SessionMessageHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const history: SessionMessageHistoryEntry[] = [];
  for (const entry of value.slice(-MAX_SESSION_MESSAGE_HISTORY_ENTRIES)) {
    if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as { content?: unknown }).content === 'string' &&
      ((entry as { role?: unknown }).role === 'user' ||
        (entry as { role?: unknown }).role === 'assistant')
    ) {
      history.push({
        role: (entry as { role: 'user' | 'assistant' }).role,
        content: (entry as { content: string }).content.slice(
          0,
          MAX_SESSION_MESSAGE_HISTORY_CONTENT_LENGTH
        ),
      });
    }
  }

  return history;
}

export function normalizeSessionMessageRequestBody(
  body: SessionMessageRequestBody | null | undefined
): NormalizedSessionMessageRequest {
  return {
    message: typeof body?.message === 'string' ? body.message : '',
    history: normalizeSessionMessageHistory(body?.history),
    deep_read: body?.deep_read === true,
    openai_override: normalizeOpenAIOverridePolicy(body?.openai_override),
  };
}

export function buildLLMRoutingContext(
  userId: string,
  userRecord: Pick<UserRecord, 'consents'> | null | undefined,
  request: Pick<
    NormalizedSessionMessageRequest,
    'deep_read' | 'openai_override'
  >
): LLMRoutingContext {
  return {
    user_id: userId,
    allow_routing_memory: userRecord?.consents
      ? shouldWriteRoutingMemory(userRecord.consents)
      : false,
    deep_read_override: request.deep_read,
    openai_override: request.openai_override,
  };
}
