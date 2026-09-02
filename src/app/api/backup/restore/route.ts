import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { LOCAL_MODE } from "@/lib/local-mode";
import { restoreBackup } from "@/lib/backup";

// Recognized by electron/main.js as "restore finished, please restart the
// server" rather than a crash — keep the two in sync if this ever changes.
const RESTORE_RESTART_CODE = 75;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!LOCAL_MODE && session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No backup file provided" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await restoreBackup(buffer);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Restore failed" }, { status: 400 });
  }

  // The response has to actually reach the browser before this process
  // exits — the Electron shell restarts the server on this exit code once
  // it happens (see electron/main.js), and a fresh Next.js/Prisma process
  // is the only clean way to pick up the just-replaced database file (the
  // one in this process was already closed by restoreBackup()).
  setTimeout(() => process.exit(RESTORE_RESTART_CODE), 500);

  return NextResponse.json({ ok: true, restarting: LOCAL_MODE });
}
