import { agentResultToMarkdown, toAgentScanResult } from "../lm/format";
import { NormalizedFinding } from "../scanners/types";

export function localFindingsPushBody(
  findings: NormalizedFinding[],
  workspaceRoot?: string,
  extensionVersion?: string
): Record<string, unknown> {
  const result = toAgentScanResult(findings, workspaceRoot);
  return {
    source: "vscode",
    extensionVersion,
    findingCount: result.findingCount,
    fileCount: result.fileCount,
    bySeverity: result.bySeverity,
    findings: result.findings,
  };
}

export function localFindingsPushMarkdown(findings: NormalizedFinding[], workspaceRoot?: string): string {
  return agentResultToMarkdown(toAgentScanResult(findings, workspaceRoot));
}
