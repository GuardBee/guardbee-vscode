import { readFileSync } from "fs";
import * as vscode from "vscode";
import { DiagnosticsManager } from "../diagnostics/manager";
import { scanTextWithAll } from "./adapters";
import { filterFindings, isExcluded, loadGuardbeeConfig } from "./config";
import { DEFAULT_WORKSPACE_EXCLUDES, shouldScanContents, shouldScanPath } from "./fileFilter";
import { filterSuppressedFindings, isSuppressedAt } from "./suppress";
import { ALL_SCANNER_IDS, NormalizedFinding, ScannerId, Severity } from "./types";
import { runWorkspaceScan } from "./workspaceScan";

export function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function getEnabledScanners(): ScannerId[] {
  const configured = vscode.workspace.getConfiguration("guardbee").get<ScannerId[]>("enabledScanners");
  return configured && configured.length > 0 ? configured : ALL_SCANNER_IDS;
}

export function getSeverityThreshold(): Severity {
  return vscode.workspace.getConfiguration("guardbee").get<Severity>("severityThreshold", "low");
}

export function relativePath(filePath: string, workspaceRoot = getWorkspaceRoot()): string {
  if (!workspaceRoot) return filePath;
  return filePath.replace(workspaceRoot, "").replace(/^[\\/]/, "");
}

export function applyTextFilters(text: string, findings: NormalizedFinding[]): NormalizedFinding[] {
  const config = loadGuardbeeConfig(getWorkspaceRoot());
  const thresholded = filterFindings(findings, getSeverityThreshold(), config);
  const lines = text.split(/\r?\n/);
  return thresholded.filter((finding) => finding.line <= 0 || !isSuppressedAt(lines, finding.line, finding.scanner));
}

export async function scanTextBuffer(
  text: string,
  filePath: string | undefined,
  scanners = getEnabledScanners()
): Promise<NormalizedFinding[]> {
  if (filePath && !shouldScanContents(filePath, text.length)) return [];
  const config = loadGuardbeeConfig(getWorkspaceRoot());
  const enabled = scanners.filter((scanner) => !filePath || !isExcluded(relativePath(filePath), scanner, config));
  const raw = await scanTextWithAll(enabled, text, filePath);
  return applyTextFilters(text, raw);
}

export async function scanDocument(
  document: vscode.TextDocument,
  diagnostics: DiagnosticsManager,
  scanners = getEnabledScanners()
): Promise<NormalizedFinding[]> {
  if (document.uri.scheme !== "file") return [];
  if (!shouldScanContents(document.uri.fsPath, document.getText().length)) {
    diagnostics.clearForDocument(document.uri);
    return [];
  }
  const findings = await scanTextBuffer(document.getText(), document.uri.fsPath, scanners);
  diagnostics.setForDocument(document.uri, findings);
  return findings;
}

export async function scanFilePath(
  filePath: string,
  diagnostics: DiagnosticsManager,
  scanners = getEnabledScanners()
): Promise<NormalizedFinding[]> {
  if (!shouldScanPath(filePath)) {
    diagnostics.clearForDocument(vscode.Uri.file(filePath));
    return [];
  }
  try {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    return scanDocument(document, diagnostics, scanners);
  } catch {
    const text = readFileSync(filePath, "utf8");
    const findings = await scanTextBuffer(text, filePath, scanners);
    diagnostics.setForDocument(vscode.Uri.file(filePath), findings);
    return findings;
  }
}

export async function scanWorkspace(
  diagnostics: DiagnosticsManager,
  scanners?: ScannerId[],
  token?: vscode.CancellationToken,
  onProgress?: (message: string) => void
): Promise<NormalizedFinding[]> {
  const root = getWorkspaceRoot();
  if (!root) {
    throw new Error("Open a folder to scan the workspace.");
  }

  const selected = scanners && scanners.length > 0 ? scanners : getEnabledScanners();

  const config = loadGuardbeeConfig(root);
  const threshold = getSeverityThreshold();
  const mergedExclude = Array.from(
    new Set([...DEFAULT_WORKSPACE_EXCLUDES, ...selected.flatMap((s) => config[s]?.exclude ?? [])])
  );

  const handle = runWorkspaceScan(root, selected, mergedExclude, (progress) => {
    onProgress?.(`${progress.scanner}: ${progress.scannedFiles} file(s) scanned`);
  });
  const cancel = token?.onCancellationRequested(() => handle.cancel());

  try {
    const raw = await handle.promise;
    const filtered = filterFindings(raw, threshold, config);
    const lineCache = new Map<string, string[] | undefined>();
    const suppressed = filterSuppressedFindings(filtered, (file) => {
      if (!lineCache.has(file)) {
        try {
          lineCache.set(file, readFileSync(file, "utf8").split(/\r?\n/));
        } catch {
          lineCache.set(file, undefined);
        }
      }
      return lineCache.get(file);
    });

    diagnostics.clearAll();
    const byFile = new Map<string, NormalizedFinding[]>();
    for (const finding of suppressed) {
      if (!finding.file || !shouldScanPath(finding.file)) continue;
      const list = byFile.get(finding.file) ?? [];
      list.push(finding);
      byFile.set(finding.file, list);
    }
    for (const [filePath, findings] of byFile) {
      diagnostics.setForDocument(vscode.Uri.file(filePath), findings);
    }
    return suppressed;
  } finally {
    cancel?.dispose();
  }
}
