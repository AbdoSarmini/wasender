import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = await props.params;
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id, userId: session.sub },
    include: {
      groups: true,
      messages: true,
    },
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const duplicate = await prisma.campaign.create({
    data: {
      name: `${campaign.name} (copy)`,
      userId: session.sub,
      deviceId: campaign.deviceId,
      templateId: campaign.templateId,
      minDelay: campaign.minDelay,
      maxDelay: campaign.maxDelay,
      targetAll: campaign.targetAll,
      totalCount: campaign.messages.length,
      groups: {
        create: campaign.groups.map((g) => ({ groupId: g.groupId })),
      },
      messages: {
        create: campaign.messages.map((m) => ({
          contactId: m.contactId,
          rawName: m.rawName,
          rawPhone: m.rawPhone,
          rawFields: m.rawFields,
        })),
      },
    },
    include: { device: true, template: true },
  });

  return NextResponse.json({ campaign: duplicate }, { status: 201 });
}
