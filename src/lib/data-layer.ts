import { getRedis } from "./redis";
import type { SessionLog } from "@/types/session";
import type {
  RoutingMemoryProfile,
  RoutingProvider,
  RoutingScope,
  RoutingSentiment,
  RoutingTaskType,
  UserRecord,
} from "@/types/user";

const LUA_REPLACE_LIST = `
local current = redis.call('LRANGE', KEYS[1], 0, -1)
redis.call('DEL', KEYS[1])
if #ARGV > 0 then
  redis.call('RPUSH', KEYS[1], unpack(ARGV))
end
return #ARGV
`;

// --- Session Logs ---

export async function writeSessionLog(log: SessionLog): Promise<void> {
  const redis = getRedis();
  const dateKey = log.end_time.split("T")[0];
  await redis.rpush(`sessions:${dateKey}`, JSON.stringify(log));
}

export async function getSessionLogs(dateKey: string): Promise<SessionLog[]> {
  const redis = getRedis();
  const entries = await redis.lrange(`sessions:${dateKey}`, 0, -1);
  return entries.map((e) => (typeof e === "string" ? JSON.parse(e) : e) as SessionLog);
}

// --- User Store ---

const USER_PREFIX = "user:";
const ROUTING_PROFILE_PREFIX = "routing_profile:";

interface RoutingMemorySignal {
  timestamp: string;
  provider: RoutingProvider;
  model_id: string;
  success: boolean;
  latency_ms: number;
  task_type: RoutingTaskType;
  scope: RoutingScope;
  intent: string;
  sentiment: RoutingSentiment;
  deep_read: boolean;
  escalated_to_openai: boolean;
  escalation_type: "none" | "auto" | "forced";
}

function createDefaultRoutingProfile(userId: string): RoutingMemoryProfile {
  const now = new Date().toISOString();
  return {
    user_id: userId,
    created_at: now,
    updated_at: now,
    preferred_models: [],
    model_performance: {},
    task_memory: {
      last_intent: "",
      recent_intents: [],
      last_task_type: "general",
      sentiment: "neutral",
      deep_read_preference: 0,
    },
    escalation: {
      openai_auto_count: 0,
      openai_forced_count: 0,
      last_escalated_at: null,
    },
  };
}

export async function createUser(user: UserRecord): Promise<void> {
  const redis = getRedis();
  await redis.set(`${USER_PREFIX}${user.user_id}`, JSON.stringify(user));
}

export async function getUser(userId: string): Promise<UserRecord | null> {
  const redis = getRedis();
  const data = await redis.get<string>(`${USER_PREFIX}${userId}`);
  if (!data) return null;
  const parsed = typeof data === "string" ? JSON.parse(data) : data as unknown as UserRecord;
  if (!parsed.subscription_tier) parsed.subscription_tier = "trial";
  if (!parsed.consents.routing_memory) {
    parsed.consents.routing_memory = {
      granted: false,
      timestamp: new Date().toISOString(),
      policy_version: "v1.0",
    };
  }
  return parsed;
}

export async function updateUser(user: UserRecord): Promise<void> {
  const redis = getRedis();
  await redis.set(`${USER_PREFIX}${user.user_id}`, JSON.stringify(user));
}

export async function deleteUser(userId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`${USER_PREFIX}${userId}`);
}

export async function getUserByStripeCustomerId(
  stripeCustomerId: string
): Promise<UserRecord | null> {
  const redis = getRedis();
  const mappedUserId = await redis.get<string>(`stripe_map:${stripeCustomerId}`);
  if (!mappedUserId) return null;
  return getUser(typeof mappedUserId === "string" ? mappedUserId : String(mappedUserId));
}

export async function setStripeCustomerMapping(
  stripeCustomerId: string,
  userId: string
): Promise<void> {
  const redis = getRedis();
  await redis.set(`stripe_map:${stripeCustomerId}`, userId);
}

// --- Routing Memory Profile ---

export async function getRoutingMemoryProfile(
  userId: string
): Promise<RoutingMemoryProfile | null> {
  const redis = getRedis();
  const data = await redis.get<string>(`${ROUTING_PROFILE_PREFIX}${userId}`);
  if (!data) return null;

  const parsed =
    typeof data === "string"
      ? (JSON.parse(data) as RoutingMemoryProfile)
      : (data as unknown as RoutingMemoryProfile);

  return {
    ...createDefaultRoutingProfile(userId),
    ...parsed,
    user_id: userId,
    preferred_models: Array.isArray(parsed.preferred_models)
      ? parsed.preferred_models
      : [],
    model_performance:
      parsed.model_performance && typeof parsed.model_performance === "object"
        ? parsed.model_performance
        : {},
    task_memory: {
      ...createDefaultRoutingProfile(userId).task_memory,
      ...(parsed.task_memory ?? {}),
    },
    escalation: {
      ...createDefaultRoutingProfile(userId).escalation,
      ...(parsed.escalation ?? {}),
    },
  };
}

export async function writeRoutingMemoryProfile(
  profile: RoutingMemoryProfile
): Promise<void> {
  const redis = getRedis();
  await redis.set(
    `${ROUTING_PROFILE_PREFIX}${profile.user_id}`,
    JSON.stringify(profile)
  );
}

export async function recordRoutingMemorySignal(
  userId: string,
  signal: RoutingMemorySignal
): Promise<RoutingMemoryProfile> {
  const profile = (await getRoutingMemoryProfile(userId)) ?? createDefaultRoutingProfile(userId);
  const stats = profile.model_performance[signal.model_id] ?? {
    provider: signal.provider,
    success_count: 0,
    failure_count: 0,
    average_latency_ms: 0,
    last_used_at: signal.timestamp,
  };

  const totalBefore = stats.success_count + stats.failure_count;
  const totalAfter = totalBefore + 1;
  stats.average_latency_ms = Math.round(
    (stats.average_latency_ms * totalBefore + signal.latency_ms) / totalAfter
  );
  if (signal.success) {
    stats.success_count += 1;
  } else {
    stats.failure_count += 1;
  }
  stats.last_used_at = signal.timestamp;
  stats.provider = signal.provider;
  profile.model_performance[signal.model_id] = stats;

  profile.task_memory.last_intent = signal.intent;
  profile.task_memory.last_task_type = signal.task_type;
  profile.task_memory.sentiment = signal.sentiment;
  profile.task_memory.deep_read_preference = Math.max(
    0,
    Math.min(
      1,
      profile.task_memory.deep_read_preference * 0.75 + (signal.deep_read ? 0.25 : 0)
    )
  );
  profile.task_memory.recent_intents = [
    signal.intent,
    ...profile.task_memory.recent_intents.filter((entry) => entry !== signal.intent),
  ].slice(0, 8);

  if (signal.success) {
    profile.preferred_models = [
      signal.model_id,
      ...profile.preferred_models.filter((model) => model !== signal.model_id),
    ].slice(0, 8);
  }

  if (signal.escalated_to_openai) {
    if (signal.escalation_type === "auto") {
      profile.escalation.openai_auto_count += 1;
    } else if (signal.escalation_type === "forced") {
      profile.escalation.openai_forced_count += 1;
    }
    profile.escalation.last_escalated_at = signal.timestamp;
  }

  profile.updated_at = signal.timestamp;
  await writeRoutingMemoryProfile(profile);
  return profile;
}

// --- User Data Export ---

export async function exportUserData(userId: string): Promise<Record<string, unknown> | null> {
  const user = await getUser(userId);
  if (!user) return null;
  const routingProfile = await getRoutingMemoryProfile(userId);

  const redis = getRedis();
  const userSessions: SessionLog[] = [];
  let cursor = 0;
  do {
    const [nextCursor, keys] = await redis.scan(cursor, { match: "sessions:*", count: 100 });
    cursor = typeof nextCursor === "string" ? parseInt(nextCursor, 10) : nextCursor;
    for (const key of keys) {
      const entries = await redis.lrange(key, 0, -1);
      for (const entry of entries) {
        const log = (typeof entry === "string" ? JSON.parse(entry) : entry) as SessionLog;
        if (log.user_id === userId) {
          userSessions.push(log);
        }
      }
    }
  } while (cursor !== 0);

  return {
    user_profile: {
      user_id: user.user_id,
      subscription_status: user.subscription_status,
      display_name: user.display_name,
      email_preference: user.email_preference,
    },
    consent_records: user.consents,
    routing_memory_profile: routingProfile,
    subscription_reference: {
      stripe_customer_id: user.stripe_customer_id,
      billing_cycle_anchor: user.billing_cycle_anchor,
    },
    session_logs: userSessions,
  };
}

// --- User Data Deletion ---

export async function markUserForDeletion(userId: string): Promise<boolean> {
  const user = await getUser(userId);
  if (!user) return false;

  const now = new Date();
  const deletionDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  user.pending_deletion = {
    requested_at: now.toISOString(),
    deletion_date: deletionDate.toISOString(),
  };

  await updateUser(user);
  return true;
}

export async function cancelDeletion(userId: string): Promise<boolean> {
  const user = await getUser(userId);
  if (!user || !user.pending_deletion) return false;

  user.pending_deletion = null;
  await updateUser(user);
  return true;
}

export async function permanentlyDeleteUserData(userId: string): Promise<void> {
  const redis = getRedis();

  const user = await getUser(userId);
  if (user) {
    if (user.stripe_customer_id) {
      try {
        const { deleteStripeCustomer } = await import("./stripe");
        await deleteStripeCustomer(user.stripe_customer_id);
      } catch {
        // best-effort Stripe customer deletion
      }
    }
    await redis.del(`stripe_map:${user.stripe_customer_id}`);
  }

  // Delete session logs belonging to this user
  let cursor = 0;
  do {
    const [nextCursor, keys] = await redis.scan(cursor, { match: "sessions:*", count: 100 });
    cursor = typeof nextCursor === "string" ? parseInt(nextCursor, 10) : nextCursor;
    for (const key of keys) {
      const entries = await redis.lrange(key, 0, -1);
      const remaining: string[] = [];
      for (const entry of entries) {
        const log = (typeof entry === "string" ? JSON.parse(entry) : entry) as SessionLog;
        if (log.user_id !== userId) {
          remaining.push(typeof entry === "string" ? entry : JSON.stringify(entry));
        }
      }
      if (entries.length !== remaining.length) {
        if ("eval" in redis && typeof redis.eval === "function") {
          await redis.eval(LUA_REPLACE_LIST, [key], remaining);
        } else {
          await redis.del(key);
          if (remaining.length > 0) {
            await redis.rpush(key, ...remaining);
          }
        }
      }
    }
  } while (cursor !== 0);

  await redis.del(`${ROUTING_PROFILE_PREFIX}${userId}`);
  await redis.del(`${USER_PREFIX}${userId}`);
}
