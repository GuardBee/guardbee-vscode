const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const pkgPath = path.join(root, "package.json");
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
  return slim;
}

const original = fs.readFileSync(pkgPath, "utf8");
let status = run("node", ["esbuild.js"]);
if (status === 0) {
  fs.writeFileSync(pkgPath, `${JSON.stringify(slimManifest(JSON.parse(original)), null, 2)}\n`);
  try {
    const vsce = path.join(root, "node_modules", ".bin", "vsce");
    status = run(vsce, [publish ? "publish" : "package", "--no-dependencies"]);
  } finally {
    fs.writeFileSync(pkgPath, original);
  }
}

process.exit(status);
