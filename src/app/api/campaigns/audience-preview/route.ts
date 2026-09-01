import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.sub;
  const body = await req.json().catch(() => ({}));
  const targetAll = Boolean(body?.targetAll);
  const groupIds: string[] = Array.isArray(body?.groupIds) ? body.groupIds : [];
  const contactIds: string[] = Array.isArray(body?.contactIds) ? body.contactIds : [];
  const csvPhones: string[] = Array.isArray(body?.csvPhones)
    ? body.csvPhones.filter((p: unknown): p is string => typeof p === "string")
    : [];

  if (!targetAll && groupIds.length === 0 && contactIds.length === 0 && csvPhones.length === 0) {
    return NextResponse.json({ count: 0 });
  }

  let existingPhones = new Set<string>();
  const count = await prisma.contact.count({
    where: targetAll
      ? { userId }
      : {
          userId,
          OR: [
            ...(groupIds.length ? [{ groupId: { in: groupIds } }] : []),
            ...(contactIds.length ? [{ id: { in: contactIds } }] : []),
          ],
        },
  });

  if (!targetAll && csvPhones.length > 0) {
    const contacts = await prisma.contact.findMany({
      where: {
        userId,
        OR: [
          ...(groupIds.length ? [{ groupId: { in: groupIds } }] : []),
          ...(contactIds.length ? [{ id: { in: contactIds } }] : []),
        ],
      },
      select: { phone: true },
    });
    existingPhones = new Set(contacts.map((c) => c.phone));
  }

  const newCsvCount = targetAll
    ? 0
    : csvPhones.filter((p) => !existingPhones.has(p)).length;

  return NextResponse.json({ count: count + newCsvCount });
}
