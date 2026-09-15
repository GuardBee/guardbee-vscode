export type Severity = "critical" | "high" | "medium" | "low";

export type ScannerId =
  | "secret-scanner"
  | "ai-code-scanner"
  | "mcp-server-auditor"
  | "prompt-injection-scanner";

export const ALL_SCANNER_IDS: ScannerId[] = [
  "secret-scanner",
  "ai-code-scanner",
  "mcp-server-auditor",
  "prompt-injection-scanner",
];

/**
 * Unified shape across all 4 @guardbee/mcp-* scanner packages' Finding types.
 * secret-scanner has no category/recommendation and redacts match/context;
 * the other 3 have category/recommendation and leave match unredacted.
 */
export interface NormalizedFinding {
  scanner: ScannerId;
  patternId: string;
  patternName: string;
  severity: Severity;
  file?: string;
  line: number;
  column: number;
  match: string;
  context: string;
  category?: string;
  recommendation?: string;
}

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function meetsThreshold(severity: Severity, threshold: Severity): boolean {
  return SEVERITY_ORDER[severity] <= SEVERITY_ORDER[threshold];
}
