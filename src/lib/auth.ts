import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

const SESSION_COOKIE = "wasender_session";
const alg = "HS256";

function getSecret() {
  const secret = process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(email: string) {
  return new SignJWT({ email })
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
}

export async function verifySessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as { email: string };
  } catch {
    return null;
  }
}

export async function getSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export function validateCredentials(email: string, password: string) {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
  const adminPasswordPlain = process.env.ADMIN_PASSWORD || "changeme123";

  if (email.trim().toLowerCase() !== adminEmail.trim().toLowerCase()) return false;

  if (adminPasswordHash) {
    return bcrypt.compareSync(password, adminPasswordHash);
  }
  return password === adminPasswordPlain;
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
