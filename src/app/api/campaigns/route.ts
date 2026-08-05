import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      device: { select: { id: true, name: true, status: true } },
      template: { select: { id: true, name: true } },
      groups: { include: { group: true } },
    },
  });
  return NextResponse.json({ campaigns });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = (body?.name as string)?.trim();
  const deviceId = body?.deviceId as string;
  const templateId = body?.templateId as string;
  const targetAll = Boolean(body?.targetAll);
  const groupIds: string[] = Array.isArray(body?.groupIds) ? body.groupIds : [];
  const minDelay = Math.max(1, parseInt(body?.minDelay ?? 5, 10) || 5);
  const maxDelay = Math.max(minDelay, parseInt(body?.maxDelay ?? 15, 10) || 15);

  if (!name || !deviceId || !templateId) {
    return NextResponse.json({ error: "Name, device and template are required" }, { status: 400 });
  }
  if (!targetAll && groupIds.length === 0) {
    return NextResponse.json({ error: "Select at least one contact group or target all contacts" }, { status: 400 });
  }

  const [device, template] = await Promise.all([
    prisma.device.findUnique({ where: { id: deviceId } }),
    prisma.template.findUnique({ where: { id: templateId } }),
  ]);
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const contacts = await prisma.contact.findMany({
    where: targetAll ? {} : { groupId: { in: groupIds } },
    select: { id: true },
  });

  if (contacts.length === 0) {
    return NextResponse.json({ error: "No contacts match the selected audience" }, { status: 400 });
  }

  const campaign = await prisma.campaign.create({
    data: {
      name,
      deviceId,
      templateId,
      minDelay,
      maxDelay,
      targetAll,
      totalCount: contacts.length,
      groups: {
        create: targetAll ? [] : groupIds.map((groupId) => ({ groupId })),
      },
      messages: {
        create: contacts.map((c) => ({ contactId: c.id })),
      },
    },
    include: { device: true, template: true },
  });

  return NextResponse.json({ campaign }, { status: 201 });
}
