import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const group = await prisma.group.findUnique({ where: { id: params.id } });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  await prisma.contact.updateMany({ where: { groupId: params.id }, data: { groupId: null } });
  await prisma.group.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
