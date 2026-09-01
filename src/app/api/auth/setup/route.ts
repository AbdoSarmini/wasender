import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSessionToken, setSessionCookie } from "@/lib/auth";

// Public: lets the client know whether to show the first-run setup page
// instead of the login page.
export async function GET() {
  const userCount = await prisma.user.count();
  return NextResponse.json({ needsSetup: userCount === 0 });
}

// Public, but only does anything the very first time — once any user
// exists, this always 409s so it can never be used to add a second admin.
export async function POST(req: NextRequest) {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    return NextResponse.json({ error: "Setup has already been completed" }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const email = (body?.email as string | undefined)?.trim().toLowerCase();
  const password = body?.password as string | undefined;

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash, role: "admin" },
  });

  const token = await createSessionToken(user);
  await setSessionCookie(token);

  return NextResponse.json({ ok: true }, { status: 201 });
}
