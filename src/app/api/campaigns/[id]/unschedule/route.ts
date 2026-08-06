import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const campaign = await prisma.campaign.findUnique({ where: { id: params.id } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (campaign.status !== "scheduled") {
    return NextResponse.json({ error: "Campaign is not scheduled" }, { status: 400 });
  }

  await prisma.campaign.update({
    where: { id: params.id },
    data: { status: "draft", scheduledAt: null },
  });

  return NextResponse.json({ ok: true });
}
