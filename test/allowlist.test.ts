import * as assert from "assert";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { addAllowlistEntry, loadGuardbeeConfig } from "../src/scanners/config";
import { ID } from "../src/scanners/types";

suite("allowlist config", () => {
  let root: string;

  setup(() => {
    root = mkdtempSync(join(tmpdir(), "guardbee-"));
  });

  teardown(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("creates guardbee.yml and appends unique matches", () => {
    const path = addAllowlistEntry(root, ID.secret, "demo-value");
    addAllowlistEntry(root, ID.secret, "demo-value");
    addAllowlistEntry(root, ID.secret, "other-value");

    const config = loadGuardbeeConfig(root);
    assert.deepStrictEqual(config[ID.secret]?.allowlist, ["demo-value", "other-value"]);
    assert.ok(readFileSync(path, "utf8").includes("demo-value"));
  });
});
