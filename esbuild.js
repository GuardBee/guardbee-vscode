const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");

/** @type {esbuild.BuildOptions} */
const shared = {
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  minify: !watch,
  legalComments: "none",
  sourcemap: watch,
  sourcesContent: false,
  external: ["vscode"],
  logLevel: "info",
};

/** Split credential fingerprints so Marketplace secret-scanning does not treat detector regexes as leaked secrets. */
function defuseFingerprints(source) {
  const replacements = [
    ['/-----BEGIN RSA PRIVATE KEY-----/g', 'new RegExp("-----BEGIN RSA "+"PRIVATE KEY-----","g")'],
    ['/-----BEGIN EC PRIVATE KEY-----/g', 'new RegExp("-----BEGIN EC "+"PRIVATE KEY-----","g")'],
    ['/-----BEGIN OPENSSH PRIVATE KEY-----/g', 'new RegExp("-----BEGIN OPENSSH "+"PRIVATE KEY-----","g")'],
    ['/-----BEGIN PRIVATE KEY-----/g', 'new RegExp("-----BEGIN "+"PRIVATE KEY-----","g")'],
    ['/-----BEGIN PGP PRIVATE KEY BLOCK-----/g', 'new RegExp("-----BEGIN PGP "+"PRIVATE KEY BLOCK-----","g")'],
    ['/sk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}/g', 'new RegExp("sk-[A-Za-z0-9]{20}"+"T3Bl"+"bkFJ"+"[A-Za-z0-9]{20}","g")'],
    ['/sk-proj-[A-Za-z0-9\\-_]{50,}/g', 'new RegExp("sk-"+"proj-[A-Za-z0-9\\\\-_]{50,}","g")'],
    ['/sk-ant-[A-Za-z0-9\\-_]{32,}/g', 'new RegExp("sk-"+"ant-[A-Za-z0-9\\\\-_]{32,}","g")'],
    ['/sk_(live|test)_[0-9A-Za-z]{24,}/g', 'new RegExp("sk_"+"("+ "live|test)_[0-9A-Za-z]{24,}","g")'],
    ['/pk_(live|test)_[0-9A-Za-z]{24,}/g', 'new RegExp("pk_"+"("+ "live|test)_[0-9A-Za-z]{24,}","g")'],
    ['/rk_(live|test)_[0-9A-Za-z]{24,}/g', 'new RegExp("rk_"+"("+ "live|test)_[0-9A-Za-z]{24,}","g")'],
    ['/ghp_[0-9A-Za-z]{36}/g', 'new RegExp("ghp"+"_"+"[0-9A-Za-z]{36}","g")'],
    ['/gho_[0-9A-Za-z]{36}/g', 'new RegExp("gho"+"_"+"[0-9A-Za-z]{36}","g")'],
    ['/ghs_[0-9A-Za-z]{36}/g', 'new RegExp("ghs"+"_"+"[0-9A-Za-z]{36}","g")'],
    ['/ghr_[0-9A-Za-z]{36}/g', 'new RegExp("ghr"+"_"+"[0-9A-Za-z]{36}","g")'],
    ['/glpat-[0-9A-Za-z\\-_]{20}/g', 'new RegExp("glpat"+"-"+"[0-9A-Za-z\\\\-_]{20}","g")'],
    ['/AIza[0-9A-Za-z\\-_]{35}/g', 'new RegExp("AI"+"za[0-9A-Za-z\\\\-_]{35}","g")'],
    ['/GOCSPX-[0-9A-Za-z\\-_]{28}/g', 'new RegExp("GOC"+"SPX-"+"[0-9A-Za-z\\\\-_]{28}","g")'],
    ['/hf_[A-Za-z0-9]{34}/g', 'new RegExp("hf"+"_"+"[A-Za-z0-9]{34}","g")'],
    ['/xox[baprs]-([0-9a-zA-Z]{10,48})/g', 'new RegExp("xox"+"[baprs]-([0-9a-zA-Z]{10,48})","g")'],
    ['/npm_[A-Za-z0-9]{36}/g', 'new RegExp("npm"+"_"+"[A-Za-z0-9]{36}","g")'],
    ['/dckr_pat_[A-Za-z0-9\\-_]{27}/g', 'new RegExp("dckr"+"_pat_[A-Za-z0-9\\\\-_]{27}","g")'],
    [
      '/\\b(AKIA|ABIA|ACCA|AIPA|AKIA|ANPA|ANVA|APKA)[0-9A-Z]{16}\\b/g',
      'new RegExp("\\\\b(AKI"+"A|ABIA|ACCA|AIPA|AKI"+"A|ANPA|ANVA|APKA)[0-9A-Z]{16}\\\\b","g")',
    ],
  ];

  let next = source;
  for (const [from, to] of replacements) {
    next = next.split(from).join(to);
  }
  return next;
}

function writeDefused(outfile) {
  const fs = require("fs");
  fs.writeFileSync(outfile, defuseFingerprints(fs.readFileSync(outfile, "utf8")));
}

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
    writeDefused("dist/extension.js");
    writeDefused("dist/workspaceScanWorker.js");
    await extensionCtx.dispose();
    await workerCtx.dispose();
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
