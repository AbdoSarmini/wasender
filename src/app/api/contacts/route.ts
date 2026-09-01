import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

function normalizePhone(raw: string) {
  return raw.replace(/[^\d+]/g, "").replace(/^\+/, "");
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get("groupId");
  const search = searchParams.get("search")?.trim();
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);

  const where: Record<string, unknown> = { userId: session.sub };
  if (groupId === "none") where.groupId = null;
  else if (groupId) where.groupId = groupId;
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { phone: { contains: search } },
    ];
  }

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: { group: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.contact.count({ where }),
  ]);

  return NextResponse.json({ contacts, total, page, pageSize });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const name = (body?.name as string)?.trim();
  const phoneRaw = (body?.phone as string)?.trim();
  const groupId = (body?.groupId as string) || null;
  const fields = body?.fields && typeof body.fields === "object" ? JSON.stringify(body.fields) : null;

  if (!name || !phoneRaw) {
    return NextResponse.json({ error: "Name and phone are required" }, { status: 400 });
  }

  const phone = normalizePhone(phoneRaw);
  if (phone.length < 6) {
    return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
  }

  if (groupId) {
    const group = await prisma.group.findUnique({ where: { id: groupId, userId: session.sub } });
    if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const existing = await prisma.contact.findUnique({ where: { userId_phone: { userId: session.sub, phone } } });
  if (existing) {
    return NextResponse.json({ error: "A contact with this phone number already exists" }, { status: 409 });
  }

  const contact = await prisma.contact.create({
    data: { name, phone, groupId, fields, userId: session.sub },
  });

  return NextResponse.json({ contact }, { status: 201 });
}
