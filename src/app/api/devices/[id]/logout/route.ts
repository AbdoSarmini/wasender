import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { waManager } from "@/lib/whatsapp/manager";

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const device = await prisma.device.findUnique({ where: { id: params.id } });
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  await waManager.logout(device.id, device.clientId);
  return NextResponse.json({ ok: true });
}
