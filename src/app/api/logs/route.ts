import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const campaignId = searchParams.get("campaignId");
  const search = searchParams.get("search")?.trim();
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);

  const where: Record<string, unknown> = { campaign: { userId: session.sub } };
  if (status && status !== "all") where.status = status;
  if (campaignId) where.campaignId = campaignId;
  if (search) {
    where.OR = [
      { contact: { OR: [{ name: { contains: search } }, { phone: { contains: search } }] } },
      { rawName: { contains: search } },
      { rawPhone: { contains: search } },
    ];
  }

  const [logs, total] = await Promise.all([
    prisma.campaignMessage.findMany({
      where,
      include: {
        contact: true,
        campaign: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.campaignMessage.count({ where }),
  ]);

  return NextResponse.json({ logs, total, page, pageSize });
}
