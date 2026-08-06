import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { waManager } from "@/lib/whatsapp/manager";

// GET-only route with no dynamic segments would otherwise be statically
// prerendered at build time, executing a DB query before DATABASE_URL is
// necessarily available (e.g. a fresh clone or Docker build with no .env yet).
export const dynamic = "force-dynamic";

export async function GET() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    totalContacts,
    totalTemplates,
    totalCampaigns,
    devices,
    activeCampaigns,
    sentToday,
    failedToday,
    totalSent,
    totalFailed,
    recentCampaigns,
  ] = await Promise.all([
    prisma.contact.count(),
    prisma.template.count(),
    prisma.campaign.count(),
    prisma.device.findMany(),
    prisma.campaign.count({ where: { status: "running" } }),
    prisma.campaignMessage.count({ where: { status: "sent", sentAt: { gte: startOfDay } } }),
    prisma.campaignMessage.count({ where: { status: "failed", createdAt: { gte: startOfDay } } }),
    prisma.campaignMessage.count({ where: { status: "sent" } }),
    prisma.campaignMessage.count({ where: { status: "failed" } }),
    prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { device: { select: { name: true } }, template: { select: { name: true } } },
    }),
  ]);

  const connectedDevices = devices.filter((d) => waManager.isReady(d.id)).length;
  const totalAttempted = totalSent + totalFailed;
  const successRate = totalAttempted > 0 ? Math.round((totalSent / totalAttempted) * 100) : 0;

  return NextResponse.json({
    totalContacts,
    totalTemplates,
    totalCampaigns,
    totalDevices: devices.length,
    connectedDevices,
    activeCampaigns,
    sentToday,
    failedToday,
    totalSent,
    totalFailed,
    successRate,
    recentCampaigns,
  });
}
