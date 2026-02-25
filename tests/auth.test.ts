import { describe, it, expect, beforeAll } from "vitest";
import { createToken, verifyToken } from "@/lib/auth";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-for-unit-tests-only";
});

describe("JWT auth", () => {
  it("creates and verifies a valid token", async () => {
    const token = await createToken({ user_id: "user-123", sub: "cus_abc" });
    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");

    const payload = await verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.user_id).toBe("user-123");
    expect(payload!.sub).toBe("cus_abc");
  });

  it("returns null for an invalid token", async () => {
    const payload = await verifyToken("not-a-valid-token");
    expect(payload).toBeNull();
  });

  it("returns null for a tampered token", async () => {
    const token = await createToken({ user_id: "user-456" });
    const tampered = token.slice(0, -5) + "XXXXX";
    const payload = await verifyToken(tampered);
    expect(payload).toBeNull();
  });

  it("includes user_id in the payload", async () => {
    const token = await createToken({ user_id: "user-789" });
    const payload = await verifyToken(token);
    expect(payload!.user_id).toBe("user-789");
  });
});
