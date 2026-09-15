import * as vscode from "vscode";
import { RemoteFinding, RemoteScan } from "../remote/types";

type Node = ScanNode | FindingNode;

class ScanNode {
  constructor(readonly scan: RemoteScan, readonly findings: RemoteFinding[]) {}
}

class FindingNode {
  constructor(readonly finding: RemoteFinding) {}
}

export class RemoteScansProvider implements vscode.TreeDataProvider<Node> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private scans: { scan: RemoteScan; findings: RemoteFinding[] }[] = [];

  setScans(scans: { scan: RemoteScan; findings: RemoteFinding[] }[]): void {
    this.scans = scans;
    this._onDidChangeTreeData.fire();
  }

  upsertScan(scan: RemoteScan, findings: RemoteFinding[] = []): void {
    const idx = this.scans.findIndex((s) => s.scan.id === scan.id);
    if (idx >= 0) this.scans[idx] = { scan, findings };
    else this.scans.unshift({ scan, findings });
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: Node): vscode.TreeItem {
    if (element instanceof ScanNode) {
      const item = new vscode.TreeItem(element.scan.url, vscode.TreeItemCollapsibleState.Collapsed);
      item.description = `${element.scan.status}${element.scan.score !== undefined ? ` · score ${element.scan.score}` : ""}`;
      item.iconPath = new vscode.ThemeIcon(statusIcon(element.scan.status));
      return item;
    }

    const f = element.finding;
    const item = new vscode.TreeItem(f.title, vscode.TreeItemCollapsibleState.None);
    item.description = f.severity;
    item.iconPath = new vscode.ThemeIcon(severityIcon(f.severity));
    item.tooltip = f.description;
    if (f.documentationUrl) {
      item.command = {
        command: "vscode.open",
        title: "Open Documentation",
        arguments: [vscode.Uri.parse(f.documentationUrl)],
      };
    }
    return item;
  }

  getChildren(element?: Node): Node[] {
    if (!element) {
      return this.scans.map(({ scan, findings }) => new ScanNode(scan, findings));
    }
    if (element instanceof ScanNode) {
      return element.findings.map((f) => new FindingNode(f));
    }
    return [];
  }
}

function statusIcon(status: RemoteScan["status"]): string {
  switch (status) {
    case "COMPLETED":
      return "check";
    case "FAILED":
    case "CANCELLED":
      return "error";
    case "RUNNING":
      return "sync";
    default:
      return "clock";
  }
}

function severityIcon(severity: RemoteFinding["severity"]): string {
  switch (severity) {
    case "CRITICAL":
    case "HIGH":
      return "error";
    case "MEDIUM":
      return "warning";
    case "PASSED":
      return "check";
    default:
      return "info";
  }
}
