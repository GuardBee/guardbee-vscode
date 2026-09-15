import * as assert from "assert";
import { join } from "path";
import {
  classifyAgentSurfacePath,
  extractLocalMcpTargets,
  scannersForAgentSurface,
} from "../src/scanners/agentSurface";
import { ID } from "../src/scanners/types";

suite("agent surface", () => {
  test("classifies MCP configs, rules, skills, and hooks", () => {
    assert.strictEqual(classifyAgentSurfacePath("/repo/.cursor/mcp.json"), "mcp-config");
    assert.strictEqual(classifyAgentSurfacePath("/repo/.vscode/mcp.jsonc"), "mcp-config");
    assert.strictEqual(classifyAgentSurfacePath("/repo/.cursorrules"), "rules");
    assert.strictEqual(classifyAgentSurfacePath("/repo/.cursor/rules/team.mdc"), "rules");
    assert.strictEqual(classifyAgentSurfacePath("/repo/.cursor/skills/demo/SKILL.md"), "skill");
    assert.strictEqual(classifyAgentSurfacePath("/repo/.agents/skills/demo/SKILL.md"), "skill");
    assert.strictEqual(classifyAgentSurfacePath("/repo/.cursor/hooks.json"), "hooks");
    assert.strictEqual(classifyAgentSurfacePath("/repo/.cursor/hooks/before.sh"), "hooks");
    assert.strictEqual(classifyAgentSurfacePath("/repo/src/app.ts"), undefined);
  });

  test("uses prompt injection on rules/skills and MCP auditor on configs/hooks", () => {
    assert.deepStrictEqual(scannersForAgentSurface("mcp-config"), [ID.secret, ID.mcp, ID.prompt]);
    assert.deepStrictEqual(scannersForAgentSurface("hooks"), [ID.secret, ID.mcp, ID.prompt]);
    assert.deepStrictEqual(scannersForAgentSurface("rules"), [ID.secret, ID.prompt]);
    assert.deepStrictEqual(scannersForAgentSurface("skill"), [ID.secret, ID.prompt]);
  });

  test("extracts local ./ and ../ MCP entrypoints only", () => {
    const configDir = join("/repo", ".cursor");
    const targets = extractLocalMcpTargets(
      JSON.stringify({
        mcpServers: {
          local: { command: "node", args: ["./server.js", "--stdio"] },
          parent: { command: "../tools/mcp.js" },
          remote: { command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"] },
        },
      }),
      configDir
    );
    assert.deepStrictEqual(targets.sort(), [join("/repo", ".cursor", "server.js"), join("/repo", "tools", "mcp.js")].sort());
    assert.deepStrictEqual(extractLocalMcpTargets("{not json", configDir), []);
  });
});
