// Turbopack creates hashed external packages symlinked under .next/node_modules
// (e.g. .next/node_modules/@prisma/client-<hash> -> node_modules/@prisma/client) so that
// require("@prisma/client-<hash>") resolves to the real package. electron-builder does not
// copy .next/node_modules into the packaged app, so at runtime that require() fails.
//
// electron-builder computes its own production dependency graph for the "node_modules/**/*"
// files pattern and prunes anything not part of it, so a shim placed directly under
// node_modules would get stripped from the package. Instead these shims are written to
// .next-external-shims/ and copied into the packaged app's node_modules via the
// build.extraResources entry in package.json (the same mechanism already used for
// node_modules/.prisma), which does a plain copy with no dependency-graph pruning.
//
// Node module resolution walks up through every ancestor node_modules directory, so this
// shim (once copied to app/node_modules at packaging time) is found once .next/node_modules
// is gone from the packaged app.
const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const nextNodeModules = path.join(rootDir, ".next", "node_modules");
const rootNodeModules = path.join(rootDir, ".next-external-shims");

function findSymlinks(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir)) {
    const entryPath = path.join(dir, entry);
    const lstat = fs.lstatSync(entryPath);
    if (lstat.isSymbolicLink()) {
      results.push(entryPath);
    } else if (lstat.isDirectory()) {
      findSymlinks(entryPath, results);
    }
  }
  return results;
}

for (const symlinkPath of findSymlinks(nextNodeModules)) {
  const targetDir = fs.realpathSync(symlinkPath);
  const targetPkgJson = JSON.parse(fs.readFileSync(path.join(targetDir, "package.json"), "utf8"));
  const realName = targetPkgJson.name;

  const relPath = path.relative(nextNodeModules, symlinkPath);
  const shimDir = path.join(rootNodeModules, relPath);

  fs.rmSync(shimDir, { recursive: true, force: true });
  fs.mkdirSync(shimDir, { recursive: true });
  fs.writeFileSync(
    path.join(shimDir, "package.json"),
    JSON.stringify({ name: path.basename(relPath), version: targetPkgJson.version || "0.0.0", main: "index.js" }, null, 2),
  );
  fs.writeFileSync(path.join(shimDir, "index.js"), `module.exports = require(${JSON.stringify(realName)});\n`);

  console.log(`Created shim ${shimDir} -> require("${realName}")`);
}
