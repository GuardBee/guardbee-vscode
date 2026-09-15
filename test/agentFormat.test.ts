import * as assert from "assert";
import { agentResultToMarkdown, toAgentScanResult } from "../src/lm/format";
import { ID, NormalizedFinding } from "../src/scanners/types";

function finding(partial: Partial<NormalizedFinding> & Pick<NormalizedFinding, "patternId" | "patternName" | "severity">): NormalizedFinding {
  return {
    scanner: ID.aiCode,
    line: 1,
    column: 1,
    match: "SHOULD-NOT-LEAK",
    context: "also-secret-context",
    ...partial,
  };
}

suite("agent scan payload", () => {
  test("omits match and context from the model payload", () => {
    const result = toAgentScanResult([
      finding({
        patternId: "client_bundled_ai_api_key",
        patternName: "Client bundled key",
        severity: "critical",
        file: "/repo/src/app.ts",
        recommendation: "Move the credential to the server.",
      }),
    ], "/repo");

    assert.strictEqual(result.findingCount, 1);
    assert.strictEqual(result.canProceed, false);
    assert.strictEqual(result.findings[0].file, "src/app.ts");
    assert.ok(!("match" in result.findings[0]));
    assert.ok(!JSON.stringify(result).includes("SHOULD-NOT-LEAK"));
    assert.ok(!JSON.stringify(result).includes("also-secret-context"));
  });

  test("marks only medium/low findings as safe to proceed", () => {
    const result = toAgentScanResult([
      finding({ patternId: "x", patternName: "Low", severity: "low" }),
    ]);
    assert.strictEqual(result.canProceed, true);
    assert.match(agentResultToMarkdown(result), /No blocking findings/);
  });
});
