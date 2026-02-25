import { SignJWT, jwtVerify } from "jose";

const JWT_EXPIRY = "1h";
const JWT_ISSUER = "afloat";
const JWT_AUDIENCE = "afloat-api";

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("Missing JWT_SECRET environment variable");
  }
  return new TextEncoder().encode(secret);
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
