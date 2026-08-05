import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { campaignRunner } from "@/lib/campaign/runner";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    include: {
      device: true,
      template: true,
      groups: { include: { group: true } },
      messages: {
        include: { contact: true },
        orderBy: { createdAt: "asc" },
        take: 200,
      },
    },
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  return NextResponse.json({ campaign, isActive: campaignRunner.isActive(campaign.id) });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const campaign = await prisma.campaign.findUnique({ where: { id: params.id } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (campaignRunner.isActive(campaign.id)) {
    campaignRunner.stop(campaign.id);
  }
  await prisma.campaign.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
