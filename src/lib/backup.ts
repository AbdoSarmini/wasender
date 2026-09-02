import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { prisma } from "@/lib/prisma";
import { waManager } from "@/lib/whatsapp/manager";

const AUTH_DIR = path.join(process.cwd(), ".wwebjs_auth");
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const MANIFEST_ENTRY = "wasender-backup.json";
const DB_ENTRY = "database.db";
const AUTH_PREFIX = "wwebjs_auth/";
const UPLOADS_PREFIX = "uploads/";

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

export async function restoreBackup(buffer: Buffer): Promise<void> {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  const manifestEntry = entries.find((e) => e.entryName === MANIFEST_ENTRY);
  if (!manifestEntry) {
    throw new Error("This file doesn't look like a WaSender backup.");
  }
  const manifest = JSON.parse(zip.readAsText(manifestEntry)) as Partial<BackupManifest>;
  if (manifest.app !== "wasender") {
    throw new Error("This file doesn't look like a WaSender backup.");
  }

  // Stop every WhatsApp client first — Windows keeps .wwebjs_auth's files
  // locked while Chrome still has them open, so replacing that directory
  // while a client is still running would fail or corrupt the profile.
  await waManager.stopAll();
  await prisma.$disconnect();

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
}
