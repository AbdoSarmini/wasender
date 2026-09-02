import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { LOCAL_MODE } from "@/lib/local-mode";
import { createBackup } from "@/lib/backup";

export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!LOCAL_MODE && session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const zip = await createBackup();
  const filename = `wasender-backup-${new Date().toISOString().slice(0, 10)}.zip`;

  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
