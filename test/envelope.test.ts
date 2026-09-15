import * as assert from "assert";
import { unwrapArray, unwrapData } from "../src/remote/envelope";

suite("API envelope unwrap", () => {
  test("unwraps jsonOk({ data: T[] }) double wrap used by list endpoints", () => {
    const body = { data: { data: [{ id: "brand_1", name: "Acme", url: "https://acme.example" }] } };
    const brands = unwrapArray<{ id: string; name: string }>(body);
    assert.strictEqual(brands.length, 1);
    assert.strictEqual(brands[0].id, "brand_1");
  });

  test("unwraps jsonOk(T[]) single wrap", () => {
    const body = { data: [{ id: "scan_1" }] };
    assert.deepStrictEqual(unwrapArray<{ id: string }>(body), [{ id: "scan_1" }]);
  });

  test("unwraps jsonOk(item) for POST /scans", () => {
    const body = { data: { id: "scan_1", status: "PENDING" } };
    assert.strictEqual(unwrapData<{ id: string }>(body).id, "scan_1");
  });

  test("returns empty array when list payload is not an array", () => {
    assert.deepStrictEqual(unwrapArray({ data: { pagination: { page: 1 } } }), []);
    assert.deepStrictEqual(unwrapArray(null), []);
  });
});
