import { dirname, isAbsolute, join, normalize } from "path";
import { ID, ScannerId } from "./types";

export type AgentSurfaceKind = "mcp-config" | "rules" | "skill" | "hooks";

export const AGENT_SURFACE_GLOBS = [
  "**/.cursor/mcp.json",
  "**/.cursor/mcp.jsonc",
  "**/.vscode/mcp.json",
  "**/mcp.json",
  "**/mcp.jsonc",
  "**/.cursorrules",
  "**/.cursor/rules/**",
  "**/.cursor/skills/**",
  "**/.cursor/hooks.json",
  "**/.cursor/hooks/**",
  "**/.agents/skills/**",
];

export function posixPath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

export function classifyAgentSurfacePath(filePath: string): AgentSurfaceKind | undefined {
  const n = posixPath(filePath);
  const base = n.split("/").pop() ?? "";

  if (base === "mcp.json" || base === "mcp.jsonc") return "mcp-config";
  if (base === ".cursorrules") return "rules";
  if (n.includes("/.cursor/rules/")) return "rules";
  if (n.includes("/.cursor/skills/") || n.includes("/.agents/skills/")) return "skill";
  if (base === "SKILL.md" && (n.includes("/.cursor/") || n.includes("/.agents/"))) return "skill";
  if (base === "hooks.json" && n.includes("/.cursor/")) return "hooks";
  if (n.includes("/.cursor/hooks/")) return "hooks";
  return undefined;
}

export function scannersForAgentSurface(kind: AgentSurfaceKind): ScannerId[] {
  switch (kind) {
    case "mcp-config":
      return [ID.secret, ID.mcp, ID.prompt];
    case "hooks":
      return [ID.secret, ID.mcp, ID.prompt];
    case "rules":
    case "skill":
      return [ID.secret, ID.prompt];
  }
}

export function agentSurfaceKindLabel(kind: AgentSurfaceKind): string {
  switch (kind) {
    case "mcp-config":
      return "MCP config";
    case "rules":
      return "Rules";
    case "skill":
      return "Skills";
    case "hooks":
      return "Hooks";
  }
}

/** Relative ./ and ../ targets from an MCP config — local server entrypoints, not npx packages. */
export function extractLocalMcpTargets(jsonText: string, configDir: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const record = parsed as Record<string, unknown>;
  const servers = record.mcpServers ?? record.servers;
  if (!servers || typeof servers !== "object") return [];

  const out: string[] = [];
  for (const server of Object.values(servers as Record<string, unknown>)) {
    if (!server || typeof server !== "object") continue;
    const entry = server as Record<string, unknown>;
    const candidates = [entry.command, ...(Array.isArray(entry.args) ? entry.args : [])];
    for (const candidate of candidates) {
      if (typeof candidate !== "string") continue;
      if (!candidate.startsWith("./") && !candidate.startsWith("../")) continue;
      const resolved = normalize(isAbsolute(candidate) ? candidate : join(configDir, candidate));
      out.push(resolved);
    }
  }
  return Array.from(new Set(out));
}

export function dirnameOf(filePath: string): string {
  return dirname(filePath);
}
