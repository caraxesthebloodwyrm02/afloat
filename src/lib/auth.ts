import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "crypto";

const JWT_EXPIRY = "1h";
const JWT_ISSUER = "afloat";
const JWT_AUDIENCE = "afloat-api";

let generatedDevSecret: string | null = null;

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (secret) {
    return new TextEncoder().encode(secret);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Missing JWT_SECRET environment variable (required in production)");
  }

  // Dev mode: auto-generate a random secret per process lifetime
  if (!generatedDevSecret) {
    generatedDevSecret = randomBytes(32).toString("hex");
    console.warn(
      "[afloat] JWT_SECRET not set — using auto-generated secret. Tokens will not survive restarts."
    );
  }
  return new TextEncoder().encode(generatedDevSecret);
}

export interface JWTPayload {
  user_id: string;
  sub?: string;
}

export async function createToken(payload: JWTPayload): Promise<string> {
  const secret = getSecret();
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setExpirationTime(JWT_EXPIRY)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const secret = getSecret();
    const { payload } = await jwtVerify(token, secret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}
