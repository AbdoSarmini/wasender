import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = await props.params;
  const job = await prisma.scrapeJob.findUnique({ where: { id: params.id, userId: session.sub } });
  if (!job) return NextResponse.json({ error: "Scrape job not found" }, { status: 404 });

  const results = await prisma.scrapeResult.findMany({
    where: { scrapeJobId: params.id },
    orderBy: { scrapedAt: "asc" },
  });

  const csv = Papa.unparse(
    results.map((r) => ({
      name: r.name,
      phone: r.phone ?? "",
      address: r.address ?? "",
      category: r.category ?? "",
      website: r.website ?? "",
      rating: r.rating ?? "",
      reviewCount: r.reviewCount ?? "",
      googleMapsUrl: r.googleMapsUrl ?? "",
      latitude: r.latitude ?? "",
      longitude: r.longitude ?? "",
    }))
  );

  const filename = `${job.query}-${job.location}`.replace(/[^\w.-]+/g, "_").slice(0, 80) || "scrape-results";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
    },
  });
}
