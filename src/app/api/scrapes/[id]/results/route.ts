import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = await props.params;
  const job = await prisma.scrapeJob.findUnique({ where: { id: params.id, userId: session.sub } });
  if (!job) return NextResponse.json({ error: "Scrape job not found" }, { status: 404 });

  const url = new URL(req.url);
  const take = Math.min(500, Math.max(1, parseInt(url.searchParams.get("take") ?? "200", 10) || 200));

  const results = await prisma.scrapeResult.findMany({
    where: { scrapeJobId: params.id },
    orderBy: { scrapedAt: "asc" },
    take,
  });
  return NextResponse.json({ results });
}
