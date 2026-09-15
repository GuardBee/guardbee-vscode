import * as assert from "assert";
import { parseScannerFilter, resolveWorkspacePath } from "../src/scanners/resolve";
import { ALL_SCANNER_IDS, ID } from "../src/scanners/types";

suite("scanner filter and paths", () => {
  test("maps aliases without requiring package-id strings from the model", () => {
    assert.deepStrictEqual(parseScannerFilter("credential", ALL_SCANNER_IDS), [ID.secret]);
    assert.deepStrictEqual(parseScannerFilter(["ai-code", "mcp"], ALL_SCANNER_IDS), [ID.aiCode, ID.mcp]);
    assert.deepStrictEqual(parseScannerFilter(undefined, ALL_SCANNER_IDS), ALL_SCANNER_IDS);
  });

  test("rejects unknown analyzer names", () => {
    assert.throws(() => parseScannerFilter("nope", ALL_SCANNER_IDS), /Unknown analyzer/);
  });

  test("resolves relative paths against the workspace root", () => {
    assert.strictEqual(resolveWorkspacePath("src/app.ts", "/repo"), "/repo/src/app.ts");
    assert.strictEqual(resolveWorkspacePath("/abs/app.ts", "/repo"), "/abs/app.ts");
    assert.strictEqual(resolveWorkspacePath(undefined, "/repo", "/repo/open.ts"), "/repo/open.ts");
  });
});
