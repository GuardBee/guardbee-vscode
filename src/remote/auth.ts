import * as vscode from "vscode";

const SECRET_KEY = "guardbee.credential";

export async function setApiKey(context: vscode.ExtensionContext): Promise<void> {
  const key = await vscode.window.showInputBox({
    title: "GuardBee credential",
    prompt: "Paste your GuardBee dashboard credential from the Developers page",
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim().length === 0 ? "Credential cannot be empty" : undefined),
  });
  if (!key) return;
  await context.secrets.store(SECRET_KEY, key.trim());
  vscode.window.showInformationMessage("GuardBee account connected.");
}

export async function clearApiKey(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(SECRET_KEY);
  vscode.window.showInformationMessage("GuardBee account disconnected.");
}

export async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  return context.secrets.get(SECRET_KEY);
}
