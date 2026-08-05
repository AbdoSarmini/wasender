import { NextRequest, NextResponse } from "next/server";
import { campaignRunner } from "@/lib/campaign/runner";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await campaignRunner.start(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
