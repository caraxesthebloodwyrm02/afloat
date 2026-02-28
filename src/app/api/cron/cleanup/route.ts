import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { permanentlyDeleteUserData } from "@/lib/data-layer";
import { writeAuditLog } from "@/lib/audit";
import type { UserRecord } from "@/types/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Verify Vercel Cron authorization
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "Server misconfigured: CRON_SECRET not set" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const redis = getRedis();
  const now = new Date();
  const summary = {
    users_deleted: 0,
    sessions_cleaned: 0,
    errors: [] as string[],
  };

  // --- 1. Process pending user deletions ---
  let cursor = 0;
  do {
    const [nextCursor, keys] = await redis.scan(cursor, { match: "user:*", count: 100 });
    cursor = typeof nextCursor === "string" ? parseInt(nextCursor, 10) : nextCursor;

    for (const key of keys) {
      try {
        const raw = await redis.get<string>(key);
        if (!raw) continue;

        const user = (typeof raw === "string" ? JSON.parse(raw) : raw) as UserRecord;

        if (
          user.pending_deletion &&
          new Date(user.pending_deletion.deletion_date) <= now
        ) {
          await permanentlyDeleteUserData(user.user_id);
          await writeAuditLog({
            actor: "system",
            action: "delete",
            resource_type: "user_profile",
            resource_id: user.user_id,
            outcome: "success",
            ip_hash: "cron-job",
            metadata: { trigger: "auto_deletion", deletion_date: user.pending_deletion.deletion_date },
          });
          summary.users_deleted++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        summary.errors.push(`user deletion error on ${key}: ${msg}`);
      }
    }
  } while (cursor !== 0);

  // --- 2. Clean up session logs past 90-day retention ---
  const retentionMs = 90 * 24 * 60 * 60 * 1000;
  cursor = 0;
  do {
    const [nextCursor, keys] = await redis.scan(cursor, { match: "sessions:*", count: 100 });
    cursor = typeof nextCursor === "string" ? parseInt(nextCursor, 10) : nextCursor;

    for (const key of keys) {
      try {
        // Key format: sessions:YYYY-MM-DD
        const dateStr = key.replace("sessions:", "");
        const keyDate = new Date(dateStr);

        if (isNaN(keyDate.getTime())) continue;

        if (now.getTime() - keyDate.getTime() > retentionMs) {
          await redis.del(key);
          await writeAuditLog({
            actor: "system",
            action: "delete",
            resource_type: "session_log",
            resource_id: key,
            outcome: "success",
            ip_hash: "cron-job",
            metadata: { trigger: "retention_expiry", date_key: dateStr },
          });
          summary.sessions_cleaned++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        summary.errors.push(`session cleanup error on ${key}: ${msg}`);
      }
    }
  } while (cursor !== 0);

  return NextResponse.json({
    ok: true,
    timestamp: now.toISOString(),
    ...summary,
  });
}
