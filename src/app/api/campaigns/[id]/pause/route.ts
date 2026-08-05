import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { campaignRunner } from "@/lib/campaign/runner";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  campaignRunner.pause(params.id);
  await prisma.campaign.update({ where: { id: params.id }, data: { status: "paused" } });
  return NextResponse.json({ ok: true });
}
