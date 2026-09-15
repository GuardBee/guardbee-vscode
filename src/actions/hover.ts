import * as vscode from "vscode";
import { DiagnosticsManager } from "../diagnostics/manager";

export function registerFindingHover(diagnostics: DiagnosticsManager): vscode.Disposable {
  return vscode.languages.registerHoverProvider({ scheme: "file" }, {
    provideHover(document, position) {
      const hits = diagnostics.getForDocument(document.uri).filter((finding) => {
        const line = Math.max(0, finding.line - 1);
        const column = Math.max(0, finding.column - 1);
        const range = new vscode.Range(line, column, line, column + Math.max(finding.match.length, 1));
        return range.contains(position);
      });
      if (hits.length === 0) return undefined;

      const markdown = new vscode.MarkdownString();
      markdown.supportThemeIcons = true;
      for (const [index, finding] of hits.entries()) {
        if (index > 0) markdown.appendMarkdown("\n\n---\n\n");
        markdown.appendMarkdown(`**${finding.patternName}** · ${finding.severity}\n\n`);
        if (finding.recommendation) {
          markdown.appendMarkdown(`${finding.recommendation}\n\n`);
        }
        markdown.appendMarkdown(`Scanner: \`${finding.scanner}\`  \nPattern: \`${finding.patternId}\``);
      }
      return new vscode.Hover(markdown);
    },
  });
}
