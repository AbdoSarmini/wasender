import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scraperRunner } from "@/lib/scraper/runner";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const jobs = await prisma.scrapeJob.findMany({
    where: { userId: session.sub },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { results: true } } },
  });
  return NextResponse.json({ jobs });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const query = (body?.query as string)?.trim();
  const location = (body?.location as string)?.trim();
  const maxResultsRaw = parseInt(body?.maxResults, 10);
  const maxResults = Number.isFinite(maxResultsRaw) ? Math.min(200, Math.max(1, maxResultsRaw)) : 60;

  if (!query || !location) {
    return NextResponse.json({ error: "Search query and location are required" }, { status: 400 });
  }

  if (scraperRunner.isAnyActive()) {
    return NextResponse.json(
      { error: "Another scrape job is already running. Wait for it to finish or stop it first." },
      { status: 409 }
    );
  }

  const job = await prisma.scrapeJob.create({
    data: { query, location, maxResults, status: "queued", userId: session.sub },
  });

  try {
    await scraperRunner.start(job.id);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 409 });
  }

  return NextResponse.json({ job }, { status: 201 });
}
