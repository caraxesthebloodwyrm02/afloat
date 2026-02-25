import { createHmac } from "crypto";

function getSigningSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("Missing JWT_SECRET for provenance signing");
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
  return expected === signature;
}
