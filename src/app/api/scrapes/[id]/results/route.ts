import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const url = new URL(req.url);
  const take = Math.min(500, Math.max(1, parseInt(url.searchParams.get("take") ?? "200", 10) || 200));

  const results = await prisma.scrapeResult.findMany({
    where: { scrapeJobId: params.id },
    orderBy: { scrapedAt: "asc" },
    take,
  });
  return NextResponse.json({ results });
}
