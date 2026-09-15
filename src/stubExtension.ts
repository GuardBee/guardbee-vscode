import * as vscode from "vscode";

const COMMANDS = [
  "guardbee.scanCurrentFile",
  "guardbee.scanWorkspace",
  "guardbee.connect",
  "guardbee.disconnect",
  "guardbee.triggerRemoteScan",
  "guardbee.showRecentScans",
  "guardbee.openDashboard",
] as const;

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
    vscode.window.registerTreeDataProvider("guardbeeRemoteScans", new EmptyTree())
  );

  for (const command of COMMANDS) {
    context.subscriptions.push(
      vscode.commands.registerCommand(command, () => {
        vscode.window.showInformationMessage("GuardBee is ready. Local and dashboard analysis will run in this window.");
      })
    );
  }
}

export function deactivate(): void {}
