import * as assert from "assert";
import * as vscode from "vscode";

suite("GuardBee extension", () => {
  test("activates and registers commands", async () => {
    const ext = vscode.extensions.getExtension("guardbee-ai.guardbee-vscode");
    assert.ok(ext, "extension should be discoverable");
    await ext!.activate();

    const commands = await vscode.commands.getCommands(true);
    const expected = [
      "guardbee.scanCurrentFile",
      "guardbee.scanWorkspace",
      "guardbee.setApiKey",
      "guardbee.clearApiKey",
      "guardbee.triggerRemoteScan",
      "guardbee.showRecentScans",
    ];
    for (const cmd of expected) {
      assert.ok(commands.includes(cmd), `expected command ${cmd} to be registered`);
    }
  });
});
