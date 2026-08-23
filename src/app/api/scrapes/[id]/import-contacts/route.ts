import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/csv-contacts";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const body = await req.json().catch(() => ({}));
  const groupId = (body?.groupId as string) || null;
  const groupName = (body?.groupName as string)?.trim() || null;

  const job = await prisma.scrapeJob.findUnique({ where: { id: params.id } });
  if (!job) return NextResponse.json({ error: "Scrape job not found" }, { status: 404 });

  const results = await prisma.scrapeResult.findMany({
    where: { scrapeJobId: params.id, phone: { not: null } },
  });
  if (results.length === 0) {
    return NextResponse.json({ error: "No results with a phone number to import" }, { status: 400 });
  }

  let resolvedGroupId = groupId;
  if (!resolvedGroupId && groupName) {
    const group = await prisma.group.upsert({
      where: { name: groupName },
      update: {},
      create: { name: groupName },
    });
    resolvedGroupId = group.id;
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const seenPhones = new Set<string>();

  for (const r of results) {
    const phone = normalizePhone(r.phone as string);
    if (phone.length < 6 || seenPhones.has(phone)) {
      skipped++;
      continue;
    }
    seenPhones.add(phone);

    const fields = r.address || r.category ? JSON.stringify({ address: r.address, category: r.category }) : null;

    const existing = await prisma.contact.findUnique({ where: { phone } });
    if (existing) {
      await prisma.contact.update({
        where: { phone },
        data: { groupId: resolvedGroupId ?? existing.groupId },
      });
      updated++;
    } else {
      await prisma.contact.create({
        data: { name: r.name, phone, fields, groupId: resolvedGroupId },
      });
      created++;
    }
  }

  return NextResponse.json({ created, updated, skipped, total: results.length });
}
