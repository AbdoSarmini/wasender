import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, setSessionCookie, validateCredentials } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = body?.email as string | undefined;
  const password = body?.password as string | undefined;

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  if (!validateCredentials(email, password)) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const token = await createSessionToken(email);
  await setSessionCookie(token);

  return NextResponse.json({ ok: true });
}
