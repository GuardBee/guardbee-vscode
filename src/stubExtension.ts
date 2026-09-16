import * as vscode from "vscode";

const COMMANDS = [
  "guardbee.scanCurrentFile",
  "guardbee.scanWorkspace",
  "guardbee.scanAgentSurface",
  "guardbee.connect",
  "guardbee.disconnect",
  "guardbee.triggerRemoteScan",
  "guardbee.showRecentScans",
  "guardbee.openDashboard",
  "guardbee.pushLocalFindings",
  "guardbee.openRemoteScan",
  "guardbee.openRemoteFinding",
] as const;

const TOOLS = ["guardbee_scan_file", "guardbee_scan_workspace", "guardbee_check_code", "guardbee_scan_agent_surface"] as const;

class EmptyTree implements vscode.TreeDataProvider<vscode.TreeItem> {
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }
  getChildren(): vscode.TreeItem[] {
    return [];
  }
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("guardbeeLocalFindings", new EmptyTree()),
    vscode.window.registerTreeDataProvider("guardbeeAgentSurface", new EmptyTree()),
    vscode.window.registerTreeDataProvider("guardbeeRemoteScans", new EmptyTree())
  );

  for (const command of COMMANDS) {
    context.subscriptions.push(
      vscode.commands.registerCommand(command, () => {
        vscode.window.showInformationMessage("GuardBee is ready. Local and dashboard analysis will run in this window.");
      })
    );
  }

  if (typeof vscode.lm?.registerTool === "function") {
    for (const name of TOOLS) {
      context.subscriptions.push(
        vscode.lm.registerTool(name, {
          invoke: async () =>
            new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart("GuardBee local analysis is not included in this build."),
            ]),
        })
      );
    }
  }

  if (typeof vscode.chat?.createChatParticipant === "function") {
    context.subscriptions.push(
      vscode.chat.createChatParticipant("guardbee.chat", async (_request, _ctx, stream) => {
        stream.markdown("GuardBee local analysis is not included in this build.");
      })
    );
  }
}

export function deactivate(): void {}
