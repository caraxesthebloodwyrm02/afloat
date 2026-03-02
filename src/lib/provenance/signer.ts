import { createHmac, timingSafeEqual } from "crypto";
import { getValidatedSecret } from "../secrets";

function getSigningSecret(): string {
  const secret = getValidatedSecret("PROVENANCE_SIGNING_KEY");
  if (!secret) {
    throw new Error(
      "Missing PROVENANCE_SIGNING_KEY environment variable. " +
      "Provenance signing requires a dedicated key separate from JWT_SECRET. " +
      "Set PROVENANCE_SIGNING_KEY to a secure random value (min 32 chars)."
    );
  }
  const jwtSecret = getValidatedSecret("JWT_SECRET");
  if (jwtSecret && secret === jwtSecret) {
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
