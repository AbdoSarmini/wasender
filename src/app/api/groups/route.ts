import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const groups = await prisma.group.findMany({
    where: { userId: session.sub },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { contacts: true } } },
  });
  return NextResponse.json({ groups });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const name = (body?.name as string)?.trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const existing = await prisma.group.findUnique({ where: { userId_name: { userId: session.sub, name } } });
  if (existing) return NextResponse.json({ group: existing }, { status: 200 });

  const group = await prisma.group.create({ data: { name, userId: session.sub } });
  return NextResponse.json({ group }, { status: 201 });
}
