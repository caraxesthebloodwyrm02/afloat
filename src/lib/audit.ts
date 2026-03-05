import { createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { getRedis } from "./redis";

export interface AuditEntry {
  log_id: string;
  timestamp: string;
  actor: string;
  action: "create" | "read" | "update" | "delete" | "export" | "consent_change";
  resource_type: "session_log" | "consent_record" | "subscription" | "user_profile";
  resource_id: string;
  outcome: "success" | "failure" | "denied";
  ip_hash: string;
  metadata: Record<string, unknown>;
  /** Optional SHA-256 of payload for integrity; no chain in v1 */
  payload_hash?: string;
}

export function hashIP(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

export function getClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return "unknown";
}

export interface AuditActionParams {
  action: AuditEntry["action"];
  resource_type: AuditEntry["resource_type"];
  resource_id: string;
  outcome: AuditEntry["outcome"];
  metadata?: Record<string, unknown>;
}

/**
 * Single helper for route-level audit: sets actor and ip_hash from request/user
 * and writes one audit entry. Use this so all state-changing routes audit consistently.
 */
export async function auditAction(
  request: Request,
  user: { user_id: string },
  params: AuditActionParams
): Promise<void> {
  await writeAuditLog({
    actor: user.user_id,
    action: params.action,
    resource_type: params.resource_type,
    resource_id: params.resource_id,
    outcome: params.outcome,
    ip_hash: hashIP(getClientIP(request)),
    metadata: params.metadata ?? {},
  });
}

function hashPayload(obj: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

export async function writeAuditLog(entry: Omit<AuditEntry, "log_id" | "timestamp" | "payload_hash">): Promise<void> {
  const redis = getRedis();
  const fullEntry: AuditEntry = {
    log_id: uuidv4(),
    timestamp: new Date().toISOString(),
    ...entry,
  };
  const { payload_hash: _payloadHash, ...payloadForHash } = fullEntry;
  void _payloadHash; // omitted so hash is computed from the rest
  fullEntry.payload_hash = hashPayload(payloadForHash as Record<string, unknown>);

  const dateKey = new Date().toISOString().split("T")[0];
  await redis.rpush(`audit:${dateKey}`, JSON.stringify(fullEntry));
}
