import * as vscode from "vscode";
import { GuardBeeCodeActionProvider } from "./actions/codeActions";
import { registerFindingHover } from "./actions/hover";
import { DiagnosticsManager } from "./diagnostics/manager";
import { registerChatParticipant } from "./lm/chat";
import { registerLanguageModelTools } from "./lm/tools";
import { GuardbeeApiError } from "./remote/apiClient";
import { getDashboardOrigin } from "./remote/config";
import {
  disconnectAccount,
  getApiKey,
  getStoredWorkspace,
  setStoredWorkspace,
} from "./remote/auth";
import { connectAccount, registerConnectUriHandler } from "./remote/connect";
import { dashboardFindingUrl, dashboardScanUrl } from "./remote/dashboard";
import { pushLocalFindings } from "./remote/push";
import { fetchFindings, listBrands, listScans, pollScan, triggerScan } from "./remote/scan";
import { RemoteFinding } from "./remote/types";
import { fetchWorkspace } from "./remote/workspace";
import { addAllowlistEntry } from "./scanners/config";
import { NormalizedFinding, ScannerId } from "./scanners/types";
import { disableNextLineComment } from "./scanners/suppress";
import { getWorkspaceRoot, scanAgentSurface, scanDocument, scanWorkspace } from "./scanners/run";
import { GuardBeeStatusBar } from "./statusBar";
import { AgentSurfaceProvider } from "./views/agentSurfaceProvider";
import { LocalFindingsProvider } from "./views/localFindingsProvider";
import { RemoteScansProvider } from "./views/remoteScansProvider";

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = new DiagnosticsManager();
  const localFindingsProvider = new LocalFindingsProvider(diagnostics);
  const agentSurfaceProvider = new AgentSurfaceProvider(diagnostics);
  const remoteScansProvider = new RemoteScansProvider();
  const statusBar = new GuardBeeStatusBar();

  context.subscriptions.push(
    diagnostics,
    statusBar,
    vscode.window.registerTreeDataProvider("guardbeeLocalFindings", localFindingsProvider),
    vscode.window.registerTreeDataProvider("guardbeeAgentSurface", agentSurfaceProvider),
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
    statusBar.update(diagnostics.count(), connected, getStoredWorkspace(context)?.name);
    localFindingsProvider.refresh();
    agentSurfaceProvider.refresh();
  }

  async function loadRecentScans(): Promise<void> {
    const scans = await listScans(context);
    const recent = scans.slice(0, 10);
    const withFindings = await Promise.all(
      recent.map(async (scan) => ({
        scan,
        findings: scan.status === "COMPLETED" ? await fetchFindings(context, scan.id).catch(() => []) : [],
      }))
    );
    remoteScansProvider.setScans(withFindings);
  }

  async function openDashboardUrl(url: string): Promise<void> {
    await vscode.env.openExternal(vscode.Uri.parse(url));
  }

  async function scanAndSync(document: vscode.TextDocument): Promise<void> {
    await scanDocument(document, diagnostics);
    await syncUi();
  }

  registerLanguageModelTools(context, diagnostics, syncUi);
  registerChatParticipant(context, diagnostics, syncUi);

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (vscode.workspace.getConfiguration("guardbee").get<boolean>("scanOnSave", true)) {
        scanAndSync(doc).catch((err) => vscode.window.showErrorMessage(`GuardBee scan failed: ${err.message}`));
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
      await scanAndSync(editor.document);
      vscode.window.showInformationMessage("GuardBee: scan complete.");
    }),
    vscode.commands.registerCommand("guardbee.rescanActive", async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) await scanAndSync(editor.document);
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
        await scanAndSync(await vscode.workspace.openTextDocument(uri));
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("guardbee.scanWorkspace", async () => {
      if (!getWorkspaceRoot()) {
        vscode.window.showWarningMessage("GuardBee: open a folder to scan the workspace.");
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "GuardBee: scanning workspace",
          cancellable: true,
        },
        async (progress, token) => {
          try {
            const findings = await scanWorkspace(diagnostics, undefined, token, (message) => {
              progress.report({ message });
            });
            await syncUi();
            const files = new Set(findings.map((f) => f.file).filter(Boolean));
            vscode.window.showInformationMessage(
              `GuardBee: workspace scan complete — ${findings.length} finding(s) in ${files.size} file(s).`
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
    vscode.commands.registerCommand("guardbee.scanAgentSurface", async () => {
      if (!getWorkspaceRoot()) {
        vscode.window.showWarningMessage("GuardBee: open a folder to scan Cursor and MCP files.");
        return;
      }
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "GuardBee: scanning Cursor and MCP files",
          cancellable: true,
        },
        async (progress, token) => {
          try {
            const findings = await scanAgentSurface(diagnostics, token, (message) => progress.report({ message }));
            await syncUi();
            const files = new Set(findings.map((f) => f.file).filter(Boolean));
            vscode.window.showInformationMessage(
              `GuardBee: Cursor/MCP scan complete — ${findings.length} finding(s) in ${files.size} file(s).`
            );
            vscode.commands.executeCommand("guardbeeAgentSurface.focus").then(undefined, () => undefined);
          } catch (err) {
            if (!token.isCancellationRequested) {
              vscode.window.showErrorMessage(`GuardBee Cursor/MCP scan failed: ${(err as Error).message}`);
            }
          }
        }
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("guardbee.connect", async () => {
      try {
        const workspace = await connectAccount(context);
        if (!workspace) return;
        await syncUi();
        await loadRecentScans().catch(() => undefined);
        vscode.commands.executeCommand("guardbeeRemoteScans.focus").then(undefined, () => undefined);
      } catch (err) {
        handleRemoteError(err);
      }
    }),
    vscode.commands.registerCommand("guardbee.disconnect", async () => {
      await disconnectAccount(context);
      remoteScansProvider.setScans([]);
      await syncUi();
    }),
    vscode.commands.registerCommand("guardbee.openDashboard", () => {
      const workspace = getStoredWorkspace(context);
      const url = workspace ? `${getDashboardOrigin()}/scans` : getDashboardOrigin();
      void openDashboardUrl(url);
    }),
    vscode.commands.registerCommand("guardbee.openRemoteScan", async (scanId?: string) => {
      if (!scanId) return;
      await openDashboardUrl(dashboardScanUrl(scanId, getDashboardOrigin()));
    }),
    vscode.commands.registerCommand("guardbee.openRemoteFinding", async (finding?: RemoteFinding) => {
      if (!finding?.scanId) return;
      await openDashboardUrl(dashboardFindingUrl(finding.scanId, finding.id, getDashboardOrigin()));
    }),
    vscode.commands.registerCommand("guardbee.pushLocalFindings", async () => {
      const findings = Array.from(diagnostics.getAllFindings().values()).flat();
      if (findings.length === 0) {
        vscode.window.showWarningMessage("GuardBee: no local findings to send.");
        return;
      }
      if (!(await getApiKey(context))) {
        vscode.window
          .showErrorMessage("GuardBee: connect an account to send findings to the dashboard.", "Connect Account")
          .then((choice) => {
            if (choice === "Connect Account") vscode.commands.executeCommand("guardbee.connect");
          });
        return;
      }
      try {
        const result = await pushLocalFindings(context, findings, getWorkspaceRoot());
        if (result.mode === "uploaded") {
          const choice = await vscode.window.showInformationMessage(
            `GuardBee: sent ${result.findingCount} finding(s) to the dashboard.`,
            "Open Dashboard"
          );
          if (choice === "Open Dashboard") await openDashboardUrl(result.dashboardUrl);
        } else {
          const choice = await vscode.window.showInformationMessage(
            `GuardBee: dashboard ingest is not enabled yet. Copied ${result.findingCount} redacted finding(s).`,
            "Open Dashboard"
          );
          if (choice === "Open Dashboard") await openDashboardUrl(result.dashboardUrl);
        }
      } catch (err) {
        handleRemoteError(err);
      }
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
        if (editor) await scanAndSync(editor.document);
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
        [
          ...brands.map((b) => ({
            label: b.name ?? b.domain ?? b.url ?? b.id,
            description: b.url ?? b.domain,
            id: b.id,
          })),
          { label: ENTER_URL, id: undefined },
        ],
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
              const choice = await vscode.window.showInformationMessage(
                `GuardBee: remote scan complete — ${findings.length} finding(s).`,
                "Open in Dashboard"
              );
              if (choice === "Open in Dashboard") await openDashboardUrl(dashboardScanUrl(finalScan.id, getDashboardOrigin()));
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
      try {
        await loadRecentScans();
        vscode.commands.executeCommand("guardbeeRemoteScans.focus").then(undefined, () => undefined);
      } catch (err) {
        handleRemoteError(err);
      }
    })
  );

  registerConnectUriHandler(context, async () => {
    await syncUi();
    await loadRecentScans().catch(() => undefined);
  });

  void (async () => {
    if (await getApiKey(context)) {
      try {
        await setStoredWorkspace(context, await fetchWorkspace(context));
      } catch {
        // Keep the stored key; status bar still shows connected.
      }
    }
    await syncUi();
  })();
  if (vscode.workspace.getConfiguration("guardbee").get<boolean>("scanAgentSurfaceOnStartup", true)) {
    void scanAgentSurface(diagnostics)
      .then(() => syncUi())
      .catch(() => undefined);
  }
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
