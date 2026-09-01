import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

type CsvContactRow = { name: string; phone: string; fields: string | null };

function readScheduledAt(body: unknown): { ok: true; value: Date | null } | { ok: false; error: string } {
  const raw = (body as Record<string, unknown>)?.scheduledAt;
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, error: "Invalid scheduled time" };
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return { ok: false, error: "Invalid scheduled time" };
  if (date.getTime() <= Date.now()) return { ok: false, error: "Scheduled time must be in the future" };
  return { ok: true, value: date };
}

function readCsvContacts(body: unknown): CsvContactRow[] {
  const raw = (body as Record<string, unknown>)?.csvContacts;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (r): r is Record<string, unknown> =>
        !!r && typeof r === "object" && typeof (r as Record<string, unknown>).phone === "string"
    )
    .map((r) => ({
      name: (typeof r.name === "string" && r.name.trim()) || String(r.phone),
      phone: String(r.phone),
      fields: typeof r.fields === "string" ? r.fields : null,
    }));
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const campaigns = await prisma.campaign.findMany({
    where: { userId: session.sub },
    orderBy: { createdAt: "desc" },
    include: {
      device: { select: { id: true, name: true, status: true } },
      template: { select: { id: true, name: true } },
      groups: { include: { group: true } },
    },
  });
  return NextResponse.json({ campaigns });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.sub;
  const body = await req.json().catch(() => ({}));
  const name = (body?.name as string)?.trim();
  const deviceId = body?.deviceId as string;
  const templateId = body?.templateId as string;
  const targetAll = Boolean(body?.targetAll);
  const groupIds: string[] = Array.isArray(body?.groupIds) ? body.groupIds : [];
  const contactIds: string[] = Array.isArray(body?.contactIds) ? body.contactIds : [];
  const csvContacts = readCsvContacts(body);
  const saveToContacts = Boolean(body?.saveToContacts);
  const saveToContactsGroupId = (body?.saveToContactsGroupId as string) || null;
  const saveToContactsGroupName = (body?.saveToContactsGroupName as string)?.trim() || null;
  const minDelay = Math.max(1, parseInt(body?.minDelay ?? 5, 10) || 5);
  const maxDelay = Math.max(minDelay, parseInt(body?.maxDelay ?? 15, 10) || 15);

  const scheduledAtResult = readScheduledAt(body);
  if (!scheduledAtResult.ok) {
    return NextResponse.json({ error: scheduledAtResult.error }, { status: 400 });
  }
  const scheduledAt = scheduledAtResult.value;

  if (!name || !deviceId || !templateId) {
    return NextResponse.json({ error: "Name, device and template are required" }, { status: 400 });
  }
  if (!targetAll && groupIds.length === 0 && contactIds.length === 0 && csvContacts.length === 0) {
    return NextResponse.json(
      { error: "Select at least one group or contact, target all contacts, or upload a CSV" },
      { status: 400 }
    );
  }

  const [device, template] = await Promise.all([
    prisma.device.findUnique({ where: { id: deviceId, userId } }),
    prisma.template.findUnique({ where: { id: templateId, userId } }),
  ]);
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  if (groupIds.length > 0) {
    const ownedGroupCount = await prisma.group.count({ where: { id: { in: groupIds }, userId } });
    if (ownedGroupCount !== groupIds.length) {
      return NextResponse.json({ error: "One or more groups not found" }, { status: 404 });
    }
  }

  let saveGroupId: string | null = null;
  if (saveToContacts) {
    if (saveToContactsGroupId) {
      const group = await prisma.group.findUnique({ where: { id: saveToContactsGroupId, userId } });
      if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
      saveGroupId = group.id;
    } else if (saveToContactsGroupName) {
      const group = await prisma.group.upsert({
        where: { userId_name: { userId, name: saveToContactsGroupName } },
        update: {},
        create: { name: saveToContactsGroupName, userId },
      });
      saveGroupId = group.id;
    }
  }

  const contacts = await prisma.contact.findMany({
    where: targetAll
      ? { userId }
      : {
          userId,
          OR: [
            ...(groupIds.length ? [{ groupId: { in: groupIds } }] : []),
            ...(contactIds.length ? [{ id: { in: contactIds } }] : []),
          ],
        },
    select: { id: true, phone: true },
  });

  // Drop CSV rows that duplicate a phone already covered by the resolved contacts.
  const existingPhones = new Set(contacts.map((c) => c.phone));
  const newCsvRows = csvContacts.filter((r) => !existingPhones.has(r.phone));

  let rawRows: CsvContactRow[] = [];
  if (newCsvRows.length > 0) {
    if (saveToContacts) {
      const savedIds: string[] = [];
      for (const row of newCsvRows) {
        const contact = await prisma.contact.upsert({
          where: { userId_phone: { userId, phone: row.phone } },
          update: saveGroupId
            ? { name: row.name, fields: row.fields, groupId: saveGroupId }
            : { name: row.name, fields: row.fields },
          create: { name: row.name, phone: row.phone, fields: row.fields, groupId: saveGroupId, userId },
        });
        savedIds.push(contact.id);
      }
      contacts.push(...savedIds.map((id) => ({ id, phone: "" })));
    } else {
      rawRows = newCsvRows;
    }
  }

  const totalCount = contacts.length + rawRows.length;
  if (totalCount === 0) {
    return NextResponse.json({ error: "No contacts match the selected audience" }, { status: 400 });
  }

  const campaign = await prisma.campaign.create({
    data: {
      name,
      userId,
      deviceId,
      templateId,
      minDelay,
      maxDelay,
      targetAll,
      totalCount,
      status: scheduledAt ? "scheduled" : "draft",
      scheduledAt,
      groups: {
        create: targetAll ? [] : groupIds.map((groupId) => ({ groupId })),
      },
      messages: {
        create: [
          ...contacts.map((c) => ({ contactId: c.id })),
          ...rawRows.map((r) => ({ rawName: r.name, rawPhone: r.phone, rawFields: r.fields })),
        ].map((m, sequence) => ({ ...m, sequence })),
      },
    },
    include: { device: true, template: true },
  });

  return NextResponse.json({ campaign }, { status: 201 });
}
