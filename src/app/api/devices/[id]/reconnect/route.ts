import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { waManager } from "@/lib/whatsapp/manager";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const device = await prisma.device.findUnique({ where: { id: params.id } });
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  waManager.start(device.id, device.clientId).catch((err) => {
    console.error("Failed to reconnect WhatsApp client", err);
  });

  return NextResponse.json({ ok: true });
}
