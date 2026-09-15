import { existsSync, readFileSync, statSync } from "fs";
import * as vscode from "vscode";
import { DiagnosticsManager } from "../diagnostics/manager";
import { scanTextWithAll } from "./adapters";
import {
  AGENT_SURFACE_GLOBS,
  classifyAgentSurfacePath,
  dirnameOf,
  extractLocalMcpTargets,
  scannersForAgentSurface,
} from "./agentSurface";
import { filterFindings, isExcluded, loadGuardbeeConfig } from "./config";
import { DEFAULT_WORKSPACE_EXCLUDES, shouldScanContents, shouldScanPath } from "./fileFilter";
import { filterSuppressedFindings, isSuppressedAt } from "./suppress";
import { ALL_SCANNER_IDS, ID, NormalizedFinding, ScannerId, Severity } from "./types";
import { runWorkspaceScan } from "./workspaceScan";

export function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function getEnabledScanners(): ScannerId[] {
  const configured = vscode.workspace.getConfiguration("guardbee").get<ScannerId[]>("enabledScanners");
  return configured && configured.length > 0 ? configured : ALL_SCANNER_IDS;
}

export function scannersForPath(filePath: string, enabled = getEnabledScanners()): ScannerId[] {
  const kind = classifyAgentSurfacePath(filePath);
  if (!kind) return enabled;
  return scannersForAgentSurface(kind).filter((scanner) => enabled.includes(scanner));
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
  scanners = scannersForPath(document.uri.fsPath)
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
  scanners = scannersForPath(filePath)
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
    const surface = await scanAgentSurface(diagnostics, token, onProgress, selected);
    return dedupeFindings([...suppressed, ...surface]);
  } finally {
    cancel?.dispose();
  }
}

export async function scanAgentSurface(
  diagnostics: DiagnosticsManager,
  token?: vscode.CancellationToken,
  onProgress?: (message: string) => void,
  scanners?: ScannerId[]
): Promise<NormalizedFinding[]> {
  const root = getWorkspaceRoot();
  if (!root) {
    throw new Error("Open a folder to scan Cursor and MCP files.");
  }

  const exclude = "{**/node_modules/**,**/.git/**,**/.vscode-test/**}";
  const batches = await Promise.all(
    AGENT_SURFACE_GLOBS.map((pattern) => vscode.workspace.findFiles(pattern, exclude, 200, token))
  );
  const uris = batches.flat();
  const seen = new Set<string>();
  const all: NormalizedFinding[] = [];
  const enabled = scanners && scanners.length > 0 ? scanners : getEnabledScanners();

  for (const uri of uris) {
    if (token?.isCancellationRequested) break;
    const kind = classifyAgentSurfacePath(uri.fsPath);
    if (!kind || seen.has(uri.fsPath)) continue;
    seen.add(uri.fsPath);

    const selected = scannersForPath(uri.fsPath, enabled);
    if (selected.length === 0) continue;
    onProgress?.(uri.fsPath.replace(root, "").replace(/^[\\/]/, "") || uri.fsPath);
    const findings = await scanFilePath(uri.fsPath, diagnostics, selected);
    all.push(...findings);

    if (kind !== "mcp-config") continue;
    let text = "";
    try {
      text = readFileSync(uri.fsPath, "utf8");
    } catch {
      continue;
    }
    for (const target of extractLocalMcpTargets(text, dirnameOf(uri.fsPath))) {
      if (seen.has(target) || !existsSync(target)) continue;
      try {
        if (!statSync(target).isFile()) continue;
      } catch {
        continue;
      }
      seen.add(target);
      const localScanners = [ID.mcp, ID.secret, ID.aiCode].filter((scanner) => enabled.includes(scanner));
      if (localScanners.length === 0) continue;
      const extra = await scanFilePath(target, diagnostics, localScanners);
      all.push(...extra);
    }
  }

  return all;
}

function dedupeFindings(findings: NormalizedFinding[]): NormalizedFinding[] {
  const seen = new Set<string>();
  const out: NormalizedFinding[] = [];
  for (const finding of findings) {
    const key = `${finding.file ?? ""}:${finding.line}:${finding.column}:${finding.scanner}:${finding.patternId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(finding);
  }
  return out;
}
