import { createServer } from "http";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import next from "next";
import { Server as IOServer } from "socket.io";
import { setIO } from "./src/lib/socket";
import { waManager } from "./src/lib/whatsapp/manager";
import { campaignRunner } from "./src/lib/campaign/runner";
import { startScheduler } from "./src/lib/campaign/scheduler";
import { prisma } from "./src/lib/prisma";
import { bootstrapAdminUser } from "./src/lib/bootstrap-admin";

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

  waManager.on("state", (deviceId: string, state: unknown) => {
    io.emit("device:state", { deviceId, ...(state as Record<string, unknown>) });
  });

  campaignRunner.on("progress", (campaignId: string, payload: Record<string, unknown>) => {
    io.emit("campaign:progress", { campaignId, ...payload });
  });

  io.on("connection", (socket) => {
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

  startScheduler();

  server.listen(port, hostname, () => {
    // eslint-disable-next-line no-console
    console.log(`> WaSender ready on http://${hostname}:${port}`);
  });
});
