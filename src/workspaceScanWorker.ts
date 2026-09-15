import { ScannerId } from "./scanners/types";

type StartMessage = {
  type: "start";
  rootPath: string;
  scanners: ScannerId[];
  exclude?: string[];
};

type ScannerDoneMessage = {
  type: "scanner-done";
  scanner: ScannerId;
  findings: any[];
  scannedFiles: number;
  skippedFiles: number;
};

type CompleteMessage = { type: "complete" };
type ErrorMessage = { type: "error"; message: string };

type ScanDirModule = {
  scanDirectory: (dir: string, opts: { exclude?: string[] }) => {
    findings: any[];
    scannedFiles: number;
    skippedFiles: number;
  };
};

// The @guardbee/mcp-* scanner packages are ESM-only; dynamic import() keeps them
// loadable from this CJS-bundled forked worker.
function importScanner(scanner: ScannerId): Promise<ScanDirModule> {
  switch (scanner) {
    case "secret-scanner":
      return import("@guardbee/mcp-secret-scanner") as unknown as Promise<ScanDirModule>;
    case "ai-code-scanner":
      return import("@guardbee/mcp-ai-code-scanner") as unknown as Promise<ScanDirModule>;
    case "mcp-server-auditor":
      return import("@guardbee/mcp-server-auditor") as unknown as Promise<ScanDirModule>;
    case "prompt-injection-scanner":
      return import("@guardbee/mcp-prompt-injection-scanner") as unknown as Promise<ScanDirModule>;
  }
}

process.on("message", async (msg: StartMessage) => {
  if (msg.type !== "start") return;
  try {
    for (const scanner of msg.scanners) {
      const mod = await importScanner(scanner);
      const result = mod.scanDirectory(msg.rootPath, { exclude: msg.exclude });
      const findings = result.findings.map((f: any) => ({ ...f, scanner }));
      const done: ScannerDoneMessage = {
        type: "scanner-done",
        scanner,
        findings,
        scannedFiles: result.scannedFiles,
        skippedFiles: result.skippedFiles,
      };
      process.send?.(done);
    }
    const complete: CompleteMessage = { type: "complete" };
    process.send?.(complete);
  } catch (err) {
    const error: ErrorMessage = { type: "error", message: err instanceof Error ? err.message : String(err) };
    process.send?.(error);
  } finally {
    process.exit(0);
  }
});
