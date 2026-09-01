// Downloads a standalone node.exe into electron/vendor/node/ so the desktop
// app can run the server under a real Node.js runtime instead of Electron's
// bundled one (whose Node ABI doesn't match the native modules — better-
// sqlite3 — that `npm install` compiles against the system Node used here).
//
// The pinned version's ABI (process.versions.modules) MUST match whatever
// Node ran `npm install` for this project (see package.json "engines").
// Node's ABI is stable across an entire major version, so any 24.x works,
// but we pin exactly for reproducibility.
const https = require("https");
const fs = require("fs");
const path = require("path");

const NODE_VERSION = "24.15.0";
const DEST_DIR = path.join(__dirname, "..", "electron", "vendor", "node");
const DEST_FILE = path.join(DEST_DIR, "node.exe");
const URL = `https://nodejs.org/dist/v${NODE_VERSION}/win-x64/node.exe`;

function download(url, destFile, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirectsLeft <= 0) return reject(new Error("too many redirects"));
          res.resume();
          return resolve(download(res.headers.location, destFile, redirectsLeft - 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`unexpected status ${res.statusCode} fetching ${url}`));
        }
        const file = fs.createWriteStream(destFile);
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
        file.on("error", reject);
      })
      .on("error", reject);
  });
}

async function main() {
  if (fs.existsSync(DEST_FILE)) {
    console.log(`vendor node.exe already present at ${DEST_FILE}, skipping download`);
    return;
  }
  fs.mkdirSync(DEST_DIR, { recursive: true });
  console.log(`Downloading node v${NODE_VERSION} (win-x64) to ${DEST_FILE} ...`);
  const tmpFile = `${DEST_FILE}.download`;
  await download(URL, tmpFile);
  fs.renameSync(tmpFile, DEST_FILE);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
