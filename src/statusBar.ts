import * as vscode from "vscode";

export class GuardBeeStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.item.command = "guardbee.focusFindings";
    this.item.show();
  }

  update(findingCount: number, connected: boolean): void {
    this.item.text = findingCount > 0 ? `$(shield) GuardBee ${findingCount}` : "$(shield) GuardBee";
    const account = connected ? "Account connected" : "Local analysis only";
    this.item.tooltip = `${findingCount} finding(s)\n${account}\nClick to open Local Findings`;
    this.item.backgroundColor =
      findingCount > 0 ? new vscode.ThemeColor("statusBarItem.warningBackground") : undefined;
  }

  dispose(): void {
    this.item.dispose();
  }
}
