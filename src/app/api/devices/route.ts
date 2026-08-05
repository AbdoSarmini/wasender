import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { waManager } from "@/lib/whatsapp/manager";

export async function GET() {
  const devices = await prisma.device.findMany({ orderBy: { createdAt: "asc" } });
  const withRuntime = devices.map((d) => ({ ...d, runtime: waManager.getState(d.id) }));
  return NextResponse.json({ devices: withRuntime });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = (body?.name as string)?.trim() || `Device ${Date.now()}`;

  const deviceCount = await prisma.device.count();
  const DEVICE_LIMIT = parseInt(process.env.DEVICE_LIMIT || "5", 10);
  if (deviceCount >= DEVICE_LIMIT) {
    return NextResponse.json(
      { error: `Device limit reached (${deviceCount}/${DEVICE_LIMIT}).` },
      { status: 400 }
    );
  }

  const clientId = crypto.randomUUID();
  const device = await prisma.device.create({
    data: { name, clientId, status: "initializing" },
  });

  waManager.start(device.id, clientId).catch((err) => {
    console.error("Failed to initialize WhatsApp client", err);
  });

  return NextResponse.json({ device }, { status: 201 });
}
