import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { saveUploadedFile } from "@/lib/upload";

export async function GET() {
  const templates = await prisma.template.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  let name = "";
  let content = "";
  let mediaPath: string | null = null;
  let mediaName: string | null = null;
  let mediaMime: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    name = (form.get("name") as string)?.trim() || "";
    content = (form.get("content") as string) || "";
    const file = form.get("media") as File | null;
    if (file && file.size > 0) {
      const saved = await saveUploadedFile(file, "templates");
      mediaPath = saved.relativePath;
      mediaName = saved.fileName;
      mediaMime = saved.mime;
    }
  } else {
    const body = await req.json().catch(() => ({}));
    name = (body?.name as string)?.trim() || "";
    content = (body?.content as string) || "";
  }

  if (!name || !content) {
    return NextResponse.json({ error: "Name and content are required" }, { status: 400 });
  }

  const template = await prisma.template.create({
    data: { name, content, mediaPath, mediaName, mediaMime },
  });

  return NextResponse.json({ template }, { status: 201 });
}
