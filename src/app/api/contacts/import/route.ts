import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { prisma } from "@/lib/prisma";

function normalizePhone(raw: string) {
  return String(raw).replace(/[^\d+]/g, "").replace(/^\+/, "");
}

function findKey(row: Record<string, string>, patterns: RegExp[]) {
  return Object.keys(row).find((k) => patterns.some((p) => p.test(k.trim())));
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const groupId = (form.get("groupId") as string) || null;
  const groupName = (form.get("groupName") as string)?.trim() || null;

  if (!file || file.size === 0) {
    return NextResponse.json({ error: "A CSV file is required" }, { status: 400 });
  }

  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors?.length) {
    const fatal = parsed.errors.find((e) => e.type !== "FieldMismatch");
    if (fatal) {
      return NextResponse.json({ error: `CSV parse error: ${fatal.message}` }, { status: 400 });
    }
  }

  const rows = parsed.data.filter((r) => Object.values(r).some((v) => v && v.trim()));
  if (rows.length === 0) {
    return NextResponse.json({ error: "No rows found in CSV" }, { status: 400 });
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

  const phoneKey = findKey(rows[0], [/^phone$/i, /mobile/i, /number/i, /whats.?app/i]);
  const nameKey = findKey(rows[0], [/^name$/i, /full.?name/i, /contact/i]);

  if (!phoneKey) {
    return NextResponse.json(
      { error: "Could not find a phone/mobile/number column in the CSV" },
      { status: 400 }
    );
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const phoneRaw = row[phoneKey];
    if (!phoneRaw) {
      skipped++;
      continue;
    }
    const phone = normalizePhone(phoneRaw);
    if (phone.length < 6) {
      skipped++;
      errors.push(`Invalid phone: ${phoneRaw}`);
      continue;
    }
    const name = (nameKey ? row[nameKey] : "")?.trim() || phone;

    const extra: Record<string, string> = {};
    for (const key of Object.keys(row)) {
      if (key === phoneKey || key === nameKey) continue;
      if (row[key]) extra[key] = row[key];
    }
    const fields = Object.keys(extra).length ? JSON.stringify(extra) : null;

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
    total: rows.length,
    errors: errors.slice(0, 20),
  });
}
