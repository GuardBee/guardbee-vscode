const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");

/** @type {esbuild.BuildOptions} */
const shared = {
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  sourcemap: true,
  external: ["vscode"],
  logLevel: "info",
};

async function build() {
  const extensionCtx = await esbuild.context({
    ...shared,
    entryPoints: ["src/extension.ts"],
    outfile: "dist/extension.js",
  });

  const workerCtx = await esbuild.context({
    ...shared,
    entryPoints: ["src/workspaceScanWorker.ts"],
    outfile: "dist/workspaceScanWorker.js",
  });

  if (watch) {
    await Promise.all([extensionCtx.watch(), workerCtx.watch()]);
  } else {
    await extensionCtx.rebuild();
    await workerCtx.rebuild();
    await extensionCtx.dispose();
    await workerCtx.dispose();
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
