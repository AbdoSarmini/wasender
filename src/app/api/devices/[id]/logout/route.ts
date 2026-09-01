import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { waManager } from "@/lib/whatsapp/manager";
import { getSession } from "@/lib/auth";

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = await props.params;
  const device = await prisma.device.findUnique({ where: { id: params.id, userId: session.sub } });
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  await waManager.logout(device.id, device.clientId);
  return NextResponse.json({ ok: true });
}
