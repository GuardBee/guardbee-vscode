import { NormalizedFinding, Severity, SEVERITY_ORDER } from "../scanners/types";

export const MAX_AGENT_FINDINGS = 40;

export interface AgentFinding {
  file?: string;
  line: number;
  scanner: string;
  patternId: string;
  patternName: string;
  severity: Severity;
  recommendation?: string;
}

export interface AgentScanResult {
  ok: boolean;
  findingCount: number;
  fileCount: number;
  bySeverity: Record<Severity, number>;
  blockingCount: number;
  canProceed: boolean;
  truncated: boolean;
  findings: AgentFinding[];
  guidance: string;
}

export function toDisplayPath(filePath: string | undefined, workspaceRoot?: string): string | undefined {
  if (!filePath) return undefined;
  if (!workspaceRoot) return filePath;
  const normalizedRoot = workspaceRoot.replace(/[\\/]+$/, "");
  if (filePath.startsWith(normalizedRoot)) {
    return filePath.slice(normalizedRoot.length).replace(/^[\\/]/, "");
  }
  return filePath;
}

export function toAgentScanResult(findings: NormalizedFinding[], workspaceRoot?: string): AgentScanResult {
  const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  const files = new Set<string>();
  for (const finding of findings) {
    bySeverity[finding.severity] += 1;
    if (finding.file) files.add(finding.file);
  }

  const blockingCount = bySeverity.critical + bySeverity.high;
  const truncated = findings.length > MAX_AGENT_FINDINGS;
  const sliced = findings
    .slice()
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .slice(0, MAX_AGENT_FINDINGS);

  const canProceed = blockingCount === 0;
  let guidance: string;
  if (findings.length === 0) {
    guidance = "No GuardBee findings. Safe to continue.";
  } else if (!canProceed) {
    guidance =
      "Blocking findings are present. Do not save or ship this code until they are fixed, ignored with a disable comment, or allowlisted.";
  } else {
    guidance = "No blocking findings. Review the remaining items before shipping.";
  }

  return {
    ok: true,
    findingCount: findings.length,
    fileCount: files.size,
    bySeverity,
    blockingCount,
    canProceed,
    truncated,
    findings: sliced.map((finding) => ({
      file: toDisplayPath(finding.file, workspaceRoot),
      line: finding.line,
      scanner: finding.scanner,
      patternId: finding.patternId,
      patternName: finding.patternName,
      severity: finding.severity,
      recommendation: finding.recommendation,
    })),
    guidance,
  };
}

export function agentResultToMarkdown(result: AgentScanResult): string {
  const lines = [
    `GuardBee: ${result.findingCount} finding(s) in ${result.fileCount} file(s).`,
    `critical ${result.bySeverity.critical} · high ${result.bySeverity.high} · medium ${result.bySeverity.medium} · low ${result.bySeverity.low}`,
    result.guidance,
  ];
  if (result.findings.length === 0) return lines.join("\n");

  lines.push("", "Findings:");
  for (const finding of result.findings) {
    const loc = finding.file ? `${finding.file}:${finding.line}` : `line ${finding.line}`;
    const rec = finding.recommendation ? ` — ${finding.recommendation}` : "";
    lines.push(`- [${finding.severity}] ${loc} · ${finding.patternName} (${finding.scanner})${rec}`);
  }
  if (result.truncated) {
    lines.push("", `Showing the first ${MAX_AGENT_FINDINGS} findings.`);
  }
  return lines.join("\n");
}
