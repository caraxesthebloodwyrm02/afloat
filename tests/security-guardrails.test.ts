import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing route modules
vi.mock("@/lib/auth", () => ({
  verifyToken: vi.fn(),
}));

vi.mock("@/lib/access", () => ({
  isAllowedCaller: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    rpush: vi.fn().mockResolvedValue(1),
  })),
  isUpstashConfigured: vi.fn(() => false),
}));

vi.mock("@/lib/memory-session-store", () => ({
  createSession: vi.fn(() => ({
    session_id: "test-session-id",
    user_id: "test-user",
    tier: "trial",
  })),
  getSession: vi.fn(),
  getSessionDeadline: vi.fn(),
  enforceSessionLimits: vi.fn(),
  endSession: vi.fn(),
  deleteSession: vi.fn(),
  recordTurn: vi.fn(),
  updateSession: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  constructWebhookEvent: vi.fn(),
  getStripe: vi.fn(),
  isStripeConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/data-layer", () => ({
  createUser: vi.fn(),
  getUserByStripeCustomerId: vi.fn(),
  setStripeCustomerMapping: vi.fn(),
  updateUser: vi.fn(),
  permanentlyDeleteUserData: vi.fn(),
}));

vi.mock("@/lib/consent", () => ({
  createDefaultConsents: vi.fn(() => ({})),
}));

vi.mock("uuid", () => ({
  v4: vi.fn(() => "mock-uuid"),
}));

import { verifyToken, type JWTPayload } from "@/lib/auth";
import { isAllowedCaller } from "@/lib/access";
import { getSession } from "@/lib/memory-session-store";

describe("Security Guardrails — Memory-Session Auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/v1/memory-session/start", () => {
    it("returns 401 without auth header", async () => {
      const { POST } = await import(
        "@/app/api/v1/memory-session/start/route"
      );
      const request = new Request("http://localhost/api/v1/memory-session/start", {
        method: "POST",
      });

      // NextRequest-like wrapper
      const { NextRequest } = await import("next/server");
      const nextReq = new NextRequest(request);
      const response = await POST(nextReq);

      expect(response.status).toBe(401);
    });

    it("returns 403 when caller not in allowlist", async () => {
      const payload: JWTPayload = { user_id: "not-allowed" };
      vi.mocked(verifyToken).mockResolvedValue(payload);
      vi.mocked(isAllowedCaller).mockReturnValue(false);

      const { POST } = await import(
        "@/app/api/v1/memory-session/start/route"
      );
      const { NextRequest } = await import("next/server");
      const request = new NextRequest(
        new Request("http://localhost/api/v1/memory-session/start", {
          method: "POST",
          headers: { Authorization: "Bearer valid-token" },
        }),
      );

      const response = await POST(request);
      expect(response.status).toBe(403);
    });
  });

  describe("POST /api/v1/memory-session/[id]/message", () => {
    it("returns 401 without auth", async () => {
      const { POST } = await import(
        "@/app/api/v1/memory-session/[id]/message/route"
      );
      const { NextRequest } = await import("next/server");
      const request = new NextRequest(
        new Request("http://localhost/api/v1/memory-session/test-id/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "test" }),
        }),
      );

      const response = await POST(request, {
        params: Promise.resolve({ id: "test-id" }),
      });
      expect(response.status).toBe(401);
    });

    it("returns 403 when user does not own session", async () => {
      const payload: JWTPayload = { user_id: "user-a" };
      vi.mocked(verifyToken).mockResolvedValue(payload);
      vi.mocked(isAllowedCaller).mockReturnValue(true);
      vi.mocked(getSession).mockReturnValue({
        session_id: "test-id",
        user_id: "user-b",
        tier: "trial",
        start_time: new Date().toISOString(),
        llm_call_count: 0,
        gate_type: null,
        latency_per_turn: [],
        conversation_history: [],
        session_completed: null,
        user_proceeded: null,
        error: null,
      });

      const { POST } = await import(
        "@/app/api/v1/memory-session/[id]/message/route"
      );
      const { NextRequest } = await import("next/server");
      const request = new NextRequest(
        new Request("http://localhost/api/v1/memory-session/test-id/message", {
          method: "POST",
          headers: {
            Authorization: "Bearer valid-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: "test" }),
        }),
      );

      const response = await POST(request, {
        params: Promise.resolve({ id: "test-id" }),
      });
      expect(response.status).toBe(403);
    });
  });

  describe("POST /api/v1/memory-session/[id]/end", () => {
    it("returns 401 without auth", async () => {
      const { POST } = await import(
        "@/app/api/v1/memory-session/[id]/end/route"
      );
      const { NextRequest } = await import("next/server");
      const request = new NextRequest(
        new Request("http://localhost/api/v1/memory-session/test-id/end", {
          method: "POST",
        }),
      );

      const response = await POST(request, {
        params: Promise.resolve({ id: "test-id" }),
      });
      expect(response.status).toBe(401);
    });
  });
});

describe("Security Guardrails — Stripe Webhook Signature", () => {
  it("returns 401 without stripe-signature header", async () => {
    const { POST } = await import(
      "@/app/api/v1/webhooks/stripe/route"
    );
    const { NextRequest } = await import("next/server");
    const request = new NextRequest(
      new Request("http://localhost/api/v1/webhooks/stripe", {
        method: "POST",
        body: "{}",
      }),
    );

    const response = await POST(request);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("unauthorized");
  });
});

describe("Security Guardrails — Cron Cleanup Auth", () => {
  it("returns 401 without CRON_SECRET", async () => {
    const originalSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "test-secret";

    const { GET } = await import("@/app/api/cron/cleanup/route");
    const { NextRequest } = await import("next/server");
    const request = new NextRequest(
      new Request("http://localhost/api/cron/cleanup", {
        method: "GET",
        headers: { Authorization: "Bearer wrong-secret" },
      }),
    );

    const response = await GET(request);
    expect(response.status).toBe(401);

    process.env.CRON_SECRET = originalSecret;
  });
});
