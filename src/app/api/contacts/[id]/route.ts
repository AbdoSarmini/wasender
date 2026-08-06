import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const existing = await prisma.contact.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.phone !== undefined) data.phone = String(body.phone).replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (body.groupId !== undefined) data.groupId = body.groupId || null;
  if (body.fields !== undefined) data.fields = body.fields ? JSON.stringify(body.fields) : null;

  const contact = await prisma.contact.update({ where: { id: params.id }, data });
  return NextResponse.json({ contact });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const existing = await prisma.contact.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  await prisma.contact.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
