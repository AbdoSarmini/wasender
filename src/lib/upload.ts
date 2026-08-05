import fs from "fs";
import path from "path";
import crypto from "crypto";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

export function ensureUploadDir(subdir: string) {
  const dir = path.join(UPLOAD_ROOT, subdir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function saveUploadedFile(file: File, subdir: string) {
  const dir = ensureUploadDir(subdir);
  const ext = path.extname(file.name) || "";
  const safeName = `${crypto.randomUUID()}${ext}`;
  const fullPath = path.join(dir, safeName);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(fullPath, buffer);
  return {
    relativePath: path.join("uploads", subdir, safeName),
    absolutePath: fullPath,
    fileName: file.name,
    mime: file.type,
  };
}

export function deleteUploadedFile(relativePath: string) {
  const fullPath = path.join(process.cwd(), relativePath);
  if (fs.existsSync(fullPath)) {
    fs.rmSync(fullPath, { force: true });
  }
}

export { UPLOAD_ROOT };
