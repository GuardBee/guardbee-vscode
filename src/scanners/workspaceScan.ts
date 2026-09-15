import { fork, ChildProcess } from "child_process";
import * as path from "path";
import { NormalizedFinding, ScannerId } from "./types";

export interface WorkspaceScanProgress {
  scanner: ScannerId;
  scannedFiles: number;
  skippedFiles: number;
}

export interface WorkspaceScanHandle {
  promise: Promise<NormalizedFinding[]>;
  cancel: () => void;
}

export function runWorkspaceScan(
  rootPath: string,
  scanners: ScannerId[],
  exclude: string[] | undefined,
  onProgress: (progress: WorkspaceScanProgress) => void
): WorkspaceScanHandle {
  const workerPath = path.join(__dirname, "workspaceScanWorker.js");
  const child: ChildProcess = fork(workerPath, { silent: true });

  const findings: NormalizedFinding[] = [];
  let cancelled = false;

  const promise = new Promise<NormalizedFinding[]>((resolve, reject) => {
    child.on("message", (msg: any) => {
      if (msg.type === "scanner-done") {
        findings.push(...msg.findings);
        onProgress({ scanner: msg.scanner, scannedFiles: msg.scannedFiles, skippedFiles: msg.skippedFiles });
      } else if (msg.type === "complete") {
        resolve(findings);
      } else if (msg.type === "error") {
        reject(new Error(msg.message));
      }
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (cancelled) {
        reject(new Error("GuardBee workspace scan cancelled"));
      } else if (code !== 0 && code !== null) {
        reject(new Error(`GuardBee workspace scan worker exited with code ${code}`));
      }
    });

    child.send({ type: "start", rootPath, scanners, exclude });
  });

  return {
    promise,
    cancel: () => {
      cancelled = true;
      child.kill();
    },
  };
}
