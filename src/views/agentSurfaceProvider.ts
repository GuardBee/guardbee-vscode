import * as vscode from "vscode";
import * as path from "path";
import { DiagnosticsManager } from "../diagnostics/manager";
import { agentSurfaceKindLabel, AgentSurfaceKind, classifyAgentSurfacePath } from "../scanners/agentSurface";
import { NormalizedFinding } from "../scanners/types";

type Node = KindNode | FileNode | FindingNode;

class KindNode {
  constructor(readonly kind: AgentSurfaceKind, readonly files: FileNode[]) {}
}

class FileNode {
  constructor(readonly filePath: string, readonly findings: NormalizedFinding[]) {}
}

class FindingNode {
  constructor(readonly finding: NormalizedFinding) {}
}

export class AgentSurfaceProvider implements vscode.TreeDataProvider<Node> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly diagnostics: DiagnosticsManager) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: Node): vscode.TreeItem {
    if (element instanceof KindNode) {
      const count = element.files.reduce((sum, file) => sum + file.findings.length, 0);
      const item = new vscode.TreeItem(agentSurfaceKindLabel(element.kind), vscode.TreeItemCollapsibleState.Expanded);
      item.description = `${count} finding(s)`;
      item.iconPath = new vscode.ThemeIcon("folder");
      return item;
    }
    if (element instanceof FileNode) {
      const item = new vscode.TreeItem(path.basename(element.filePath), vscode.TreeItemCollapsibleState.Collapsed);
      item.description = `${element.findings.length} · ${workspaceRelative(element.filePath)}`;
      item.resourceUri = vscode.Uri.file(element.filePath);
      item.iconPath = vscode.ThemeIcon.File;
      return item;
    }
    const f = element.finding;
    const item = new vscode.TreeItem(f.patternName, vscode.TreeItemCollapsibleState.None);
    item.description = `${f.scanner} · ${f.severity} · line ${f.line}`;
    item.iconPath = new vscode.ThemeIcon(severityIcon(f.severity));
    item.tooltip = [f.patternName, f.recommendation, `${f.scanner} · ${f.patternId}`].filter(Boolean).join("\n");
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
      const grouped = new Map<AgentSurfaceKind, FileNode[]>();
      for (const [filePath, findings] of this.diagnostics.getAllFindings()) {
        const kind = classifyAgentSurfacePath(filePath);
        if (!kind || findings.length === 0) continue;
        const list = grouped.get(kind) ?? [];
        list.push(new FileNode(filePath, findings));
        grouped.set(kind, list);
      }
      return Array.from(grouped.entries()).map(([kind, files]) => new KindNode(kind, files));
    }
    if (element instanceof KindNode) return element.files;
    if (element instanceof FileNode) return element.findings.map((f) => new FindingNode(f));
    return [];
  }
}

function workspaceRelative(filePath: string): string {
  const folders = vscode.workspace.workspaceFolders ?? [];
  for (const folder of folders) {
    const root = folder.uri.fsPath;
    if (filePath.startsWith(root)) return filePath.slice(root.length).replace(/^[\\/]/, "");
  }
  return filePath;
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
