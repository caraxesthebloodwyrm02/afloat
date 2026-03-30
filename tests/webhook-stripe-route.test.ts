import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockKv = new Map<string, string>();
const mockWriteAuditLog = vi.fn<(entry: unknown) => Promise<void>>(async () => {});
const mockConstructWebhookEvent = vi.fn();
const mockIsStripeConfigured = vi.fn(() => true);
const mockCheckoutRetrieve = vi.fn();

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    set: vi.fn(async (key: string, value: string) => {
      mockKv.set(key, value);
      return "OK";
    }),
    get: vi.fn(async (key: string) => mockKv.get(key) ?? null),
    del: vi.fn(async (key: string) => {
      mockKv.delete(key);
      return 1;
    }),
    rpush: vi.fn(async () => 1),
    lrange: vi.fn(async () => []),
    scan: vi.fn(async () => [0, []]),
  }),
}));

vi.mock("@/lib/audit", () => ({
  writeAuditLog: (entry: unknown) => mockWriteAuditLog(entry),
}));

vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => mockIsStripeConfigured(),
  constructWebhookEvent: (body: string, signature: string) =>
    mockConstructWebhookEvent(body, signature),
  getStripe: () => ({
    checkout: {
      sessions: {
        retrieve: (sessionId: string, options?: unknown) =>
          mockCheckoutRetrieve(sessionId, options),
      },
    },
  }),
}));

import { POST as webhookPOST } from "@/app/api/v1/webhooks/stripe/route";

function makeRequest(eventBody: string, withSignature: boolean = true): NextRequest {
  return new NextRequest("http://localhost/api/v1/webhooks/stripe", {
    method: "POST",
    headers: withSignature ? { "stripe-signature": "sig_test" } : {},
    body: eventBody,
  });
}

function seedUserByCustomer(
  customerId: string,
  userId: string,
  status: "active" | "past_due" | "canceled" = "active",
  tier: "trial" | "continuous" = "trial",
): void {
  mockKv.set(`stripe_map:${customerId}`, userId);
  mockKv.set(
    `user:${userId}`,
    JSON.stringify({
      user_id: userId,
      stripe_customer_id: customerId,
      subscription_status: status,
      subscription_tier: tier,
      billing_cycle_anchor: new Date().toISOString(),
      consents: {
        essential_processing: {
          granted: true,
          timestamp: new Date().toISOString(),
          policy_version: "v1.0",
        },
        session_telemetry: {
          granted: true,
          timestamp: new Date().toISOString(),
          policy_version: "v1.0",
        },
        marketing_communications: {
          granted: false,
          timestamp: new Date().toISOString(),
          policy_version: "v1.0",
        },
        routing_memory: {
          granted: false,
          timestamp: new Date().toISOString(),
          policy_version: "v1.0",
        },
      },
      pending_deletion: null,
    }),
  );
}

describe("POST /api/v1/webhooks/stripe", () => {
  beforeEach(() => {
    mockKv.clear();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mockIsStripeConfigured.mockReturnValue(true);
    mockCheckoutRetrieve.mockResolvedValue({
      line_items: { data: [] },
    });
  });

  it("returns 501 when Stripe billing is not configured", async () => {
    mockIsStripeConfigured.mockReturnValue(false);
    const response = await webhookPOST(makeRequest("{}"));
    expect(response.status).toBe(501);
  });

  it("returns 401 when Stripe signature is missing", async () => {
    const response = await webhookPOST(makeRequest("{}", false));
    expect(response.status).toBe(401);
  });

  it("returns 401 for invalid webhook signatures", async () => {
    mockConstructWebhookEvent.mockRejectedValueOnce(new Error("bad signature"));
    const response = await webhookPOST(makeRequest("{}"));
    expect(response.status).toBe(401);
  });

  it("deduplicates already-processed events", async () => {
    mockKv.set("stripe_event:evt_dup", "1");
    mockConstructWebhookEvent.mockResolvedValueOnce({
      id: "evt_dup",
      type: "invoice.paid",
      data: { object: { customer: "cus_x" } },
    });

    const response = await webhookPOST(makeRequest("{}"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, deduplicated: true });
  });

  it("creates a new user on checkout completion and marks event as processed", async () => {
    vi.stubEnv("STRIPE_CONTINUOUS_PRICE_ID", "price_continuous");
    mockConstructWebhookEvent.mockResolvedValueOnce({
      id: "evt_checkout_new",
      type: "checkout.session.completed",
      data: { object: { id: "cs_new", customer: "cus_new" } },
    });
    mockCheckoutRetrieve.mockResolvedValueOnce({
      line_items: {
        data: [{ price: { id: "price_continuous" } }],
      },
    });

    const response = await webhookPOST(makeRequest("{}"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });

    const mappedUserId = mockKv.get("stripe_map:cus_new");
    expect(mappedUserId).toBeTruthy();

    const userJson = mockKv.get(`user:${mappedUserId}`);
    expect(userJson).toBeTruthy();
    const user = JSON.parse(userJson ?? "{}") as {
      stripe_customer_id: string;
      subscription_status: string;
      subscription_tier: string;
    };
    expect(user.stripe_customer_id).toBe("cus_new");
    expect(user.subscription_status).toBe("active");
    expect(user.subscription_tier).toBe("continuous");
    expect(mockWriteAuditLog).toHaveBeenCalledTimes(1);
    expect(mockKv.get("stripe_event:evt_checkout_new")).toBe("1");
  });

  it("updates an existing user tier on checkout completion", async () => {
    vi.stubEnv("STRIPE_CONTINUOUS_PRICE_ID", "price_continuous");
    seedUserByCustomer("cus_existing", "user_existing", "active", "trial");
    mockConstructWebhookEvent.mockResolvedValueOnce({
      id: "evt_checkout_existing",
      type: "checkout.session.completed",
      data: { object: { id: "cs_existing", customer: "cus_existing" } },
    });
    mockCheckoutRetrieve.mockResolvedValueOnce({
      line_items: {
        data: [{ price: { id: "price_continuous" } }],
      },
    });

    const response = await webhookPOST(makeRequest("{}"));
    expect(response.status).toBe(200);

    const updatedUser = JSON.parse(
      mockKv.get("user:user_existing") ?? "{}",
    ) as { subscription_tier: string };
    expect(updatedUser.subscription_tier).toBe("continuous");
  });

  it("falls back to trial tier when line item lookup fails", async () => {
    seedUserByCustomer("cus_fallback", "user_fallback", "active", "continuous");
    mockConstructWebhookEvent.mockResolvedValueOnce({
      id: "evt_checkout_fallback",
      type: "checkout.session.completed",
      data: { object: { id: "cs_fallback", customer: "cus_fallback" } },
    });
    mockCheckoutRetrieve.mockRejectedValueOnce(new Error("stripe unavailable"));

    const response = await webhookPOST(makeRequest("{}"));
    expect(response.status).toBe(200);

    const updatedUser = JSON.parse(
      mockKv.get("user:user_fallback") ?? "{}",
    ) as { subscription_tier: string };
    expect(updatedUser.subscription_tier).toBe("trial");
  });

  it("updates subscription status on invoice and subscription lifecycle events", async () => {
    seedUserByCustomer("cus_lifecycle", "user_lifecycle", "active", "trial");

    mockConstructWebhookEvent.mockResolvedValueOnce({
      id: "evt_paid",
      type: "invoice.paid",
      data: { object: { customer: "cus_lifecycle" } },
    });
    const paid = await webhookPOST(makeRequest("{}"));
    expect(paid.status).toBe(200);
    expect(
      (JSON.parse(mockKv.get("user:user_lifecycle") ?? "{}") as { subscription_status: string })
        .subscription_status,
    ).toBe("active");

    mockConstructWebhookEvent.mockResolvedValueOnce({
      id: "evt_failed",
      type: "invoice.payment_failed",
      data: { object: { customer: "cus_lifecycle" } },
    });
    const failed = await webhookPOST(makeRequest("{}"));
    expect(failed.status).toBe(200);
    expect(
      (JSON.parse(mockKv.get("user:user_lifecycle") ?? "{}") as { subscription_status: string })
        .subscription_status,
    ).toBe("past_due");

    mockConstructWebhookEvent.mockResolvedValueOnce({
      id: "evt_deleted",
      type: "customer.subscription.deleted",
      data: { object: { customer: "cus_lifecycle" } },
    });
    const deleted = await webhookPOST(makeRequest("{}"));
    expect(deleted.status).toBe(200);
    expect(
      (JSON.parse(mockKv.get("user:user_lifecycle") ?? "{}") as { subscription_status: string })
        .subscription_status,
    ).toBe("canceled");
  });
});
