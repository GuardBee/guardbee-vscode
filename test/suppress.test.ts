import * as assert from "assert";
import { disableNextLineComment, isSuppressedAt } from "../src/scanners/suppress";
import { ID } from "../src/scanners/types";

suite("inline suppress comments", () => {
  test("honors disable-next-line on the previous line", () => {
    const lines = ["// guardbee-disable-next-line", 'const token = "example";'];
    assert.strictEqual(isSuppressedAt(lines, 2, ID.secret), true);
    assert.strictEqual(isSuppressedAt(lines, 1, ID.secret), false);
  });

  test("honors disable-line on the same line", () => {
    const lines = ['const token = "example"; // guardbee-disable-line'];
    assert.strictEqual(isSuppressedAt(lines, 1, ID.secret), true);
  });

  test("scopes suppression to a scanner id when provided", () => {
    const lines = ["// guardbee-disable-next-line secret-scanner", 'const token = "example";'];
    assert.strictEqual(isSuppressedAt(lines, 2, ID.secret), true);
    assert.strictEqual(isSuppressedAt(lines, 2, ID.aiCode), false);
  });

  test("does not emit a comment for plain JSON", () => {
    assert.strictEqual(disableNextLineComment("json", ID.secret), undefined);
    assert.ok(disableNextLineComment("typescript", ID.secret)?.startsWith("//"));
    assert.ok(disableNextLineComment("python", ID.secret)?.startsWith("#"));
  });
});
