import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { campaignRunner } from "@/lib/campaign/runner";
import { getSession } from "@/lib/auth";

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = await props.params;
  const campaign = await prisma.campaign.findUnique({ where: { id: params.id, userId: session.sub } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  if (campaignRunner.isActive(campaign.id)) {
    campaignRunner.stop(campaign.id);
  } else {
    await prisma.campaignMessage.updateMany({
      where: { campaignId: campaign.id, status: "queued" },
      data: { status: "skipped" },
    });
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "completed", completedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
