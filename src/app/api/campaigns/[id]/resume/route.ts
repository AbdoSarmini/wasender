import { NextRequest, NextResponse } from "next/server";
import { campaignRunner } from "@/lib/campaign/runner";

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    await campaignRunner.resume(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
