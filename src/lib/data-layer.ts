import { getRedis } from "./redis";
import type { SessionLog } from "@/types/session";
import type { UserRecord } from "@/types/user";

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

export async function createUser(user: UserRecord): Promise<void> {
  const redis = getRedis();
  await redis.set(`${USER_PREFIX}${user.user_id}`, JSON.stringify(user));
}

export async function getUser(userId: string): Promise<UserRecord | null> {
  const redis = getRedis();
  const data = await redis.get<string>(`${USER_PREFIX}${userId}`);
  if (!data) return null;
  return typeof data === "string" ? JSON.parse(data) : data as unknown as UserRecord;
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

// --- User Data Export ---

export async function exportUserData(userId: string): Promise<Record<string, unknown> | null> {
  const user = await getUser(userId);
  if (!user) return null;

  const redis = getRedis();
  const sessionKeys = await redis.keys("sessions:*");
  const userSessions: SessionLog[] = [];

  for (const key of sessionKeys) {
    const entries = await redis.lrange(key, 0, -1);
    for (const entry of entries) {
      const log = (typeof entry === "string" ? JSON.parse(entry) : entry) as SessionLog;
      userSessions.push(log);
    }
  }

  return {
    user_profile: {
      user_id: user.user_id,
      subscription_status: user.subscription_status,
      display_name: user.display_name,
      email_preference: user.email_preference,
    },
    consent_records: user.consents,
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
    await redis.del(`stripe_map:${user.stripe_customer_id}`);
  }

  await redis.del(`${USER_PREFIX}${userId}`);
}
