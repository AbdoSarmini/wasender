import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { waManager } from "@/lib/whatsapp/manager";
import { getSession } from "@/lib/auth";

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = await props.params;
  const device = await prisma.device.findUnique({ where: { id: params.id, userId: session.sub } });
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });
  return NextResponse.json({ device: { ...device, runtime: waManager.getState(device.id) } });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = await props.params;
  const device = await prisma.device.findUnique({ where: { id: params.id, userId: session.sub } });
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  await waManager.logout(device.id, device.clientId);

  const campaignCount = await prisma.campaign.count({ where: { deviceId: device.id } });
  if (campaignCount > 0) {
    return NextResponse.json(
      { error: "Cannot delete a device that has campaigns. Remove its campaigns first." },
      { status: 400 }
    );
  }

  await prisma.device.delete({ where: { id: device.id } });
  return NextResponse.json({ ok: true });
}
