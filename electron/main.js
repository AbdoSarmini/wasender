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
const { spawn, spawnSync } = require("child_process");
const { autoUpdater } = require("electron-updater");

const HOST = "127.0.0.1";
const PREFERRED_PORT = process.env.PORT || "3000";
// Set once startServer()'s child reports which port it actually bound (see
// server.ts's tryListen) — this is the ONLY source of truth for the port.
// A prior version pre-checked the port from the Electron side before
// spawning the server, but that left a gap between "port looked free" and
// the server actually binding it: if something else grabbed the port in
// that gap, the real server would fail to bind and crash, while this
// process kept polling the port anyway and happily loaded whatever else
// answered there instead of WaSender.
let PORT = null;

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
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy failed with exit code ${result.status}`);
  }
}

// Resolves with the port server.ts actually bound, parsed off its stdout
// (see the WASENDER_LISTENING_PORT line it prints once listen() succeeds).
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
      PORT: PREFERRED_PORT,
      HOST,
      // Skips account creation/login — see src/lib/local-mode.ts.
      LOCAL_MODE: "1",
      // tsx resolves "@/*" path aliases by looking for tsconfig.json
      // starting from process.cwd() — which is userDataDir here, not
      // appRoot — so it has to be told explicitly where to find it.
      TSX_TSCONFIG_PATH: path.join(appRoot, "tsconfig.json"),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  serverProcess.stderr.on("data", (chunk) => process.stderr.write(chunk));

  serverProcess.on("exit", (code) => {
    serverProcess = null;
    if (code !== 0 && mainWindow) {
      mainWindow.webContents.executeJavaScript(
        `document.body.innerText = "WaSender server exited unexpectedly (code ${code}). Restart the app."`
      );
    }
  });

  return new Promise((resolve, reject) => {
    let buffered = "";
    function onData(chunk) {
      process.stdout.write(chunk);
      buffered += chunk.toString();
      const match = buffered.match(/WASENDER_LISTENING_PORT=(\d+)/);
      if (match) {
        serverProcess.stdout.off("data", onData);
        resolve(parseInt(match[1], 10));
      }
    }
    serverProcess.stdout.on("data", onData);
    serverProcess.once("exit", (code) => {
      if (code !== 0) reject(new Error(`WaSender server exited before it started listening (code ${code})`));
    });
  });
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

app.whenReady().then(async () => {
  try {
    ensureNodeBinary();
    runMigrations();
  } catch (err) {
    console.error(err);
    app.quit();
    return;
  }

  try {
    PORT = await startServer();
  } catch (err) {
    console.error(err);
    dialog.showErrorBox("WaSender", "The WaSender server failed to start. Check the logs and restart the app.");
    app.quit();
    return;
  }
  createWindow();

  if (app.isPackaged) {
    // Don't let electron-updater silently run the installer in the background
    // on quit (its default) — that produced a long, unexplained hang with no
    // UI when the app closed. Instead prompt the user, and if they agree, run
    // the installer visibly (isSilent: false) so its own progress UI shows.
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on("update-downloaded", (info) => {
      dialog
        .showMessageBox(mainWindow, {
          type: "info",
          buttons: ["Restart Now", "Later"],
          defaultId: 0,
          title: "Update Ready",
          message: `WaSender ${info.version} has been downloaded.`,
          detail: "Restart now to install the update, or install it later by restarting the app yourself.",
        })
        .then(({ response }) => {
          if (response === 0) autoUpdater.quitAndInstall(false, true);
        });
    });

    autoUpdater.checkForUpdates().catch((err) => console.error("auto-update check failed:", err));
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
