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

  campaignRunner.pause(params.id);
  await prisma.campaign.update({ where: { id: params.id }, data: { status: "paused" } });
  return NextResponse.json({ ok: true });
}
