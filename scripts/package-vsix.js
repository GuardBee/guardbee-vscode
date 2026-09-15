const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const pkgPath = path.join(root, "package.json");
const stub = process.argv.includes("--stub");
const publish = process.argv.includes("--publish");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: false });
  return result.status ?? 1;
}

function slimManifest(pkg) {
  const slim = { ...pkg };
  delete slim.scripts;
  delete slim.dependencies;
  delete slim.devDependencies;
  if (stub) {
    slim.activationEvents = [
      "onCommand:guardbee.scanCurrentFile",
      "onCommand:guardbee.scanWorkspace",
      "onCommand:guardbee.connect",
      "onCommand:guardbee.disconnect",
      "onCommand:guardbee.triggerRemoteScan",
      "onCommand:guardbee.showRecentScans",
      "onView:guardbeeLocalFindings",
      "onView:guardbeeRemoteScans",
    ];
  }
  return slim;
}

const original = fs.readFileSync(pkgPath, "utf8");
let status = stub
  ? run(path.join(root, "node_modules", ".bin", "esbuild"), [
      "src/stubExtension.ts",
      "--bundle",
      "--platform=node",
      "--format=cjs",
      "--external:vscode",
      "--outfile=dist/extension.js",
    ])
  : run("node", ["esbuild.js"]);
if (status === 0 && stub) {
  const worker = path.join(root, "dist", "workspaceScanWorker.js");
  if (fs.existsSync(worker)) fs.unlinkSync(worker);
}
if (status === 0) {
  fs.writeFileSync(pkgPath, `${JSON.stringify(slimManifest(JSON.parse(original)), null, 2)}\n`);
  try {
    const vsce = path.join(root, "node_modules", ".bin", "vsce");
    const args = [publish ? "publish" : "package", "--no-dependencies"];
    if (publish) args.push("--skip-duplicate");
    status = run(vsce, args);
  } finally {
    fs.writeFileSync(pkgPath, original);
  }
}

process.exit(status);
