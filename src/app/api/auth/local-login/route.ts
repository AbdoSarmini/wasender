import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { LOCAL_MODE, LOCAL_ADMIN_EMAIL } from "@/lib/local-mode";

// Desktop build only: finds (or creates, on first launch) the single local
// admin account and logs the browser into it — no credentials ever change
// hands since there's nothing to separate on a single-user local install.
export async function POST() {
  if (!LOCAL_MODE) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  let user = await prisma.user.findUnique({ where: { email: LOCAL_ADMIN_EMAIL } });
  if (!user) {
    // Password is never used to log in — local mode always authenticates via
    // this endpoint — so a random value just satisfies the NOT NULL column.
    const passwordHash = bcrypt.hashSync(randomUUID(), 10);
    user = await prisma.user.create({
      data: { email: LOCAL_ADMIN_EMAIL, passwordHash, role: "admin" },
    });
  }

  const token = await createSessionToken(user);
  await setSessionCookie(token);

  return NextResponse.json({ ok: true });
}
