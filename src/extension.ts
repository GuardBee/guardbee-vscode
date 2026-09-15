import * as vscode from "vscode";
import { scanTextWithAll } from "./scanners/adapters";
import { filterFindings, isExcluded, loadGuardbeeConfig } from "./scanners/config";
import { runWorkspaceScan } from "./scanners/workspaceScan";
import { NormalizedFinding, ScannerId, Severity } from "./scanners/types";
import { DiagnosticsManager } from "./diagnostics/manager";
import { LocalFindingsProvider } from "./views/localFindingsProvider";
import { RemoteScansProvider } from "./views/remoteScansProvider";
import { clearApiKey, setApiKey } from "./remote/auth";
import { fetchFindings, listBrands, listScans, pollScan, triggerScan } from "./remote/scan";
import { GuardbeeApiError } from "./remote/apiClient";
import { RemoteScan } from "./remote/types";

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function getEnabledScanners(): ScannerId[] {
  return vscode.workspace
    .getConfiguration("guardbee")
    .get<ScannerId[]>("enabledScanners", [
      "secret-scanner",
      "ai-code-scanner",
      "mcp-server-auditor",
      "prompt-injection-scanner",
    ]);
}

function getSeverityThreshold(): Severity {
  return vscode.workspace.getConfiguration("guardbee").get<Severity>("severityThreshold", "low");
}

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = new DiagnosticsManager();
  const localFindingsProvider = new LocalFindingsProvider(diagnostics);
  const remoteScansProvider = new RemoteScansProvider();

  context.subscriptions.push(
    diagnostics,
    vscode.window.registerTreeDataProvider("guardbeeLocalFindings", localFindingsProvider),
    vscode.window.registerTreeDataProvider("guardbeeRemoteScans", remoteScansProvider)
  );

  async function scanDocument(document: vscode.TextDocument): Promise<void> {
    if (document.uri.scheme !== "file") return;

    const config = loadGuardbeeConfig(getWorkspaceRoot());
    const workspaceRoot = getWorkspaceRoot();
    const relPath = workspaceRoot
      ? document.uri.fsPath.replace(workspaceRoot, "").replace(/^[\\/]/, "")
      : document.uri.fsPath;

    const scanners = getEnabledScanners().filter((s) => !isExcluded(relPath, s, config));
    const raw = await scanTextWithAll(scanners, document.getText(), document.uri.fsPath);
    const filtered = filterFindings(raw, getSeverityThreshold(), config);

    diagnostics.setForDocument(document.uri, filtered);
    localFindingsProvider.refresh();
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
    })
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
        new Set(scanners.flatMap((s) => config[s]?.exclude ?? []))
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

            diagnostics.clearAll();
            const byFile = new Map<string, NormalizedFinding[]>();
            for (const finding of filtered) {
              if (!finding.file) continue;
              const list = byFile.get(finding.file) ?? [];
              list.push(finding);
              byFile.set(finding.file, list);
            }
            for (const [filePath, findings] of byFile) {
              diagnostics.setForDocument(vscode.Uri.file(filePath), findings);
            }
            localFindingsProvider.refresh();
            vscode.window.showInformationMessage(
              `GuardBee: workspace scan complete — ${filtered.length} finding(s) in ${byFile.size} file(s).`
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
    vscode.commands.registerCommand("guardbee.setApiKey", () => setApiKey(context)),
    vscode.commands.registerCommand("guardbee.clearApiKey", () => clearApiKey(context))
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
}

function handleRemoteError(err: unknown): void {
  if (err instanceof GuardbeeApiError && err.status === 401) {
    vscode.window
      .showErrorMessage("GuardBee: no API key configured.", "Set API Key")
      .then((choice) => {
        if (choice === "Set API Key") vscode.commands.executeCommand("guardbee.setApiKey");
      });
    return;
  }
  vscode.window.showErrorMessage(`GuardBee: ${(err as Error).message}`);
}

export function deactivate(): void {
  // Disposables are cleaned up via context.subscriptions.
}
