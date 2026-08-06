import { prisma } from "@/lib/prisma";
import { campaignRunner } from "./runner";

let timer: ReturnType<typeof setInterval> | null = null;

async function tick() {
  const due = await prisma.campaign.findMany({
    where: { status: "scheduled", scheduledAt: { lte: new Date() } },
    select: { id: true },
  });
  for (const { id } of due) {
    // Device may not be connected yet — leave the campaign scheduled and retry on the next tick.
    await campaignRunner.start(id).catch(() => {});
  }
}

export function startScheduler(intervalMs = 30000) {
  if (timer) return;
  tick().catch(() => {});
  timer = setInterval(() => {
    tick().catch(() => {});
  }, intervalMs);
}
