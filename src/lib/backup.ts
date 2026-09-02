import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { prisma } from "@/lib/prisma";

const AUTH_DIR = path.join(process.cwd(), ".wwebjs_auth");
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const MANIFEST_ENTRY = "wasender-backup.json";
const DB_ENTRY = "database.db";
const AUTH_PREFIX = "wwebjs_auth/";
const UPLOADS_PREFIX = "uploads/";

// Written by stageRestore() and consumed by applyPendingRestoreIfAny() on
// the next process's startup — see the comment on applyPendingRestoreIfAny
// for why the actual file replacement happens there instead of immediately.
const PENDING_RESTORE_PATH = path.join(process.cwd(), ".pending-restore.zip");

interface BackupManifest {
  app: "wasender";
  manifestVersion: 1;
  createdAt: string;
}

function getDbPath(): string {
  const url = process.env.DATABASE_URL || "file:./prisma/dev.db";
  const raw = url.replace(/^file:/, "");
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

function readManifest(zip: AdmZip): BackupManifest {
  const manifestEntry = zip.getEntries().find((e) => e.entryName === MANIFEST_ENTRY);
  if (!manifestEntry) {
    throw new Error("This file doesn't look like a WaSender backup.");
  }
  const manifest = JSON.parse(zip.readAsText(manifestEntry)) as Partial<BackupManifest>;
  if (manifest.app !== "wasender") {
    throw new Error("This file doesn't look like a WaSender backup.");
  }
  return manifest as BackupManifest;
}

// Chrome keeps its own HTTP disk cache and singleton lock files open inside
// the LocalAuth session profile while a WhatsApp client is connected — none
// of that is needed to restore the login itself (the cache regenerates on
// its own, and restoring a stale lock file could make a fresh Chrome think
// another instance already owns the profile). Skipping them here means
// backups can run without stopping active clients first, and any other file
// that happens to be locked at the moment is just skipped rather than
// failing the whole backup.
const SKIP_DIR_NAMES = new Set([
  "Cache",
  "Code Cache",
  "GPUCache",
  "DawnCache",
  "DawnWebGPUCache",
  "GrShaderCache",
  "ShaderCache",
]);
const SKIP_FILE_NAMES = new Set(["SingletonLock", "SingletonCookie", "SingletonSocket", "lockfile"]);

function addDirToZip(zip: AdmZip, dir: string, zipPrefix: string) {
  if (!fs.existsSync(dir)) return;
  const prefix = zipPrefix.replace(/\/$/, "");

  function walk(currentDir: string, relativePath: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (err) {
      console.error(`[backup] skipping unreadable directory ${currentDir}`, err);
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name)) continue;
        walk(path.join(currentDir, entry.name), `${relativePath}${entry.name}/`);
      } else {
        if (SKIP_FILE_NAMES.has(entry.name)) continue;
        const fullPath = path.join(currentDir, entry.name);
        try {
          zip.addFile(`${prefix}/${relativePath}${entry.name}`, fs.readFileSync(fullPath));
        } catch (err) {
          console.error(`[backup] skipping locked/unreadable file ${fullPath}`, err);
        }
      }
    }
  }

  walk(dir, "");
}

export async function createBackup(): Promise<Buffer> {
  const dbPath = getDbPath();

  // Merges the WAL file into the main db file so the copy below is a
  // consistent, self-contained snapshot instead of missing recent writes
  // that are still sitting in a separate -wal sidecar file.
  await prisma.$queryRawUnsafe("PRAGMA wal_checkpoint(FULL);").catch(() => {});

  const zip = new AdmZip();

  const manifest: BackupManifest = {
    app: "wasender",
    manifestVersion: 1,
    createdAt: new Date().toISOString(),
  };
  zip.addFile(MANIFEST_ENTRY, Buffer.from(JSON.stringify(manifest, null, 2)));

  if (fs.existsSync(dbPath)) {
    zip.addLocalFile(dbPath, "", DB_ENTRY);
  }
  addDirToZip(zip, AUTH_DIR, AUTH_PREFIX);
  addDirToZip(zip, UPLOADS_DIR, UPLOADS_PREFIX);

  return zip.toBuffer();
}

// Validates the backup and stages it on disk — it does NOT touch dev.db,
// .wwebjs_auth, or uploads/ itself. Those are all open in this very process
// (Prisma's sqlite handle, Chrome's profile for any connected device), and
// even after disconnecting/destroying them Windows can re-lock a file the
// instant anything else in this process — a background campaign/scrape
// runner, the scheduler's tick, another in-flight request — makes another
// query and Prisma transparently reconnects. There's no way to guarantee
// nothing else touches the db for the whole duration of a file replacement
// from inside the very process using it.
//
// Instead this just saves the upload, and applyPendingRestoreIfAny() (called
// from server.ts before Prisma or whatsapp-web.js ever open anything) does
// the actual replacement the next time the server starts — a fresh process
// where those files have never been opened, so there's nothing to unlock.
export async function stageRestore(buffer: Buffer): Promise<void> {
  const zip = new AdmZip(buffer);
  readManifest(zip); // throws if this isn't a real WaSender backup
  fs.writeFileSync(PENDING_RESTORE_PATH, buffer);
}

// Returns true if a restore was actually applied — the caller (server.ts)
// needs to know, since the restored database file may predate migrations
// applied since that backup was taken and has to be re-migrated before
// anything queries it.
export async function applyPendingRestoreIfAny(): Promise<boolean> {
  if (!fs.existsSync(PENDING_RESTORE_PATH)) return false;

  console.log("[backup] applying pending restore...");
  const buffer = fs.readFileSync(PENDING_RESTORE_PATH);
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  readManifest(zip);

  const dbPath = getDbPath();
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const file = dbPath + suffix;
    if (fs.existsSync(file)) fs.rmSync(file);
  }
  const dbEntry = entries.find((e) => e.entryName === DB_ENTRY);
  if (dbEntry) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, dbEntry.getData());
  }

  for (const [dir, prefix] of [
    [AUTH_DIR, AUTH_PREFIX],
    [UPLOADS_DIR, UPLOADS_PREFIX],
  ] as const) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    for (const entry of entries) {
      if (entry.isDirectory || !entry.entryName.startsWith(prefix)) continue;
      const relativePath = entry.entryName.slice(prefix.length);
      const destPath = path.join(dir, relativePath);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, entry.getData());
    }
  }

  fs.rmSync(PENDING_RESTORE_PATH);
  console.log("[backup] restore applied.");
  return true;
}
