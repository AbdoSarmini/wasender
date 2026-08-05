import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const groups = await prisma.group.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { contacts: true } } },
  });
  return NextResponse.json({ groups });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = (body?.name as string)?.trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const existing = await prisma.group.findUnique({ where: { name } });
  if (existing) return NextResponse.json({ group: existing }, { status: 200 });

  const group = await prisma.group.create({ data: { name } });
  return NextResponse.json({ group }, { status: 201 });
}
