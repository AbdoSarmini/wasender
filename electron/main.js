// Electron shell around the existing Next.js/Socket.io server (server.ts).
// The server itself is unchanged — it still reads config from process.cwd()
// (uploads/, .wwebjs_auth/, .wwebjs_cache/, prisma/dev.db), so this file just
// points that cwd at the OS user-data directory and runs the real server as
// a child process via tsx, the same way `npm start` does.
//
// The child processes run under a bundled, standalone node.exe (electron/
// vendor/node/, fetched by scripts/fetch-node.js) rather than Electron's own
// Node runtime: Electron's bundled Node has a different ABI, which breaks
// native modules (better-sqlite3, compiled against the system Node used for
// `npm install`) and even the Prisma CLI's own require(esm) usage.

const { app, BrowserWindow, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { spawn, spawnSync } = require("child_process");
const { autoUpdater } = require("electron-updater");

const PORT = process.env.PORT || "3000";
const HOST = "127.0.0.1";

// In dev, `electron .` is launched from the project root. Packaged builds
// use asar:false (whatsapp-web.js/puppeteer/prisma ship native binaries that
// don't play well zipped inside an asar archive), so the project lives at
// resources/app right next to this file's own resources/app/electron dir.
const appRoot = app.isPackaged ? path.join(process.resourcesPath, "app") : path.join(__dirname, "..");
const nodeBinary = path.join(appRoot, "electron", "vendor", "node", "node.exe");

const userDataDir = app.getPath("userData");
const dbPath = path.join(userDataDir, "prisma", "dev.db").replace(/\\/g, "/");
const databaseUrl = `file:${dbPath}`;

let serverProcess = null;
let mainWindow = null;

function ensureNodeBinary() {
  if (fs.existsSync(nodeBinary)) return;
  dialog.showErrorBox(
    "WaSender",
    `Bundled Node runtime is missing (expected at ${nodeBinary}).\n` +
      `Run "npm run fetch-node" and rebuild the app.`
  );
  app.quit();
  throw new Error("bundled node.exe missing");
}

function runMigrations() {
  fs.mkdirSync(path.join(userDataDir, "prisma"), { recursive: true });
  const prismaCli = require.resolve("prisma/build/index.js", { paths: [appRoot] });
  const result = spawnSync(nodeBinary, [prismaCli, "migrate", "deploy"], {
    cwd: appRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy failed with exit code ${result.status}`);
  }
}

function startServer() {
  const tsxPkg = require.resolve("tsx/package.json", { paths: [appRoot] });
  const tsxCli = path.join(path.dirname(tsxPkg), "dist", "cli.mjs");

  serverProcess = spawn(nodeBinary, [tsxCli, path.join(appRoot, "server.ts")], {
    cwd: userDataDir,
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: databaseUrl,
      APP_ROOT: appRoot,
      PORT,
      HOST,
      // Skips account creation/login — see src/lib/local-mode.ts.
      LOCAL_MODE: "1",
      // tsx resolves "@/*" path aliases by looking for tsconfig.json
      // starting from process.cwd() — which is userDataDir here, not
      // appRoot — so it has to be told explicitly where to find it.
      TSX_TSCONFIG_PATH: path.join(appRoot, "tsconfig.json"),
    },
    stdio: "inherit",
  });

  serverProcess.on("exit", (code) => {
    serverProcess = null;
    if (code !== 0 && mainWindow) {
      mainWindow.webContents.executeJavaScript(
        `document.body.innerText = "WaSender server exited unexpectedly (code ${code}). Restart the app."`
      );
    }
  });
}

function waitForServer(retriesLeft, onReady) {
  const req = http.get({ host: HOST, port: PORT, path: "/", timeout: 1000 }, () => {
    req.destroy();
    onReady();
  });
  req.on("error", () => {
    req.destroy();
    if (retriesLeft <= 0) throw new Error("WaSender server did not start in time");
    setTimeout(() => waitForServer(retriesLeft - 1, onReady), 500);
  });
  req.on("timeout", () => req.destroy());
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://${HOST}:${PORT}`);

  // Open external links (e.g. anything opened via target=_blank) in the OS
  // browser instead of spawning a second app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  try {
    ensureNodeBinary();
    runMigrations();
  } catch (err) {
    console.error(err);
    app.quit();
    return;
  }

  startServer();
  waitForServer(40, createWindow);

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => console.error("auto-update check failed:", err));
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) serverProcess.kill();
});
