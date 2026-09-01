import { createServer } from "http";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import next from "next";
import { Server as IOServer } from "socket.io";
import { setIO } from "./src/lib/socket";
import { waManager } from "./src/lib/whatsapp/manager";
import { campaignRunner } from "./src/lib/campaign/runner";
import { startScheduler } from "./src/lib/campaign/scheduler";
import { scraperRunner } from "./src/lib/scraper/runner";
import { prisma } from "./src/lib/prisma";
import { bootstrapAdminUser } from "./src/lib/bootstrap-admin";
import { verifySessionToken, SESSION_COOKIE_NAME } from "./src/lib/session-token";

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);
// Bind to all interfaces by default. Docker sets HOSTNAME to the container ID
// for every container, so it can't be used to detect an intentional override —
// use HOST instead if you need to bind to a specific address.
const hostname = process.env.HOST || "0.0.0.0";

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  const io = new IOServer(server, { path: "/socket.io" });
  setIO(io);

  io.use(async (socket, next) => {
    const token = parseCookie(socket.handshake.headers.cookie, SESSION_COOKIE_NAME);
    const session = token ? await verifySessionToken(token) : null;
    if (!session) return next(new Error("Unauthorized"));
    socket.data.userId = session.sub;
    next();
  });

  // Each event is scoped to the owning user's room so device/campaign/scrape
  // state never crosses accounts over the socket (unlike the REST API, the
  // in-memory runners only know resource ids, so ownership is resolved here).
  waManager.on("state", async (deviceId: string, state: unknown) => {
    const device = await prisma.device.findUnique({ where: { id: deviceId }, select: { userId: true } });
    if (device) io.to(device.userId).emit("device:state", { deviceId, ...(state as Record<string, unknown>) });
  });

  campaignRunner.on("progress", async (campaignId: string, payload: Record<string, unknown>) => {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { userId: true } });
    if (campaign) io.to(campaign.userId).emit("campaign:progress", { campaignId, ...payload });
  });

  scraperRunner.on("progress", async (jobId: string, payload: Record<string, unknown>) => {
    const job = await prisma.scrapeJob.findUnique({ where: { id: jobId }, select: { userId: true } });
    if (job) io.to(job.userId).emit("scrape:progress", { jobId, ...payload });
  });

  io.on("connection", (socket) => {
    socket.join(socket.data.userId as string);
    socket.emit("connected", { ok: true });
  });

  await bootstrapAdminUser();

  // A campaign that was mid-run when the process last exited can no longer
  // be actively driven by this (fresh) in-memory runner — surface it as
  // paused so the operator can explicitly resume it.
  await prisma.campaign.updateMany({
    where: { status: "running" },
    data: { status: "paused" },
  });

  // A scrape job that was mid-run when the process last exited can no longer
  // be actively driven by this (fresh) in-memory runner — surface it as
  // stopped so the operator can restart it explicitly.
  await prisma.scrapeJob.updateMany({
    where: { status: { in: ["queued", "running"] } },
    data: { status: "stopped", completedAt: new Date() },
  });

  startScheduler();

  server.listen(port, hostname, () => {
    // eslint-disable-next-line no-console
    console.log(`> WaSender ready on http://${hostname}:${port}`);
  });
});
