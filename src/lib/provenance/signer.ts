import { createHmac, timingSafeEqual } from "crypto";

function getSigningSecret(): string {
  // Provenance signing MUST use a dedicated key — never share with JWT auth.
  // Sharing keys means a compromised auth secret also compromises the entire provenance chain.
  const secret = process.env.PROVENANCE_SIGNING_KEY;
  if (!secret) {
    throw new Error(
      "Missing PROVENANCE_SIGNING_KEY environment variable. " +
      "Provenance signing requires a dedicated key separate from JWT_SECRET. " +
      "Set PROVENANCE_SIGNING_KEY to a secure random value (min 32 chars)."
    );
  }
  if (process.env.JWT_SECRET && secret === process.env.JWT_SECRET) {
    throw new Error(
      "PROVENANCE_SIGNING_KEY must differ from JWT_SECRET. " +
      "Using the same key for auth and provenance defeats key isolation."
    );
  }
  return secret;
}

export function signRecord(serializedRecord: string): string {
  const secret = getSigningSecret();
  return createHmac("sha256", secret).update(serializedRecord).digest("hex");
}

export function verifySignature(
  serializedRecord: string,
  signature: string
): boolean {
  const expected = signRecord(serializedRecord);
  const expectedBuf = Buffer.from(expected, "utf-8");
  const signatureBuf = Buffer.from(signature, "utf-8");
  if (expectedBuf.length !== signatureBuf.length) return false;
  return timingSafeEqual(expectedBuf, signatureBuf);
}
