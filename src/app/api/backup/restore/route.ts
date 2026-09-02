import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { LOCAL_MODE } from "@/lib/local-mode";
import { stageRestore } from "@/lib/backup";
import { waManager } from "@/lib/whatsapp/manager";

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
    await stageRestore(buffer);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Restore failed" }, { status: 400 });
  }

  // Close Chrome now rather than leaving it to die with the process — an
  // orphaned Chrome instance would keep holding the old .wwebjs_auth files
  // locked into the next process, which is starting fresh specifically to
  // replace them without any locks in the way.
  await waManager.stopAll();

  // The actual file replacement happens on the next process's startup (see
  // applyPendingRestoreIfAny() in server.ts) — this process still has
  // dev.db/.wwebjs_auth open itself, so it can't safely touch them. The
  // response has to actually reach the browser before exiting; the Electron
  // shell restarts the server on this exit code once it happens.
  setTimeout(() => process.exit(RESTORE_RESTART_CODE), 500);

  return NextResponse.json({ ok: true, restarting: LOCAL_MODE });
}
