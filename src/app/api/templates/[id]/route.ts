import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteUploadedFile, saveUploadedFile } from "@/lib/upload";
import { getSession } from "@/lib/auth";

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = await props.params;
  const template = await prisma.template.findUnique({ where: { id: params.id, userId: session.sub } });
  if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  return NextResponse.json({ template });
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = await props.params;
  const existing = await prisma.template.findUnique({ where: { id: params.id, userId: session.sub } });
  if (!existing) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const contentType = req.headers.get("content-type") || "";
  const data: Record<string, unknown> = {};

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    if (form.has("name")) data.name = (form.get("name") as string)?.trim();
    if (form.has("content")) data.content = form.get("content") as string;
    const file = form.get("media") as File | null;
    const removeMedia = form.get("removeMedia") === "true";
    if (file && file.size > 0) {
      if (existing.mediaPath) deleteUploadedFile(existing.mediaPath);
      const saved = await saveUploadedFile(file, "templates");
      data.mediaPath = saved.relativePath;
      data.mediaName = saved.fileName;
      data.mediaMime = saved.mime;
    } else if (removeMedia && existing.mediaPath) {
      deleteUploadedFile(existing.mediaPath);
      data.mediaPath = null;
      data.mediaName = null;
      data.mediaMime = null;
    }
  } else {
    const body = await req.json().catch(() => ({}));
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.content !== undefined) data.content = String(body.content);
  }

  const template = await prisma.template.update({ where: { id: params.id }, data });
  return NextResponse.json({ template });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = await props.params;
  const existing = await prisma.template.findUnique({ where: { id: params.id, userId: session.sub } });
  if (!existing) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  if (existing.mediaPath) deleteUploadedFile(existing.mediaPath);
  await prisma.template.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
