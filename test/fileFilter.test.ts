import * as assert from "assert";
import { MAX_SCAN_CHARS, shouldScanContents, shouldScanPath } from "../src/scanners/fileFilter";

suite("file filter", () => {
  test("skips dependency and build directories", () => {
    assert.strictEqual(shouldScanPath("/repo/src/app.ts"), true);
    assert.strictEqual(shouldScanPath("/repo/node_modules/pkg/index.js"), false);
    assert.strictEqual(shouldScanPath("/repo/dist/extension.js"), false);
  });

  test("skips lockfiles, binaries, and source maps", () => {
    assert.strictEqual(shouldScanPath("/repo/package-lock.json"), false);
    assert.strictEqual(shouldScanPath("/repo/media/icon.png"), false);
    assert.strictEqual(shouldScanPath("/repo/dist/extension.js.map"), false);
  });

  test("keeps Cursor and MCP surface files", () => {
    assert.strictEqual(shouldScanPath("/repo/.cursor/mcp.json"), true);
    assert.strictEqual(shouldScanPath("/repo/.cursor/rules/team.mdc"), true);
    assert.strictEqual(shouldScanPath("/repo/.cursor/skills/demo/SKILL.md"), true);
    assert.strictEqual(shouldScanPath("/repo/.cursor/hooks.json"), true);
  });

  test("skips oversized buffers", () => {
    assert.strictEqual(shouldScanContents("/repo/src/app.ts", 12), true);
    assert.strictEqual(shouldScanContents("/repo/src/app.ts", MAX_SCAN_CHARS + 1), false);
  });
});
