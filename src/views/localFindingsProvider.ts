import * as vscode from "vscode";
import * as path from "path";
import { DiagnosticsManager } from "../diagnostics/manager";
import { NormalizedFinding } from "../scanners/types";

type Node = FileNode | FindingNode;

class FileNode {
  constructor(readonly filePath: string, readonly findings: NormalizedFinding[]) {}
}

class FindingNode {
  constructor(readonly finding: NormalizedFinding) {}
}

export class LocalFindingsProvider implements vscode.TreeDataProvider<Node> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly diagnostics: DiagnosticsManager) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: Node): vscode.TreeItem {
    if (element instanceof FileNode) {
      const item = new vscode.TreeItem(
        path.basename(element.filePath),
        vscode.TreeItemCollapsibleState.Collapsed
      );
      item.description = `${element.findings.length} finding(s)`;
      item.resourceUri = vscode.Uri.file(element.filePath);
      item.iconPath = vscode.ThemeIcon.File;
      return item;
    }

    const f = element.finding;
    const item = new vscode.TreeItem(f.patternName, vscode.TreeItemCollapsibleState.None);
    item.description = `${f.scanner} · ${f.severity} · line ${f.line}`;
    item.iconPath = new vscode.ThemeIcon(severityIcon(f.severity));
    item.command = {
      command: "vscode.open",
      title: "Open",
      arguments: [
        vscode.Uri.file(f.file ?? ""),
        { selection: new vscode.Range(f.line - 1, Math.max(0, f.column - 1), f.line - 1, f.column - 1) },
      ],
    };
    return item;
  }

  getChildren(element?: Node): Node[] {
    if (!element) {
      return Array.from(this.diagnostics.getAllFindings().entries()).map(
        ([filePath, findings]) => new FileNode(filePath, findings)
      );
    }
    if (element instanceof FileNode) {
      return element.findings.map((f) => new FindingNode(f));
    }
    return [];
  }
}

function severityIcon(severity: NormalizedFinding["severity"]): string {
  switch (severity) {
    case "critical":
    case "high":
      return "error";
    case "medium":
      return "warning";
    default:
      return "info";
  }
}
