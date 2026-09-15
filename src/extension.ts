import { readFileSync } from "fs";
import * as vscode from "vscode";
import { GuardBeeCodeActionProvider } from "./actions/codeActions";
import { registerFindingHover } from "./actions/hover";
import { DiagnosticsManager } from "./diagnostics/manager";
import { GuardbeeApiError } from "./remote/apiClient";
import { clearApiKey, getApiKey, setApiKey } from "./remote/auth";
import { fetchFindings, listBrands, listScans, pollScan, triggerScan } from "./remote/scan";
import { RemoteScan } from "./remote/types";
import { addAllowlistEntry, filterFindings, isExcluded, loadGuardbeeConfig } from "./scanners/config";
import { DEFAULT_WORKSPACE_EXCLUDES, shouldScanContents, shouldScanPath } from "./scanners/fileFilter";
import { scanTextWithAll } from "./scanners/adapters";
import { disableNextLineComment, filterSuppressedFindings, isSuppressedAt } from "./scanners/suppress";
import { ALL_SCANNER_IDS, NormalizedFinding, ScannerId, Severity } from "./scanners/types";
import { runWorkspaceScan } from "./scanners/workspaceScan";
import { GuardBeeStatusBar } from "./statusBar";
import { LocalFindingsProvider } from "./views/localFindingsProvider";
import { RemoteScansProvider } from "./views/remoteScansProvider";

const DASHBOARD_URL = "https://app.guardbee.ai";

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function getEnabledScanners(): ScannerId[] {
  const configured = vscode.workspace.getConfiguration("guardbee").get<ScannerId[]>("enabledScanners");
  return configured && configured.length > 0 ? configured : ALL_SCANNER_IDS;
}

function getSeverityThreshold(): Severity {
  return vscode.workspace.getConfiguration("guardbee").get<Severity>("severityThreshold", "low");
}

function relativePath(filePath: string): string {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) return filePath;
  return filePath.replace(workspaceRoot, "").replace(/^[\\/]/, "");
}

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = new DiagnosticsManager();
  const localFindingsProvider = new LocalFindingsProvider(diagnostics);
  const remoteScansProvider = new RemoteScansProvider();
  const statusBar = new GuardBeeStatusBar();

  context.subscriptions.push(
    diagnostics,
    statusBar,
    vscode.window.registerTreeDataProvider("guardbeeLocalFindings", localFindingsProvider),
    vscode.window.registerTreeDataProvider("guardbeeRemoteScans", remoteScansProvider),
    vscode.languages.registerCodeActionsProvider(
      { scheme: "file" },
      new GuardBeeCodeActionProvider(diagnostics),
      { providedCodeActionKinds: GuardBeeCodeActionProvider.providedCodeActionKinds }
    ),
    registerFindingHover(diagnostics)
  );

  async function syncUi(): Promise<void> {
    const connected = Boolean(await getApiKey(context));
    await vscode.commands.executeCommand("setContext", "guardbee.connected", connected);
    statusBar.update(diagnostics.count(), connected);
    localFindingsProvider.refresh();
  }

  function applyDocumentFilters(document: vscode.TextDocument, findings: NormalizedFinding[]): NormalizedFinding[] {
    const config = loadGuardbeeConfig(getWorkspaceRoot());
    const thresholded = filterFindings(findings, getSeverityThreshold(), config);
    const lines = document.getText().split(/\r?\n/);
    return thresholded.filter((finding) => finding.line <= 0 || !isSuppressedAt(lines, finding.line, finding.scanner));
  }

  async function scanDocument(document: vscode.TextDocument): Promise<void> {
    if (document.uri.scheme !== "file") return;
    if (!shouldScanContents(document.uri.fsPath, document.getText().length)) {
      diagnostics.clearForDocument(document.uri);
      await syncUi();
      return;
    }

    const config = loadGuardbeeConfig(getWorkspaceRoot());
    const scanners = getEnabledScanners().filter((s) => !isExcluded(relativePath(document.uri.fsPath), s, config));
    const raw = await scanTextWithAll(scanners, document.getText(), document.uri.fsPath);
    diagnostics.setForDocument(document.uri, applyDocumentFilters(document, raw));
    await syncUi();
  }

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (vscode.workspace.getConfiguration("guardbee").get<boolean>("scanOnSave", true)) {
        scanDocument(doc).catch((err) => vscode.window.showErrorMessage(`GuardBee scan failed: ${err.message}`));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("guardbee.scanCurrentFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("GuardBee: no active file to scan.");
        return;
      }
      await scanDocument(editor.document);
      vscode.window.showInformationMessage("GuardBee: scan complete.");
    }),
    vscode.commands.registerCommand("guardbee.rescanActive", async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) await scanDocument(editor.document);
    }),
    vscode.commands.registerCommand(
      "guardbee.ignoreFinding",
      async (uri?: vscode.Uri, line0?: number, scanner?: ScannerId) => {
        if (!uri || line0 === undefined || !scanner) return;
        const document = await vscode.workspace.openTextDocument(uri);
        const comment = disableNextLineComment(document.languageId, scanner);
        if (!comment) {
          vscode.window.showWarningMessage("GuardBee: this file type does not support ignore comments. Use the allowlist instead.");
          return;
        }
        if (line0 < 0 || line0 >= document.lineCount) return;
        const indent = document.lineAt(line0).text.match(/^\s*/)?.[0] ?? "";
        const edit = new vscode.WorkspaceEdit();
        edit.insert(uri, new vscode.Position(line0, 0), `${indent}${comment}\n`);
        const applied = await vscode.workspace.applyEdit(edit);
        if (!applied) return;
        await scanDocument(await vscode.workspace.openTextDocument(uri));
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("guardbee.scanWorkspace", async () => {
      const root = getWorkspaceRoot();
      if (!root) {
        vscode.window.showWarningMessage("GuardBee: open a folder to scan the workspace.");
        return;
      }

      const config = loadGuardbeeConfig(root);
      const scanners = getEnabledScanners();
      const threshold = getSeverityThreshold();
      const mergedExclude = Array.from(
        new Set([...DEFAULT_WORKSPACE_EXCLUDES, ...scanners.flatMap((s) => config[s]?.exclude ?? [])])
      );

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "GuardBee: scanning workspace",
          cancellable: true,
        },
        async (progress, token) => {
          const handle = runWorkspaceScan(root, scanners, mergedExclude, (p) => {
            progress.report({ message: `${p.scanner}: ${p.scannedFiles} file(s) scanned` });
          });
          token.onCancellationRequested(() => handle.cancel());

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
            await syncUi();
            vscode.window.showInformationMessage(
              `GuardBee: workspace scan complete — ${suppressed.length} finding(s) in ${byFile.size} file(s).`
            );
          } catch (err) {
            if (!token.isCancellationRequested) {
              vscode.window.showErrorMessage(`GuardBee workspace scan failed: ${(err as Error).message}`);
            }
          }
        }
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("guardbee.connect", async () => {
      await setApiKey(context);
      await syncUi();
    }),
    vscode.commands.registerCommand("guardbee.disconnect", async () => {
      await clearApiKey(context);
      await syncUi();
    }),
    vscode.commands.registerCommand("guardbee.openDashboard", () => {
      vscode.env.openExternal(vscode.Uri.parse(DASHBOARD_URL));
    }),
    vscode.commands.registerCommand("guardbee.focusFindings", () => {
      vscode.commands.executeCommand("guardbeeLocalFindings.focus").then(undefined, () => undefined);
    }),
    vscode.commands.registerCommand("guardbee.addToAllowlist", async (finding?: NormalizedFinding) => {
      if (!finding?.match) {
        vscode.window.showWarningMessage("GuardBee: no finding selected to allowlist.");
        return;
      }
      const root = getWorkspaceRoot();
      if (!root) {
        vscode.window.showWarningMessage("GuardBee: open a folder to update guardbee.yml.");
        return;
      }
      const choice = await vscode.window.showInformationMessage(
        "Add this match to the workspace allowlist?",
        { modal: true },
        "Add"
      );
      if (choice !== "Add") return;
      try {
        const path = addAllowlistEntry(root, finding.scanner, finding.match);
        vscode.window.showInformationMessage(`GuardBee: allowlist updated (${path}).`);
        const editor = vscode.window.activeTextEditor;
        if (editor) await scanDocument(editor.document);
        else await syncUi();
      } catch (err) {
        vscode.window.showErrorMessage(`GuardBee: ${(err as Error).message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("guardbee.triggerRemoteScan", async () => {
      let brands;
      try {
        brands = await listBrands(context);
      } catch (err) {
        handleRemoteError(err);
        return;
      }

      const ENTER_URL = "$(edit) Enter a URL manually…";
      const pick = await vscode.window.showQuickPick(
        [...brands.map((b) => ({ label: b.domain ?? b.name ?? b.id, id: b.id })), { label: ENTER_URL, id: undefined }],
        { title: "GuardBee: choose a target to scan" }
      );
      if (!pick) return;

      let target: { brandId: string } | { url: string };
      if (pick.label === ENTER_URL) {
        const url = await vscode.window.showInputBox({ title: "URL to scan", placeHolder: "https://example.com" });
        if (!url) return;
        target = { url };
      } else {
        target = { brandId: pick.id! };
      }

      try {
        const scan = await triggerScan(context, target);
        remoteScansProvider.upsertScan(scan, []);

        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: "GuardBee: remote scan running", cancellable: true },
          async (progress, token) => {
            const finalScan = await pollScan(
              context,
              scan.id,
              (s) => {
                progress.report({ message: s.status });
                remoteScansProvider.upsertScan(s, []);
              },
              () => token.isCancellationRequested
            );

            if (finalScan.status === "COMPLETED") {
              const findings = await fetchFindings(context, finalScan.id);
              remoteScansProvider.upsertScan(finalScan, findings);
              vscode.window.showInformationMessage(`GuardBee: remote scan complete — ${findings.length} finding(s).`);
            } else {
              remoteScansProvider.upsertScan(finalScan, []);
              vscode.window.showWarningMessage(`GuardBee: remote scan ended with status ${finalScan.status}.`);
            }
          }
        );
      } catch (err) {
        handleRemoteError(err);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("guardbee.showRecentScans", async () => {
      let scans: RemoteScan[];
      try {
        scans = await listScans(context);
      } catch (err) {
        handleRemoteError(err);
        return;
      }

      const recent = scans.slice(0, 10);
      const withFindings = await Promise.all(
        recent.map(async (scan) => ({
          scan,
          findings: scan.status === "COMPLETED" ? await fetchFindings(context, scan.id).catch(() => []) : [],
        }))
      );
      remoteScansProvider.setScans(withFindings);
      vscode.commands.executeCommand("guardbeeRemoteScans.focus").then(undefined, () => undefined);
    })
  );

  void syncUi();
}

function handleRemoteError(err: unknown): void {
  if (err instanceof GuardbeeApiError && err.status === 401) {
    vscode.window
      .showErrorMessage("GuardBee: no account connected.", "Connect Account")
      .then((choice) => {
        if (choice === "Connect Account") vscode.commands.executeCommand("guardbee.connect");
      });
    return;
  }
  vscode.window.showErrorMessage(`GuardBee: ${(err as Error).message}`);
}

export function deactivate(): void {
  // Disposables are cleaned up via context.subscriptions.
}
