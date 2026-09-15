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
  private readonly findingByDiagnostic = new WeakMap<vscode.Diagnostic, NormalizedFinding>();

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection("guardbee");
  }

  setForDocument(uri: vscode.Uri, findings: NormalizedFinding[]): void {
    this.byFile.set(uri.fsPath, findings);
    const diagnostics = findings.map((finding) => {
      const diagnostic = toDiagnostic(finding);
      this.findingByDiagnostic.set(diagnostic, finding);
      return diagnostic;
    });
    this.collection.set(uri, diagnostics);
  }

  clearForDocument(uri: vscode.Uri): void {
    this.byFile.delete(uri.fsPath);
    this.collection.delete(uri);
  }

  getForDocument(uri: vscode.Uri): NormalizedFinding[] {
    return this.byFile.get(uri.fsPath) ?? [];
  }

  getFinding(diagnostic: vscode.Diagnostic): NormalizedFinding | undefined {
    return this.findingByDiagnostic.get(diagnostic);
  }

  getAllFindings(): Map<string, NormalizedFinding[]> {
    return this.byFile;
  }

  count(): number {
    let total = 0;
    for (const findings of this.byFile.values()) total += findings.length;
    return total;
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
