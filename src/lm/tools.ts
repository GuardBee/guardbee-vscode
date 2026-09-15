import * as vscode from "vscode";
import { DiagnosticsManager } from "../diagnostics/manager";
import { ScannerId } from "../scanners/types";
import { getEnabledScanners, getWorkspaceRoot, scanAgentSurface, scanDocument, scanFilePath, scanTextBuffer, scanWorkspace } from "../scanners/run";
import { parseScannerFilter, resolveWorkspacePath } from "../scanners/resolve";
import { agentResultToMarkdown, toAgentScanResult } from "./format";

export const TOOL = {
  scanFile: "guardbee_scan_file",
  scanWorkspace: "guardbee_scan_workspace",
  checkCode: "guardbee_check_code",
  scanAgentSurface: "guardbee_scan_agent_surface",
} as const;

export const ALL_TOOL_NAMES = [TOOL.scanFile, TOOL.scanWorkspace, TOOL.checkCode, TOOL.scanAgentSurface] as const;

interface ScanFileInput {
  path?: string;
  scanners?: string[] | string;
}

interface ScanWorkspaceInput {
  scanners?: string[] | string;
}

interface CheckCodeInput {
  code: string;
  path?: string;
  scanners?: string[] | string;
}

function resultPart(findings: Parameters<typeof toAgentScanResult>[0]): vscode.LanguageModelToolResult {
  const payload = toAgentScanResult(findings, getWorkspaceRoot());
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(JSON.stringify(payload, null, 2))]);
}

function resolveScanners(input: string[] | string | undefined): ScannerId[] {
  return parseScannerFilter(input, getEnabledScanners());
}

function activeFilePath(): string | undefined {
  const uri = vscode.window.activeTextEditor?.document.uri;
  return uri?.scheme === "file" ? uri.fsPath : undefined;
}

export function registerLanguageModelTools(
  context: vscode.ExtensionContext,
  diagnostics: DiagnosticsManager,
  syncUi: () => Promise<void>
): void {
  if (typeof vscode.lm?.registerTool !== "function") return;

  context.subscriptions.push(
    vscode.lm.registerTool<ScanFileInput>(TOOL.scanFile, {
      prepareInvocation(options) {
        const target = options.input.path || activeFilePath() || "the active file";
        return {
          invocationMessage: "Scanning file with GuardBee",
          confirmationMessages: {
            title: "GuardBee: scan file",
            message: new vscode.MarkdownString(`Scan \`${target}\` with GuardBee local analyzers?`),
          },
        };
      },
      async invoke(options, _token) {
        const scanners = resolveScanners(options.input.scanners);
        const path = resolveWorkspacePath(options.input.path, getWorkspaceRoot(), activeFilePath());
        if (!path) {
          throw new Error("No file to scan. Pass an absolute path, or open a file first.");
        }
        const findings = await scanFilePath(path, diagnostics, scanners);
        await syncUi();
        return resultPart(findings);
      },
    }),
    vscode.lm.registerTool<ScanWorkspaceInput>(TOOL.scanWorkspace, {
      prepareInvocation(options) {
        const filter = options.input.scanners
          ? ` (${Array.isArray(options.input.scanners) ? options.input.scanners.join(", ") : options.input.scanners})`
          : "";
        return {
          invocationMessage: "Scanning workspace with GuardBee",
          confirmationMessages: {
            title: "GuardBee: scan workspace",
            message: new vscode.MarkdownString(`Run GuardBee local analyzers across the open workspace${filter}?`),
          },
        };
      },
      async invoke(options, token) {
        const scanners = resolveScanners(options.input.scanners);
        const findings = await scanWorkspace(diagnostics, scanners, token);
        await syncUi();
        return resultPart(findings);
      },
    }),
    vscode.lm.registerTool<CheckCodeInput>(TOOL.checkCode, {
      prepareInvocation(options) {
        const target = options.input.path || "the proposed code";
        return {
          invocationMessage: "Checking code with GuardBee before save",
          confirmationMessages: {
            title: "GuardBee: check code",
            message: new vscode.MarkdownString(`Check \`${target}\` with GuardBee before saving?`),
          },
        };
      },
      async invoke(options) {
        const code = options.input.code;
        if (typeof code !== "string" || code.length === 0) {
          throw new Error("Pass the code to check in the `code` parameter before saving.");
        }
        const scanners = resolveScanners(options.input.scanners);
        const path = options.input.path
          ? resolveWorkspacePath(options.input.path, getWorkspaceRoot())
          : undefined;
        const findings = await scanTextBuffer(code, path, scanners);
        if (path) {
          diagnostics.setForDocument(vscode.Uri.file(path), findings);
          await syncUi();
        }
        return resultPart(findings);
      },
    }),
    vscode.lm.registerTool(TOOL.scanAgentSurface, {
      prepareInvocation() {
        return {
          invocationMessage: "Scanning Cursor and MCP files with GuardBee",
          confirmationMessages: {
            title: "GuardBee: scan Cursor and MCP files",
            message: new vscode.MarkdownString(
              "Scan MCP configs, Cursor rules, agent skills, and hooks with GuardBee?"
            ),
          },
        };
      },
      async invoke(_options, token) {
        const findings = await scanAgentSurface(diagnostics, token);
        await syncUi();
        return resultPart(findings);
      },
    })
  );
}

/** Used by the chat participant and tests. */
export async function runChatScan(
  kind: "file" | "workspace" | "surface",
  diagnostics: DiagnosticsManager,
  syncUi: () => Promise<void>,
  token?: vscode.CancellationToken
): Promise<string> {
  if (kind === "workspace") {
    const findings = await scanWorkspace(diagnostics, getEnabledScanners(), token);
    await syncUi();
    return agentResultToMarkdown(toAgentScanResult(findings, getWorkspaceRoot()));
  }
  if (kind === "surface") {
    const findings = await scanAgentSurface(diagnostics, token);
    await syncUi();
    return agentResultToMarkdown(toAgentScanResult(findings, getWorkspaceRoot()));
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) throw new Error("Open a file to scan, or ask to scan the workspace.");
  const findings = await scanDocument(editor.document, diagnostics);
  await syncUi();
  return agentResultToMarkdown(toAgentScanResult(findings, getWorkspaceRoot()));
}
