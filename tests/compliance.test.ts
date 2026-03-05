/**
 * Compliance test cases TC-01 through TC-08.
 *
 * These map directly to the test plan in contract.json → api_compliance.testing_and_documentation.
 * Each test validates a specific data-protection requirement.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createToken } from "@/lib/auth";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRedisStore = new Map<string, string>();
const mockRedisList = new Map<string, string[]>();

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    set: vi.fn(async (key: string, value: string) => {
      mockRedisStore.set(key, value);
      return "OK";
    }),
    get: vi.fn(async (key: string) => mockRedisStore.get(key) ?? null),
    del: vi.fn(async (key: string) => {
      mockRedisStore.delete(key);
      mockRedisList.delete(key);
      return 1;
    }),
    rpush: vi.fn(async (key: string, ...values: string[]) => {
      const list = mockRedisList.get(key) ?? [];
      list.push(...values);
      mockRedisList.set(key, list);
      return list.length;
    }),
    lrange: vi.fn(async (key: string, start: number, stop: number) => {
      const list = mockRedisList.get(key) ?? [];
      const end = stop === -1 ? list.length : stop + 1;
      return list.slice(start, end);
    }),
    scan: vi.fn(async (_cursor: number, opts?: { match?: string }) => {
      const pattern = opts?.match ?? "*";
      const prefix = pattern.replace("*", "");
      const keys = [
        ...Array.from(mockRedisStore.keys()),
        ...Array.from(mockRedisList.keys()),
      ].filter((k) => k.startsWith(prefix));
      return [0, keys];
    }),
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  getSessionRateLimiter: () => ({}),
  getSessionEndRateLimiter: () => ({}),
  getDataRightsRateLimiter: () => ({}),
  getSubscribeRateLimiter: () => ({}),
  checkRateLimit: vi.fn(async () => null),
}));

const mockWriteAuditLog = vi.fn();
vi.mock("@/lib/audit", () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
  auditAction: vi.fn(async () => {}),
  hashIP: vi.fn(() => "hashed-ip"),
  getClientIP: vi.fn(() => "127.0.0.1"),
}));

vi.mock("@/lib/provenance", () => ({
  createDPR: vi.fn(() => ({ dpr_id: "test", chain_hash: "test", sequence_number: 0 })),
  getChainRef: vi.fn(() => ({ dpr_id: "test", chain_hash: "test", sequence_number: 0 })),
  storeDPR: vi.fn(async () => {}),
  getSessionDPRs: vi.fn(async () => []),
  verifySessionChain: vi.fn(async () => ({ valid: true, total: 0, broken_at: null })),
}));

vi.mock("@/lib/stripe", () => ({
  deleteStripeCustomer: vi.fn(async () => {}),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedUser(userId: string, overrides: Record<string, unknown> = {}): void {
  const user = {
    user_id: userId,
    stripe_customer_id: `cus_${userId}`,
    subscription_status: "active",
    subscription_tier: "trial",
    billing_cycle_anchor: new Date().toISOString(),
    consents: {
      essential_processing: { granted: true, timestamp: new Date().toISOString(), policy_version: "v1.0" },
      session_telemetry: { granted: true, timestamp: new Date().toISOString(), policy_version: "v1.0" },
      marketing_communications: { granted: false, timestamp: new Date().toISOString(), policy_version: "v1.0" },
    },
    ...overrides,
  };
  mockRedisStore.set(`user:${userId}`, JSON.stringify(user));
  mockRedisStore.set(`stripe_map:cus_${userId}`, userId);
}

function seedSessionLog(userId: string, dateKey: string): void {
  const log = JSON.stringify({
    session_id: `sess_${userId}_${dateKey}`,
    user_id: userId,
    start_time: `${dateKey}T00:00:00Z`,
    end_time: `${dateKey}T00:01:30Z`,
    turns: 2,
    gate_type: "context_gate_resolution",
    user_proceeded: true,
    session_completed: true,
    latency_per_turn: [0.5, 0.7],
    error: null,
  });
  const list = mockRedisList.get(`sessions:${dateKey}`) ?? [];
  list.push(log);
  mockRedisList.set(`sessions:${dateKey}`, list);
}

beforeEach(() => {
  mockRedisStore.clear();
  mockRedisList.clear();
});

// ---------------------------------------------------------------------------
// TC-01: consent_flow_validation
// ---------------------------------------------------------------------------
describe("TC-01: consent_flow_validation", () => {
  it("creates default consents with telemetry and marketing defaulting to false", async () => {
    const { createDefaultConsents } = await import("@/lib/consent");
    const consents = createDefaultConsents(true, false, false);

    expect(consents.essential_processing.granted).toBe(true);
    expect(consents.session_telemetry.granted).toBe(false);
    expect(consents.marketing_communications.granted).toBe(false);
  });

  it("records timestamp and policy version on each consent grant", async () => {
    const { createDefaultConsents } = await import("@/lib/consent");
    const consents = createDefaultConsents(true, false, false);

    for (const key of Object.keys(consents) as Array<keyof typeof consents>) {
      expect(consents[key].timestamp).toBeTruthy();
      expect(consents[key].policy_version).toBe("v1.0");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-02: opt_out_effectiveness
// ---------------------------------------------------------------------------
describe("TC-02: opt_out_effectiveness", () => {
  it("shouldWriteTelemetry returns false when telemetry consent is revoked", async () => {
    const { createDefaultConsents, shouldWriteTelemetry, updateConsent } = await import("@/lib/consent");

    // Start with telemetry consented
    const consents = createDefaultConsents(true, true, false);
    expect(shouldWriteTelemetry(consents)).toBe(true);

    // Revoke telemetry consent
    consents.session_telemetry = updateConsent(consents.session_telemetry, false);
    expect(shouldWriteTelemetry(consents)).toBe(false);
  });

  it("shouldWriteTelemetry returns false when telemetry was never granted", async () => {
    const { createDefaultConsents, shouldWriteTelemetry } = await import("@/lib/consent");
    const consents = createDefaultConsents(true, false, false);
    expect(shouldWriteTelemetry(consents)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-03: data_export_completeness
// ---------------------------------------------------------------------------
describe("TC-03: data_export_completeness", () => {
  it("exports data for the authenticated user only", async () => {
    seedUser("user-A");
    seedUser("user-B");
    seedSessionLog("user-A", "2026-02-20");
    seedSessionLog("user-B", "2026-02-20");

    const token = await createToken({ user_id: "user-A" });
    const { GET } = await import("@/app/api/v1/user/data-export/route");

    const req = new NextRequest("http://localhost/api/v1/user/data-export", {
      headers: { authorization: `Bearer ${token}` },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.user_profile.user_id).toBe("user-A");

    // Verify no data from user-B leaked
    const sessions = body.session_logs as Array<{ user_id: string }>;
    for (const s of sessions) {
      expect(s.user_id).toBe("user-A");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-04: data_deletion_cascade
// ---------------------------------------------------------------------------
describe("TC-04: data_deletion_cascade", () => {
  it("marks user for deletion and triggers Stripe customer deletion on permanent delete", async () => {
    seedUser("user-del");
    seedSessionLog("user-del", "2026-02-15");

    const { markUserForDeletion, permanentlyDeleteUserData, getUser } = await import("@/lib/data-layer");
    const { deleteStripeCustomer } = await import("@/lib/stripe");

    // Mark for deletion
    const marked = await markUserForDeletion("user-del");
    expect(marked).toBe(true);

    // Verify pending_deletion is set
    const userAfterMark = await getUser("user-del");
    expect(userAfterMark?.pending_deletion).toBeTruthy();

    // Permanently delete
    await permanentlyDeleteUserData("user-del");

    // Verify Stripe customer deletion was called
    expect(deleteStripeCustomer).toHaveBeenCalledWith("cus_user-del");

    // Verify user is gone
    const userAfterDelete = await getUser("user-del");
    expect(userAfterDelete).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-05: deletion_grace_period
// ---------------------------------------------------------------------------
describe("TC-05: deletion_grace_period", () => {
  it("markUserForDeletion sets a 7-day future deletion date", async () => {
    seedUser("user-grace");
    const { markUserForDeletion, getUser } = await import("@/lib/data-layer");

    const before = Date.now();
    await markUserForDeletion("user-grace");
    const after = Date.now();

    const user = await getUser("user-grace");
    expect(user?.pending_deletion).toBeTruthy();

    const deletionDate = new Date(user!.pending_deletion!.deletion_date).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    // Deletion date should be ~7 days from now (within the before/after window)
    expect(deletionDate).toBeGreaterThanOrEqual(before + sevenDaysMs - 1000);
    expect(deletionDate).toBeLessThanOrEqual(after + sevenDaysMs + 1000);
  });

  it("cancelDeletion clears the pending_deletion field", async () => {
    seedUser("user-cancel");
    const { markUserForDeletion, cancelDeletion, getUser } = await import("@/lib/data-layer");

    await markUserForDeletion("user-cancel");
    const userBefore = await getUser("user-cancel");
    expect(userBefore?.pending_deletion).toBeTruthy();

    await cancelDeletion("user-cancel");
    const userAfter = await getUser("user-cancel");
    expect(userAfter?.pending_deletion).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-06: audit_log_immutability
// ---------------------------------------------------------------------------
describe("TC-06: audit_log_immutability", () => {
  it("audit.ts writeAuditLog implementation uses append-only rpush", async () => {
    // Read the source code of audit.ts to verify it uses rpush (append-only)
    const fs = await import("fs");
    const path = await import("path");
    const auditSource = fs.readFileSync(
      path.resolve(__dirname, "../src/lib/audit.ts"),
      "utf-8"
    );

    // Verify rpush is used (append-only list operation)
    expect(auditSource).toContain("rpush");
    // Verify no delete or update operations on audit logs
    expect(auditSource).not.toContain("lset"); // no list update
    expect(auditSource).not.toMatch(/\.del\s*\(\s*[`"']audit:/); // no audit key deletion
  });

  it("no delete or update API exists for audit logs", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const auditSource = fs.readFileSync(
      path.resolve(__dirname, "../src/lib/audit.ts"),
      "utf-8"
    );

    // Verify the module does not export any delete/update/clear functions
    expect(auditSource).not.toContain("deleteAuditLog");
    expect(auditSource).not.toContain("updateAuditLog");
    expect(auditSource).not.toContain("clearAuditLogs");
  });
});

// ---------------------------------------------------------------------------
// TC-07: retention_auto_deletion
// ---------------------------------------------------------------------------
describe("TC-07: retention_auto_deletion", () => {
  it("cron endpoint processes expired user deletions and old session logs", async () => {
    // Seed a user whose deletion date has passed
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    seedUser("user-expired", {
      pending_deletion: {
        requested_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        deletion_date: pastDate,
      },
    });

    // Seed a session log from 100 days ago (past 90-day retention)
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    const oldDateKey = oldDate.toISOString().split("T")[0];
    seedSessionLog("some-user", oldDateKey);

    // Seed a recent session log (should NOT be deleted)
    seedSessionLog("some-user", "2026-02-27");

    const { GET } = await import("@/app/api/cron/cleanup/route");

    const req = new NextRequest("http://localhost/api/cron/cleanup", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? "test-cron-secret"}` },
    });

    // Set CRON_SECRET for the test
    process.env.CRON_SECRET = req.headers.get("authorization")!.replace("Bearer ", "");

    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.users_deleted).toBeGreaterThanOrEqual(1);
    expect(body.sessions_cleaned).toBeGreaterThanOrEqual(1);

    // The recent session should still exist
    expect(mockRedisList.has("sessions:2026-02-27")).toBe(true);
  });

  it("rejects unauthorized requests", async () => {
    const { GET } = await import("@/app/api/cron/cleanup/route");

    const req = new NextRequest("http://localhost/api/cron/cleanup", {
      headers: { authorization: "Bearer wrong-secret" },
    });

    process.env.CRON_SECRET = "correct-secret";
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// TC-08: pii_leak_scan
// ---------------------------------------------------------------------------
describe("TC-08: pii_leak_scan", () => {
  it("updateSession strips conversation_history before persisting", async () => {
    const { createSession, updateSession } = await import("@/lib/session-controller");

    const session = await createSession("user-pii");

    // Simulate adding user text to conversation_history (in-memory only)
    session.conversation_history.push(
      { role: "user", content: "My SSN is 123-45-6789" },
      { role: "assistant", content: "I can help with that" }
    );

    await updateSession(session);

    // Read persisted data directly from mock store
    const stored = mockRedisStore.get(`session:${session.session_id}`);
    expect(stored).toBeTruthy();

    const parsed = JSON.parse(stored!);
    // conversation_history should be empty in persisted data
    expect(parsed.conversation_history).toEqual([]);
    // User text should not appear anywhere in the stored JSON
    expect(stored).not.toContain("My SSN");
    expect(stored).not.toContain("123-45-6789");
  });

  it("session logs contain only operational fields, no user text", async () => {
    const { writeSessionLog, getSessionLogs } = await import("@/lib/data-layer");

    const log = {
      session_id: "sess-pii-check",
      user_id: "user-pii",
      tier: "trial",
      start_time: "2026-02-28T10:00:00Z",
      end_time: "2026-02-28T10:01:30Z",
      turns: 2,
      gate_type: "context_gate_resolution" as const,
      user_proceeded: true,
      session_completed: true,
      latency_per_turn: [0.5, 0.8],
      error: null,
    };

    await writeSessionLog(log);
    const logs = await getSessionLogs("2026-02-28");
    expect(logs).toHaveLength(1);

    // Verify the log only has the expected operational fields
    const storedLog = logs[0];
    const allowedFields = [
      "session_id", "user_id", "tier", "start_time", "end_time",
      "turns", "gate_type", "user_proceeded", "session_completed",
      "latency_per_turn", "error",
    ];
    for (const key of Object.keys(storedLog)) {
      expect(allowedFields).toContain(key);
    }

    // No field should contain user text content
    const serialized = JSON.stringify(storedLog);
    expect(serialized).not.toContain("content");
    expect(serialized).not.toContain("message");
  });
});
