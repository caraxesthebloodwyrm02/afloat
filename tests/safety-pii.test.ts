import { describe, it, expect } from "vitest";
import { detectAndRedactPII } from "@/lib/safety";

describe("detectAndRedactPII", () => {
  it("redacts email addresses", () => {
    const r = detectAndRedactPII("Contact me at user@example.com please");
    expect(r.pii_found).toBe(true);
    expect(r.types_detected).toContain("email_address");
    expect(r.redacted_text).toBe("Contact me at [REDACTED] please");
  });

  it("redacts US phone numbers", () => {
    const r = detectAndRedactPII("Call me at (555) 123-4567");
    expect(r.pii_found).toBe(true);
    expect(r.types_detected).toContain("phone_number");
    expect(r.redacted_text).toContain("[REDACTED]");
  });

  it("redacts SSN", () => {
    const r = detectAndRedactPII("My SSN is 123-45-6789");
    expect(r.pii_found).toBe(true);
    expect(r.types_detected).toContain("social_security_number");
  });

  it("redacts credit card numbers", () => {
    const r = detectAndRedactPII("Card: 4111-1111-1111-1111");
    expect(r.pii_found).toBe(true);
    expect(r.types_detected).toContain("credit_card_number");
  });

  it("detects multiple PII types", () => {
    const r = detectAndRedactPII("Email user@test.com, SSN 123-45-6789");
    expect(r.types_detected).toHaveLength(2);
    expect(r.type_counts["email_address"]).toBe(1);
    expect(r.type_counts["social_security_number"]).toBe(1);
  });

  it("returns unchanged text when no PII found", () => {
    const input = "Should I attend the Q3 planning meeting?";
    const r = detectAndRedactPII(input);
    expect(r.pii_found).toBe(false);
    expect(r.redacted_text).toBe(input);
  });

  it("handles Unicode text without false positives", () => {
    const r = detectAndRedactPII("আমি কী করব? これはテストです");
    expect(r.pii_found).toBe(false);
  });

  it("redacts multiple email addresses", () => {
    const r = detectAndRedactPII("Send to alice@test.com and bob@test.com");
    expect(r.type_counts["email_address"]).toBe(2);
    expect(r.redacted_text).toBe("Send to [REDACTED] and [REDACTED]");
  });

  it("redacts phone number with +1 prefix", () => {
    const r = detectAndRedactPII("Call +1-555-123-4567 now");
    expect(r.pii_found).toBe(true);
    expect(r.types_detected).toContain("phone_number");
  });

  it("redacts credit card with spaces", () => {
    const r = detectAndRedactPII("Card: 4111 1111 1111 1111");
    expect(r.pii_found).toBe(true);
    expect(r.types_detected).toContain("credit_card_number");
  });
});
