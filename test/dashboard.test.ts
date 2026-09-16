import * as assert from "assert";
import { dashboardFindingUrl, dashboardScanUrl, parseConnectToken } from "../src/remote/dashboard";
import { localFindingsPushBody } from "../src/remote/pushPayload";
import { ID } from "../src/scanners/types";

suite("dashboard loop", () => {
  test("builds scan and finding dashboard URLs", () => {
    const origin = "https://app.guardbee.ai";
    assert.strictEqual(dashboardScanUrl("scan_1", origin), "https://app.guardbee.ai/scans/scan_1");
    assert.strictEqual(
      dashboardFindingUrl("scan_1", "find_2", origin),
      "https://app.guardbee.ai/scans/scan_1?finding=find_2"
    );
  });

  test("parses vscode:// connect tokens", () => {
    assert.strictEqual(
      parseConnectToken({ path: "/connect", query: "token=gb_live_abc" }),
      "gb_live_abc"
    );
    assert.strictEqual(parseConnectToken({ path: "/connect", query: "" }), undefined);
    assert.strictEqual(parseConnectToken({ path: "/other", query: "token=x" }), undefined);
  });

  test("push payload omits match values", () => {
    const body = localFindingsPushBody(
      [
        {
          scanner: ID.secret,
          patternId: "demo",
          patternName: "Demo",
          severity: "high",
          file: "/repo/src/app.ts",
          line: 4,
          column: 1,
          match: "SHOULD-NOT-LEAK",
          context: "also-secret",
          recommendation: "Move it server-side.",
        },
      ],
      "/repo"
    );
    const json = JSON.stringify(body);
    assert.ok(!json.includes("SHOULD-NOT-LEAK"));
    assert.ok(!json.includes("also-secret"));
    assert.strictEqual((body.findings as { file?: string }[])[0].file, "src/app.ts");
  });
});
