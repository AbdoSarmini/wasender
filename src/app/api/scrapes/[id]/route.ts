import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scraperRunner } from "@/lib/scraper/runner";
import { getSession } from "@/lib/auth";

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = await props.params;
  const job = await prisma.scrapeJob.findUnique({
    where: { id: params.id, userId: session.sub },
    include: { _count: { select: { results: true } } },
  });
  if (!job) return NextResponse.json({ error: "Scrape job not found" }, { status: 404 });
  return NextResponse.json({ job });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = await props.params;
  const job = await prisma.scrapeJob.findUnique({ where: { id: params.id, userId: session.sub } });
  if (!job) return NextResponse.json({ error: "Scrape job not found" }, { status: 404 });

  if (scraperRunner.isActive(job.id)) {
    scraperRunner.stop(job.id);
  }
  await prisma.scrapeJob.delete({ where: { id: job.id } });
  return NextResponse.json({ ok: true });
}
