import { isAbsolute, join, normalize } from "path";
import { ALL_SCANNER_IDS, ID, ScannerId } from "./types";

const ALIASES: Array<{ ids: ScannerId[]; keys: string[] }> = [
  { ids: [ID.secret], keys: ["secret", "secrets", "credential", "credentials"] },
  { ids: [ID.aiCode], keys: ["ai", "ai-code", "llm"] },
  { ids: [ID.mcp], keys: ["mcp", "auditor"] },
  { ids: [ID.prompt], keys: ["prompt"] },
];

export function parseScannerFilter(input: string[] | string | undefined, fallback: ScannerId[]): ScannerId[] {
  if (input === undefined || input === "") return fallback;
  const tokens = (Array.isArray(input) ? input : input.split(/[,\s]+/))
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return fallback;

  const selected = new Set<ScannerId>();
  for (const token of tokens) {
    const exact = ALL_SCANNER_IDS.find((id) => id === token);
    if (exact) {
      selected.add(exact);
      continue;
    }
    const alias = ALIASES.find((entry) => entry.keys.includes(token));
    if (alias) {
      for (const id of alias.ids) selected.add(id);
      continue;
    }
    throw new Error(
      `Unknown analyzer "${token}". Use: credential, ai-code, mcp, prompt — or omit to run the enabled set.`
    );
  }
  return Array.from(selected);
}

export function resolveWorkspacePath(input: string | undefined, workspaceRoot?: string, activePath?: string): string | undefined {
  if (!input || !input.trim()) return activePath;
  const trimmed = input.trim();
  if (isAbsolute(trimmed)) return normalize(trimmed);
  if (workspaceRoot) return normalize(join(workspaceRoot, trimmed));
  return normalize(trimmed);
}
