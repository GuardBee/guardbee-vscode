import * as vscode from "vscode";
import { DiagnosticsManager } from "../diagnostics/manager";
import { NormalizedFinding } from "../scanners/types";
import { disableNextLineComment } from "../scanners/suppress";

export class GuardBeeCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  constructor(private readonly diagnostics: DiagnosticsManager) {}

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    for (const diagnostic of context.diagnostics) {
      if (!diagnostic.source?.startsWith("GuardBee")) continue;
      const finding = this.diagnostics.getFinding(diagnostic);
      if (!finding) continue;

      const ignore = makeIgnoreAction(document, diagnostic, finding);
      if (ignore) actions.push(ignore);

      const allowlist = makeAllowlistAction(diagnostic, finding);
      actions.push(allowlist);
    }
    return actions;
  }
}

function makeIgnoreAction(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
  finding: NormalizedFinding
): vscode.CodeAction | undefined {
  if (!disableNextLineComment(document.languageId, finding.scanner)) return undefined;

  const action = new vscode.CodeAction("GuardBee: ignore this finding", vscode.CodeActionKind.QuickFix);
  action.diagnostics = [diagnostic];
  action.isPreferred = true;
  action.command = {
    command: "guardbee.ignoreFinding",
    title: "Ignore finding",
    arguments: [document.uri, Math.max(0, finding.line - 1), finding.scanner],
  };
  return action;
}

function makeAllowlistAction(diagnostic: vscode.Diagnostic, finding: NormalizedFinding): vscode.CodeAction {
  const action = new vscode.CodeAction(
    "GuardBee: add match to workspace allowlist",
    vscode.CodeActionKind.QuickFix
  );
  action.diagnostics = [diagnostic];
  action.command = {
    command: "guardbee.addToAllowlist",
    title: "Add to allowlist",
    arguments: [finding],
  };
  return action;
}
