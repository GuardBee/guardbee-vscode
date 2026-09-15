import * as assert from "assert";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import * as vscode from "vscode";

const SAMPLE = 'const openai = new OpenAI({ apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY });\n';

suite("GuardBee local scan UX", () => {
  let dir: string;
  let filePath: string;

  setup(() => {
    dir = mkdtempSync(join(tmpdir(), "guardbee-e2e-"));
    filePath = join(dir, "sample.ts");
    writeFileSync(filePath, SAMPLE);
  });

  teardown(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("scan then ignore comment clears the diagnostic", async () => {
    const ext = vscode.extensions.getExtension("guardbee-ai.guardbee-vscode");
    assert.ok(ext);
    await ext!.activate();

    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);
    await vscode.commands.executeCommand("guardbee.scanCurrentFile");

    const before = vscode.languages.getDiagnostics(doc.uri).filter((d) => d.source?.startsWith("GuardBee"));
    assert.ok(before.length > 0, "expected at least one GuardBee diagnostic");

    await vscode.commands.executeCommand("guardbee.ignoreFinding", doc.uri, Math.max(0, (before[0].range.start.line)), "ai-code-scanner");

    const after = vscode.languages.getDiagnostics(doc.uri).filter((d) => d.source?.startsWith("GuardBee"));
    assert.strictEqual(after.length, 0, "ignore comment should suppress the finding");
  });
});
