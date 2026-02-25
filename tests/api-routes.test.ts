/**
 * Integration tests for all API routes.
 *
 * Strategy: mock the lib-level dependencies (Redis, OpenAI, Stripe) so we can
 * test the route handler logic — auth, validation, response shapes — without
 * hitting external services.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createToken } from "@/lib/auth";
import type { SessionState } from "@/types/session";

// ---------------------------------------------------------------------------
// Mocks — must be declared before any import that triggers the real modules
// ---------------------------------------------------------------------------

// Mock Redis (used by session-controller, data-layer, audit, rate-limit)
const mockRedisStore = new Map<string, string>();
vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    set: vi.fn(async (key: string, value: string) => {
      mockRedisStore.set(key, value);
      return "OK";
    }),
    get: vi.fn(async (key: string) => mockRedisStore.get(key) ?? null),
    del: vi.fn(async (key: string) => {
      mockRedisStore.delete(key);
      return 1;
    }),
    rpush: vi.fn(async () => 1),
    lrange: vi.fn(async () => []),
    scan: vi.fn(async () => [0, []]),
  }),
}));

// Mock rate-limit — always allow
vi.mock("@/lib/rate-limit", () => ({
  getSessionRateLimiter: () => ({}),
  getSessionEndRateLimiter: () => ({}),
  getDataRightsRateLimiter: () => ({}),
  getSubscribeRateLimiter: () => ({}),
  checkRateLimit: vi.fn(async () => null),
}));

// Mock audit — no-op
vi.mock("@/lib/audit", () => ({
  writeAuditLog: vi.fn(async () => {}),
  hashIP: vi.fn(() => "hashed-ip"),
  getClientIP: vi.fn(() => "127.0.0.1"),
}));

// Mock provenance — no-op stubs
vi.mock("@/lib/provenance", () => ({
  createDPR: vi.fn(() => ({ dpr_id: "test", chain_hash: "test", sequence_number: 0 })),
  getChainRef: vi.fn(() => ({ dpr_id: "test", chain_hash: "test", sequence_number: 0 })),
  storeDPR: vi.fn(async () => {}),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_USER_ID = "test-user-001";

async function makeAuthHeader(): Promise<string> {
  const token = await createToken({ user_id: TEST_USER_ID, sub: "stripe_cus_test" });
  return `Bearer ${token}`;
}

function seedUser(userId: string, status: "active" | "canceled" = "active") {
  const user = {
    user_id: userId,
    stripe_customer_id: "cus_test",
    subscription_status: status,
    billing_cycle_anchor: new Date().toISOString(),
    consents: {
      essential_processing: { granted: true, timestamp: new Date().toISOString(), policy_version: "1.0" },
      session_telemetry: { granted: true, timestamp: new Date().toISOString(), policy_version: "1.0" },
      marketing_communications: { granted: false, timestamp: new Date().toISOString(), policy_version: "1.0" },
    },
    pending_deletion: null,
  };
  mockRedisStore.set(`user:${userId}`, JSON.stringify(user));
}

function seedSession(sessionId: string, userId: string, overrides: Partial<SessionState> = {}) {
  const session: SessionState = {
    session_id: sessionId,
    user_id: userId,
    start_time: new Date().toISOString(),
    llm_call_count: 0,
    gate_type: null,
    latency_per_turn: [],
    conversation_history: [],
    session_completed: null,
    user_proceeded: null,
    error: null,
    ...overrides,
  };
  mockRedisStore.set(`session:${sessionId}`, JSON.stringify(session));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/v1/health", () => {
  it("returns status ok with timestamp and version", async () => {
    const { GET } = await import("@/app/api/v1/health/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
    expect(body.version).toBe("0.1.0");
  });
});

describe("POST /api/v1/session/start", () => {
  beforeEach(() => {
    mockRedisStore.clear();
  });

  it("returns 401 without auth header", async () => {
    const { POST } = await import("@/app/api/v1/session/start/route");
    const request = new NextRequest("http://localhost/api/v1/session/start", {
      method: "POST",
    });
    const response = await POST(request);
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 401 with invalid token", async () => {
    const { POST } = await import("@/app/api/v1/session/start/route");
    const request = new NextRequest("http://localhost/api/v1/session/start", {
      method: "POST",
      headers: { authorization: "Bearer invalid-token-here" },
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 403 without active subscription", async () => {
    seedUser(TEST_USER_ID, "canceled");
    const { POST } = await import("@/app/api/v1/session/start/route");
    const request = new NextRequest("http://localhost/api/v1/session/start", {
      method: "POST",
      headers: { authorization: await makeAuthHeader() },
    });
    const response = await POST(request);
    expect(response.status).toBe(403);

    const body = await response.json();
    expect(body.error).toBe("forbidden");
  });

  it("returns session_id with valid auth and active subscription", async () => {
    seedUser(TEST_USER_ID, "active");
    const { POST } = await import("@/app/api/v1/session/start/route");
    const request = new NextRequest("http://localhost/api/v1/session/start", {
      method: "POST",
      headers: { authorization: await makeAuthHeader() },
    });
    const response = await POST(request);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.session_id).toBeDefined();
    expect(typeof body.session_id).toBe("string");
    expect(body.session_id.length).toBeGreaterThan(0);
  });
});

describe("POST /api/v1/session/[id]/message", () => {
  beforeEach(() => {
    mockRedisStore.clear();
  });

  it("returns 401 without auth", async () => {
    const { POST } = await import("@/app/api/v1/session/[id]/message/route");
    const request = new NextRequest("http://localhost/api/v1/session/test-id/message", {
      method: "POST",
      body: JSON.stringify({ message: "hello" }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: "test-id" }) });
    expect(response.status).toBe(401);
  });

  it("returns 404 for non-existent session", async () => {
    seedUser(TEST_USER_ID);
    const { POST } = await import("@/app/api/v1/session/[id]/message/route");
    const request = new NextRequest("http://localhost/api/v1/session/no-such-session/message", {
      method: "POST",
      headers: {
        authorization: await makeAuthHeader(),
        "content-type": "application/json",
      },
      body: JSON.stringify({ message: "hello" }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: "no-such-session" }) });
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error).toBe("not_found");
  });

  it("returns 403 when accessing another user's session", async () => {
    seedUser(TEST_USER_ID);
    seedSession("other-session", "different-user-id");
    const { POST } = await import("@/app/api/v1/session/[id]/message/route");
    const request = new NextRequest("http://localhost/api/v1/session/other-session/message", {
      method: "POST",
      headers: {
        authorization: await makeAuthHeader(),
        "content-type": "application/json",
      },
      body: JSON.stringify({ message: "hello" }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: "other-session" }) });
    expect(response.status).toBe(403);

    const body = await response.json();
    expect(body.error).toBe("forbidden");
  });

  it("rejects empty message with 400", async () => {
    seedUser(TEST_USER_ID);
    seedSession("sess-1", TEST_USER_ID);
    const { POST } = await import("@/app/api/v1/session/[id]/message/route");
    const request = new NextRequest("http://localhost/api/v1/session/sess-1/message", {
      method: "POST",
      headers: {
        authorization: await makeAuthHeader(),
        "content-type": "application/json",
      },
      body: JSON.stringify({ message: "" }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: "sess-1" }) });
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toBe("empty_input");
  });

  it("rejects message longer than 2000 characters", async () => {
    seedUser(TEST_USER_ID);
    seedSession("sess-long", TEST_USER_ID);
    const { POST } = await import("@/app/api/v1/session/[id]/message/route");
    const longMessage = "a".repeat(2001);
    const request = new NextRequest("http://localhost/api/v1/session/sess-long/message", {
      method: "POST",
      headers: {
        authorization: await makeAuthHeader(),
        "content-type": "application/json",
      },
      body: JSON.stringify({ message: longMessage }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: "sess-long" }) });
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toBe("empty_input");
    expect(body.message).toContain("2000");
  });

  it("rejects when session turns exhausted (409)", async () => {
    seedUser(TEST_USER_ID);
    seedSession("sess-full", TEST_USER_ID, { llm_call_count: 2 });
    const { POST } = await import("@/app/api/v1/session/[id]/message/route");
    const request = new NextRequest("http://localhost/api/v1/session/sess-full/message", {
      method: "POST",
      headers: {
        authorization: await makeAuthHeader(),
        "content-type": "application/json",
      },
      body: JSON.stringify({ message: "one more question" }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: "sess-full" }) });
    expect(response.status).toBe(409);

    const body = await response.json();
    expect(body.error).toBe("session_complete");
  });

  it("rejects when session timed out (409)", async () => {
    seedUser(TEST_USER_ID);
    const expiredStart = new Date(Date.now() - 130_000).toISOString(); // 130s ago
    seedSession("sess-expired", TEST_USER_ID, { start_time: expiredStart });
    const { POST } = await import("@/app/api/v1/session/[id]/message/route");
    const request = new NextRequest("http://localhost/api/v1/session/sess-expired/message", {
      method: "POST",
      headers: {
        authorization: await makeAuthHeader(),
        "content-type": "application/json",
      },
      body: JSON.stringify({ message: "am I still here?" }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: "sess-expired" }) });
    expect(response.status).toBe(409);

    const body = await response.json();
    expect(body.error).toBe("session_timeout");
  });
});

describe("POST /api/v1/session/[id]/end", () => {
  beforeEach(() => {
    mockRedisStore.clear();
  });

  it("returns 401 without auth", async () => {
    const { POST } = await import("@/app/api/v1/session/[id]/end/route");
    const request = new NextRequest("http://localhost/api/v1/session/test-id/end", {
      method: "POST",
    });
    const response = await POST(request, { params: Promise.resolve({ id: "test-id" }) });
    expect(response.status).toBe(401);
  });

  it("returns 404 for non-existent session", async () => {
    const { POST } = await import("@/app/api/v1/session/[id]/end/route");
    const request = new NextRequest("http://localhost/api/v1/session/no-sess/end", {
      method: "POST",
      headers: { authorization: await makeAuthHeader() },
    });
    const response = await POST(request, { params: Promise.resolve({ id: "no-sess" }) });
    expect(response.status).toBe(404);
  });

  it("returns 403 for another user's session", async () => {
    seedSession("foreign-sess", "other-user");
    const { POST } = await import("@/app/api/v1/session/[id]/end/route");
    const request = new NextRequest("http://localhost/api/v1/session/foreign-sess/end", {
      method: "POST",
      headers: { authorization: await makeAuthHeader() },
    });
    const response = await POST(request, { params: Promise.resolve({ id: "foreign-sess" }) });
    expect(response.status).toBe(403);
  });

  it("ends session successfully and returns correct shape", async () => {
    seedUser(TEST_USER_ID);
    seedSession("sess-end", TEST_USER_ID, { llm_call_count: 1 });
    const { POST } = await import("@/app/api/v1/session/[id]/end/route");
    const request = new NextRequest("http://localhost/api/v1/session/sess-end/end", {
      method: "POST",
      headers: { authorization: await makeAuthHeader() },
    });
    const response = await POST(request, { params: Promise.resolve({ id: "sess-end" }) });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.session_id).toBe("sess-end");
    expect(body.session_completed).toBe(true);
  });
});

describe("API response shape contracts", () => {
  it("health response matches HealthResponse type", async () => {
    const { GET } = await import("@/app/api/v1/health/route");
    const response = await GET();
    const body = await response.json();

    // Exactly three keys
    const keys = Object.keys(body).sort();
    expect(keys).toEqual(["status", "timestamp", "version"]);
  });

  it("error responses always have error and message fields", async () => {
    const { POST } = await import("@/app/api/v1/session/start/route");
    const request = new NextRequest("http://localhost/api/v1/session/start", {
      method: "POST",
    });
    const response = await POST(request);
    const body = await response.json();

    expect(body).toHaveProperty("error");
    expect(body).toHaveProperty("message");
    expect(typeof body.error).toBe("string");
    expect(typeof body.message).toBe("string");
  });
});
