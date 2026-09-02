import { EventEmitter } from "events";
import path from "path";
import { prisma } from "@/lib/prisma";
import { waManager } from "@/lib/whatsapp/manager";

type ControlFlag = "running" | "paused" | "stopped";

function randomDelayMs(minSec: number, maxSec: number) {
  const lo = Math.min(minSec, maxSec);
  const hi = Math.max(minSec, maxSec);
  const seconds = lo + Math.random() * (hi - lo);
  return Math.round(seconds * 1000);
}

const RANDOM_CHARS = "0123456789";

function randomString(length: number) {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += RANDOM_CHARS[Math.floor(Math.random() * RANDOM_CHARS.length)];
  }
  return out;
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
    if (key === "random") return randomString(8);
    return Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match;
  });
}

class CampaignRunner extends EventEmitter {
  private control = new Map<string, ControlFlag>();
  private active = new Set<string>();
  private wakers = new Map<string, () => void>();

  private emitProgress(campaignId: string, payload: Record<string, unknown>) {
    this.emit("progress", campaignId, payload);
  }

  private interruptibleSleep(campaignId: string, ms: number) {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.wakers.delete(campaignId);
        resolve();
      }, ms);
      this.wakers.set(campaignId, () => {
        clearTimeout(timer);
        this.wakers.delete(campaignId);
        resolve();
      });
    });
  }

  private wake(campaignId: string) {
    const waker = this.wakers.get(campaignId);
    if (waker) waker();
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
    if (!campaign.deviceId) {
      throw new Error("This campaign's device was deleted — assign a device before starting it");
    }
    if (!campaign.templateId) {
      throw new Error("This campaign's template was deleted — assign a template before starting it");
    }
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
      this.wake(campaignId);
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
    this.wake(campaignId);
  }

  private async runLoop(campaignId: string) {
    const campaign = await prisma.campaign.findUniqueOrThrow({
      where: { id: campaignId },
      include: { device: true, template: true },
    });
    if (!campaign.deviceId) {
      await prisma.campaign.update({ where: { id: campaignId }, data: { status: "failed" } });
      this.emitProgress(campaignId, { status: "failed", error: "This campaign's device was deleted" });
      return;
    }
    if (!campaign.template) {
      await prisma.campaign.update({ where: { id: campaignId }, data: { status: "failed" } });
      this.emitProgress(campaignId, { status: "failed", error: "This campaign's template was deleted" });
      return;
    }
    const deviceId = campaign.deviceId;
    const template = campaign.template;

    while (true) {
      const flag = this.control.get(campaignId);
      if (flag === "stopped") break;
      if (flag === "paused") {
        await this.interruptibleSleep(campaignId, 1000);
        continue;
      }

      const nextMessage = await prisma.campaignMessage.findFirst({
        where: { campaignId, status: "queued" },
        include: { contact: true },
        orderBy: [{ sequence: "asc" }, { createdAt: "asc" }],
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

      const recipient = nextMessage.contact ?? {
        name: nextMessage.rawName || nextMessage.rawPhone || "",
        phone: nextMessage.rawPhone ?? "",
        fields: nextMessage.rawFields,
      };

      await prisma.campaignMessage.update({
        where: { id: nextMessage.id },
        data: { status: "sending" },
      });

      try {
        const text = renderTemplate(template.content, recipient);
        const chatId = waManager.toChatId(recipient.phone);

        if (template.mediaPath) {
          const filePath = path.isAbsolute(template.mediaPath)
            ? template.mediaPath
            : path.join(/* turbopackIgnore: true */ process.cwd(), template.mediaPath);
          await waManager.sendMedia(deviceId, chatId, text, filePath, template.mediaName ?? undefined);
        } else {
          await waManager.sendText(deviceId, chatId, text);
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
          lastContact: recipient.name,
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
          lastContact: recipient.name,
          lastStatus: "failed",
          lastError: (err as Error).message,
        });
      }

      const remaining = await prisma.campaignMessage.count({
        where: { campaignId, status: "queued" },
      });
      if (remaining === 0) continue;

      await this.interruptibleSleep(campaignId, randomDelayMs(campaign.minDelay, campaign.maxDelay));
    }

    const flagAtExit = this.control.get(campaignId);
    if (flagAtExit === "stopped") {
      await prisma.campaignMessage.updateMany({
        where: { campaignId, status: "queued" },
        data: { status: "skipped" },
      });
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "completed", completedAt: new Date() },
      });
      this.emitProgress(campaignId, { status: "completed" });
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
