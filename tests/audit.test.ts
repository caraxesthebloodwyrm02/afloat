import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashIP, getClientIP, auditAction, writeAuditLog } from "@/lib/audit";
import { getRedis } from "@/lib/redis";

vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(),
}));

describe("audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("hashIP", () => {
    it("returns SHA-256 hash of IP address", () => {
      const result = hashIP("192.168.1.1");
      expect(result).toMatch(/^[a-f0-9]{64}$/);
      // Same input should produce same hash
      expect(hashIP("192.168.1.1")).toBe(result);
    });

    it("produces different hashes for different IPs", () => {
      const hash1 = hashIP("192.168.1.1");
      const hash2 = hashIP("192.168.1.2");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("getClientIP", () => {
    it("extracts IP from x-forwarded-for header", () => {
      const request = new Request("http://localhost", {
        headers: { "x-forwarded-for": "203.0.113.1, 70.41.3.18" },
      });
      expect(getClientIP(request)).toBe("203.0.113.1");
    });

    it("returns 'unknown' when no x-forwarded-for header", () => {
      const request = new Request("http://localhost");
      expect(getClientIP(request)).toBe("unknown");
    });

    it("trims whitespace from forwarded IP", () => {
      const request = new Request("http://localhost", {
        headers: { "x-forwarded-for": "  203.0.113.1  " },
      });
      expect(getClientIP(request)).toBe("203.0.113.1");
    });
  });

  describe("auditAction", () => {
    it("writes audit log with user and request info", async () => {
      const mockRpush = vi.fn().mockResolvedValue(1);
      vi.mocked(getRedis).mockReturnValue({
        rpush: mockRpush,
        get: vi.fn(),
        set: vi.fn(),
      } as unknown as ReturnType<typeof getRedis>);

      const request = new Request("http://localhost", {
        headers: { "x-forwarded-for": "203.0.113.1" },
      });
      const user = { user_id: "user-123" };

      await auditAction(request, user, {
        action: "create",
        resource_type: "session_log",
        resource_id: "session-456",
        outcome: "success",
        metadata: { tier: "trial" },
      });

      expect(mockRpush).toHaveBeenCalledOnce();
      const call = mockRpush.mock.calls[0];
      const entry = JSON.parse(call[1] as string);
      expect(entry.actor).toBe("user-123");
      expect(entry.action).toBe("create");
      expect(entry.resource_type).toBe("session_log");
      expect(entry.outcome).toBe("success");
      expect(entry.metadata).toEqual({ tier: "trial" });
      expect(entry.ip_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(entry.log_id).toBeDefined();
      expect(entry.timestamp).toBeDefined();
      expect(entry.payload_hash).toBeDefined();
    });
  });

  describe("writeAuditLog", () => {
    it("stores entry in redis with generated fields", async () => {
      const mockRpush = vi.fn().mockResolvedValue(1);
      vi.mocked(getRedis).mockReturnValue({
        rpush: mockRpush,
        get: vi.fn(),
        set: vi.fn(),
      } as unknown as ReturnType<typeof getRedis>);

      await writeAuditLog({
        actor: "user-123",
        action: "read",
        resource_type: "user_profile",
        resource_id: "profile-789",
        outcome: "success",
        ip_hash: "abc123",
        metadata: { source: "api" },
      });

      expect(mockRpush).toHaveBeenCalledOnce();
      const call = mockRpush.mock.calls[0];
      expect(call[0]).toMatch(/^audit:\d{4}-\d{2}-\d{2}$/);
      
      const entry = JSON.parse(call[1] as string);
      expect(entry.log_id).toBeDefined();
      expect(entry.timestamp).toMatch(/^\d{4}-/);
      expect(entry.payload_hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("computes payload hash from entry data", async () => {
      const mockRpush = vi.fn().mockResolvedValue(1);
      vi.mocked(getRedis).mockReturnValue({
        rpush: mockRpush,
        get: vi.fn(),
        set: vi.fn(),
      } as unknown as ReturnType<typeof getRedis>);

      await writeAuditLog({
        actor: "test-user",
        action: "delete",
        resource_type: "consent_record",
        resource_id: "consent-001",
        outcome: "success",
        ip_hash: "hash123",
        metadata: { reason: "user_request" },
      });

      const entry = JSON.parse(mockRpush.mock.calls[0][1] as string);
      // payload_hash should be computed from all fields except itself
      expect(entry.payload_hash).toBeDefined();
      expect(entry.payload_hash.length).toBe(64);
    });
  });
});

describe("additional coverage for lines threshold", () => {
  it("handles auditAction without metadata", async () => {
    const mockRpush = vi.fn().mockResolvedValue(1);
    vi.mocked(getRedis).mockReturnValue({
      rpush: mockRpush,
      get: vi.fn(),
      set: vi.fn(),
    } as unknown as ReturnType<typeof getRedis>);

    const request = new Request("http://localhost");
    const user = { user_id: "user-456" };

    await auditAction(request, user, {
      action: "read",
      resource_type: "user_profile",
      resource_id: "profile-123",
      outcome: "failure",
    });

    expect(mockRpush).toHaveBeenCalledOnce();
    const entry = JSON.parse(mockRpush.mock.calls[0][1] as string);
    expect(entry.metadata).toEqual({});
  });

  it("handles IPv6 in forwarded header", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "2001:db8::1" },
    });
    expect(getClientIP(request)).toBe("2001:db8::1");
  });
});
