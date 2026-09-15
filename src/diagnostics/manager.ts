import * as vscode from "vscode";
import { NormalizedFinding, Severity } from "../scanners/types";

const SEVERITY_TO_VSCODE: Record<Severity, vscode.DiagnosticSeverity> = {
  critical: vscode.DiagnosticSeverity.Error,
  high: vscode.DiagnosticSeverity.Error,
  medium: vscode.DiagnosticSeverity.Warning,
  low: vscode.DiagnosticSeverity.Information,
};

export class DiagnosticsManager {
  readonly collection: vscode.DiagnosticCollection;
  private readonly byFile = new Map<string, NormalizedFinding[]>();

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection("guardbee");
  }

  setForDocument(uri: vscode.Uri, findings: NormalizedFinding[]): void {
    this.byFile.set(uri.fsPath, findings);
    this.collection.set(uri, findings.map(toDiagnostic));
  }

  clearForDocument(uri: vscode.Uri): void {
    this.byFile.delete(uri.fsPath);
    this.collection.delete(uri);
  }

  getAllFindings(): Map<string, NormalizedFinding[]> {
    return this.byFile;
  }

  clearAll(): void {
    this.byFile.clear();
    this.collection.clear();
  }

  dispose(): void {
    this.collection.dispose();
  }
}

function toDiagnostic(finding: NormalizedFinding): vscode.Diagnostic {
  const line = Math.max(0, finding.line - 1);
  const column = Math.max(0, finding.column - 1);
  const range = new vscode.Range(line, column, line, column + Math.max(finding.match.length, 1));

  const messageParts = [finding.patternName];
  if (finding.recommendation) messageParts.push(finding.recommendation);
  messageParts.push(`(${finding.context})`);

  const diagnostic = new vscode.Diagnostic(
    range,
    messageParts.join(" — "),
    SEVERITY_TO_VSCODE[finding.severity]
  );
  diagnostic.code = finding.patternId;
  diagnostic.source = `GuardBee (${finding.scanner})`;
  return diagnostic;
}
