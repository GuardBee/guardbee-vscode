import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import { minimatch } from "minimatch";
import { NormalizedFinding, ScannerId, Severity, meetsThreshold } from "./types";

interface PerScannerConfig {
  failOn?: Severity | "none" | "any";
  exclude?: string[];
  allowlist?: string[];
}

export interface GuardbeeConfig {
  [scanner: string]: PerScannerConfig | undefined;
}

const CONFIG_FILENAMES = ["guardbee.yml", "guardbee.yaml", ".guardbee.yml"];

export function loadGuardbeeConfig(workspaceRoot: string | undefined): GuardbeeConfig {
  if (!workspaceRoot) return {};
  for (const name of CONFIG_FILENAMES) {
    const path = join(workspaceRoot, name);
    if (existsSync(path)) {
      try {
        const parsed = parseYaml(readFileSync(path, "utf8"));
        return parsed && typeof parsed === "object" ? (parsed as GuardbeeConfig) : {};
      } catch {
        return {};
      }
    }
  }
  return {};
}

export function isExcluded(relPath: string, scanner: ScannerId, config: GuardbeeConfig): boolean {
  const patterns = config[scanner]?.exclude ?? [];
  return patterns.some((pattern) => minimatch(relPath, pattern, { dot: true }) || relPath.includes(pattern));
}

export function filterFindings(
  findings: NormalizedFinding[],
  threshold: Severity,
  config: GuardbeeConfig
): NormalizedFinding[] {
  return findings.filter((f) => {
    if (!meetsThreshold(f.severity, threshold)) return false;
    const allowlist = config[f.scanner]?.allowlist ?? [];
    if (allowlist.length > 0 && allowlist.some((a) => f.match.includes(a))) return false;
    return true;
  });
}
