import { SignJWT, jwtVerify } from "jose";

const SESSION_COOKIE = "wasender_session";
const alg = "HS256";

export type SessionPayload = { sub: string; email: string; role: string };

function getSecret() {
  const secret = process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: { id: string; email: string; role: string }) {
  return new SignJWT({ sub: user.id, email: user.email, role: user.role })
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
}

export async function verifySessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
