import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseContactsCsv } from "@/lib/csv-contacts";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const groupId = (form.get("groupId") as string) || null;
  const groupName = (form.get("groupName") as string)?.trim() || null;

  if (!file || file.size === 0) {
    return NextResponse.json({ error: "A CSV file is required" }, { status: 400 });
  }

  const text = await file.text();
  let parsed;
  try {
    parsed = parseContactsCsv(text);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
  const { rows, errors } = parsed;
  let skipped = parsed.skipped;

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

  for (const row of rows) {
    const { phone, name, fields } = row;

    const existing = await prisma.contact.findUnique({ where: { phone } });
    if (existing) {
      await prisma.contact.update({
        where: { phone },
        data: {
          name,
          fields,
          groupId: resolvedGroupId ?? existing.groupId,
        },
      });
      updated++;
    } else {
      await prisma.contact.create({
        data: { name, phone, fields, groupId: resolvedGroupId },
      });
      created++;
    }
  }

  return NextResponse.json({
    created,
    updated,
    skipped,
    total: rows.length + skipped,
    errors,
  });
}
