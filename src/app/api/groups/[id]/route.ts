import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = await props.params;
  const group = await prisma.group.findUnique({ where: { id: params.id, userId: session.sub } });
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  await prisma.contact.updateMany({ where: { groupId: params.id }, data: { groupId: null } });
  await prisma.group.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
