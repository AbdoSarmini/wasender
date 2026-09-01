import { EventEmitter } from "events";
import path from "path";
import fs from "fs";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";

// whatsapp-web.js is CommonJS and pulls in puppeteer; require() keeps it out of
// the Next.js client/edge bundling graph (it's only ever used from the custom
// Node server / API route handlers running on the Node runtime).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");

export type DeviceStatus =
  | "disconnected"
  | "initializing"
  | "qr"
  | "authenticated"
  | "connected";

export interface DeviceRuntimeState {
  status: DeviceStatus;
  qr?: string;
  phone?: string;
}

const AUTH_DIR = path.join(process.cwd(), ".wwebjs_auth");
const CACHE_DIR = path.join(process.cwd(), ".wwebjs_cache");

class WhatsAppManager extends EventEmitter {
  private clients = new Map<string, any>();
  private state = new Map<string, DeviceRuntimeState>();

  getState(deviceId: string): DeviceRuntimeState {
    return this.state.get(deviceId) ?? { status: "disconnected" };
  }

  private setState(deviceId: string, partial: Partial<DeviceRuntimeState>) {
    const current = this.getState(deviceId);
    const next = { ...current, ...partial };
    this.state.set(deviceId, next);
    this.emit("state", deviceId, next);
  }

  async start(deviceId: string, clientId: string) {
    if (this.clients.has(deviceId)) {
      return;
    }

    this.setState(deviceId, { status: "initializing", qr: undefined });
    await prisma.device.update({ where: { id: deviceId }, data: { status: "initializing" } });

    const client = new Client({
      authStrategy: new LocalAuth({ clientId, dataPath: AUTH_DIR }),
      puppeteer: {
        headless: true,
        executablePath: process.env.CHROME_PATH || undefined,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
        ],
      },
      cacheDir: CACHE_DIR,
    });

    client.on("qr", async (qr: string) => {
      console.log(`[wa:${deviceId}] qr`);
      const dataUrl = await QRCode.toDataURL(qr);
      this.setState(deviceId, { status: "qr", qr: dataUrl });
      await prisma.device.update({ where: { id: deviceId }, data: { status: "qr" } }).catch(() => {});
    });

    client.on("authenticated", async () => {
      console.log(`[wa:${deviceId}] authenticated`);
      this.setState(deviceId, { status: "authenticated", qr: undefined });
      await prisma.device
        .update({ where: { id: deviceId }, data: { status: "authenticated" } })
        .catch(() => {});
    });

    client.on("ready", async () => {
      console.log(`[wa:${deviceId}] ready`);
      const phone = client.info?.wid?.user;
      this.setState(deviceId, { status: "connected", qr: undefined, phone });
      await prisma.device
        .update({ where: { id: deviceId }, data: { status: "connected", phone } })
        .catch(() => {});
    });

    client.on("auth_failure", async (msg: string) => {
      console.error(`[wa:${deviceId}] auth_failure`, msg);
      this.setState(deviceId, { status: "disconnected", qr: undefined });
      await prisma.device
        .update({ where: { id: deviceId }, data: { status: "disconnected" } })
        .catch(() => {});
    });

    client.on("disconnected", async (reason: string) => {
      console.error(`[wa:${deviceId}] disconnected`, reason);
      this.setState(deviceId, { status: "disconnected", qr: undefined });
      await prisma.device
        .update({ where: { id: deviceId }, data: { status: "disconnected" } })
        .catch(() => {});
      this.clients.delete(deviceId);
      try {
        await client.destroy();
      } catch {
        // ignore
      }
    });

    this.clients.set(deviceId, client);

    try {
      await client.initialize();
    } catch (err) {
      this.setState(deviceId, { status: "disconnected", qr: undefined });
      await prisma.device
        .update({ where: { id: deviceId }, data: { status: "disconnected" } })
        .catch(() => {});
      this.clients.delete(deviceId);
      throw err;
    }
  }

  async logout(deviceId: string, clientId: string) {
    const client = this.clients.get(deviceId);
    if (client) {
      try {
        await client.logout();
      } catch {
        // ignore
      }
      try {
        await client.destroy();
      } catch {
        // ignore
      }
      this.clients.delete(deviceId);
    }

    const sessionDir = path.join(AUTH_DIR, `session-${clientId}`);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }

    this.setState(deviceId, { status: "disconnected", qr: undefined, phone: undefined });
    await prisma.device
      .update({ where: { id: deviceId }, data: { status: "disconnected", phone: null } })
      .catch(() => {});
  }

  isReady(deviceId: string) {
    return this.getState(deviceId).status === "connected" && this.clients.has(deviceId);
  }

  getClient(deviceId: string) {
    return this.clients.get(deviceId);
  }

  async sendText(deviceId: string, chatId: string, text: string) {
    const client = this.clients.get(deviceId);
    if (!client) throw new Error("Device is not connected");
    return client.sendMessage(chatId, text);
  }

  async sendMedia(
    deviceId: string,
    chatId: string,
    caption: string,
    filePath: string,
    fileName?: string
  ) {
    const client = this.clients.get(deviceId);
    if (!client) throw new Error("Device is not connected");
    const media = MessageMedia.fromFilePath(filePath);
    if (fileName) media.filename = fileName;
    return client.sendMessage(chatId, media, { caption });
  }

  toChatId(phone: string) {
    const digits = phone.replace(/[^\d]/g, "");
    return `${digits}@c.us`;
  }

  async isRegisteredUser(deviceId: string, phone: string): Promise<boolean> {
    const client = this.clients.get(deviceId);
    if (!client) throw new Error("Device is not connected");
    try {
      return await client.isRegisteredUser(this.toChatId(phone));
    } catch {
      return true; // fail open — let the send attempt surface the real error
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __waManager: WhatsAppManager | undefined;
}

export const waManager: WhatsAppManager = globalThis.__waManager ?? new WhatsAppManager();
if (!globalThis.__waManager) {
  globalThis.__waManager = waManager;
  waManager.setMaxListeners(50);
}
