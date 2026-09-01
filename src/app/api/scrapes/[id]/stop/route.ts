import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scraperRunner } from "@/lib/scraper/runner";
import { getSession } from "@/lib/auth";

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = await props.params;
  const job = await prisma.scrapeJob.findUnique({ where: { id: params.id, userId: session.sub } });
  if (!job) return NextResponse.json({ error: "Scrape job not found" }, { status: 404 });

  if (scraperRunner.isActive(job.id)) {
    scraperRunner.stop(job.id);
  } else if (job.status === "queued" || job.status === "running") {
    await prisma.scrapeJob.update({
      where: { id: job.id },
      data: { status: "stopped", completedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
