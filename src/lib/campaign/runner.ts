import { EventEmitter } from "events";
import path from "path";
import { prisma } from "@/lib/prisma";
import { waManager } from "@/lib/whatsapp/manager";

type ControlFlag = "running" | "paused" | "stopped";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelayMs(minSec: number, maxSec: number) {
  const lo = Math.min(minSec, maxSec);
  const hi = Math.max(minSec, maxSec);
  const seconds = lo + Math.random() * (hi - lo);
  return Math.round(seconds * 1000);
}

export function renderTemplate(content: string, contact: { name: string; phone: string; fields?: string | null }) {
  let extra: Record<string, string> = {};
  if (contact.fields) {
    try {
      extra = JSON.parse(contact.fields);
    } catch {
      extra = {};
    }
  }
  const vars: Record<string, string> = { name: contact.name, phone: contact.phone, ...extra };
  return content.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match;
  });
}

class CampaignRunner extends EventEmitter {
  private control = new Map<string, ControlFlag>();
  private active = new Set<string>();

  private emitProgress(campaignId: string, payload: Record<string, unknown>) {
    this.emit("progress", campaignId, payload);
  }

  isActive(campaignId: string) {
    return this.active.has(campaignId);
  }

  async start(campaignId: string) {
    if (this.active.has(campaignId)) return;

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { device: true, template: true },
    });
    if (!campaign) throw new Error("Campaign not found");
    if (!waManager.isReady(campaign.deviceId)) {
      throw new Error("Selected device is not connected");
    }

    this.control.set(campaignId, "running");
    this.active.add(campaignId);

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "running", startedAt: campaign.startedAt ?? new Date() },
    });
    this.emitProgress(campaignId, { status: "running" });

    this.runLoop(campaignId).catch(async (err) => {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "failed" },
      }).catch(() => {});
      this.emitProgress(campaignId, { status: "failed", error: (err as Error).message });
    }).finally(() => {
      this.active.delete(campaignId);
      this.control.delete(campaignId);
    });
  }

  pause(campaignId: string) {
    if (this.control.get(campaignId) === "running") {
      this.control.set(campaignId, "paused");
    }
  }

  async resume(campaignId: string) {
    if (this.control.get(campaignId) === "paused") {
      this.control.set(campaignId, "running");
      await prisma.campaign.update({ where: { id: campaignId }, data: { status: "running" } });
      this.emitProgress(campaignId, { status: "running" });
      return;
    }
    // Not actively tracked (e.g. after a server restart) — restart the loop.
    return this.start(campaignId);
  }

  stop(campaignId: string) {
    this.control.set(campaignId, "stopped");
  }

  private async runLoop(campaignId: string) {
    const campaign = await prisma.campaign.findUniqueOrThrow({
      where: { id: campaignId },
      include: { device: true, template: true },
    });

    while (true) {
      const flag = this.control.get(campaignId);
      if (flag === "stopped") break;
      if (flag === "paused") {
        await sleep(1000);
        continue;
      }

      const nextMessage = await prisma.campaignMessage.findFirst({
        where: { campaignId, status: "queued" },
        include: { contact: true },
        orderBy: { createdAt: "asc" },
      });

      if (!nextMessage) {
        const updated = await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: "completed", completedAt: new Date() },
        });
        this.emitProgress(campaignId, {
          status: "completed",
          sentCount: updated.sentCount,
          failedCount: updated.failedCount,
        });
        break;
      }

      await prisma.campaignMessage.update({
        where: { id: nextMessage.id },
        data: { status: "sending" },
      });

      try {
        const text = renderTemplate(campaign.template.content, nextMessage.contact);
        const chatId = waManager.toChatId(nextMessage.contact.phone);

        if (campaign.template.mediaPath) {
          const filePath = path.isAbsolute(campaign.template.mediaPath)
            ? campaign.template.mediaPath
            : path.join(process.cwd(), campaign.template.mediaPath);
          await waManager.sendMedia(
            campaign.deviceId,
            chatId,
            text,
            filePath,
            campaign.template.mediaName ?? undefined
          );
        } else {
          await waManager.sendText(campaign.deviceId, chatId, text);
        }

        await prisma.campaignMessage.update({
          where: { id: nextMessage.id },
          data: { status: "sent", sentAt: new Date() },
        });
        const updated = await prisma.campaign.update({
          where: { id: campaignId },
          data: { sentCount: { increment: 1 } },
        });
        this.emitProgress(campaignId, {
          status: "running",
          sentCount: updated.sentCount,
          failedCount: updated.failedCount,
          lastContact: nextMessage.contact.name,
          lastStatus: "sent",
        });
      } catch (err) {
        await prisma.campaignMessage.update({
          where: { id: nextMessage.id },
          data: { status: "failed", error: (err as Error).message?.slice(0, 500) },
        });
        const updated = await prisma.campaign.update({
          where: { id: campaignId },
          data: { failedCount: { increment: 1 } },
        });
        this.emitProgress(campaignId, {
          status: "running",
          sentCount: updated.sentCount,
          failedCount: updated.failedCount,
          lastContact: nextMessage.contact.name,
          lastStatus: "failed",
          lastError: (err as Error).message,
        });
      }

      const remaining = await prisma.campaignMessage.count({
        where: { campaignId, status: "queued" },
      });
      if (remaining === 0) continue;

      await sleep(randomDelayMs(campaign.minDelay, campaign.maxDelay));
    }

    const flagAtExit = this.control.get(campaignId);
    if (flagAtExit === "stopped") {
      await prisma.campaignMessage.updateMany({
        where: { campaignId, status: "queued" },
        data: { status: "skipped" },
      });
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "stopped", completedAt: new Date() },
      });
      this.emitProgress(campaignId, { status: "stopped" });
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __campaignRunner: CampaignRunner | undefined;
}

export const campaignRunner: CampaignRunner = globalThis.__campaignRunner ?? new CampaignRunner();
if (!globalThis.__campaignRunner) {
  globalThis.__campaignRunner = campaignRunner;
  campaignRunner.setMaxListeners(50);
}
