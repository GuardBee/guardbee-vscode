import * as vscode from "vscode";

const SECRET_KEY = "guardbee.apiKey";

export async function setApiKey(context: vscode.ExtensionContext): Promise<void> {
  const key = await vscode.window.showInputBox({
    title: "GuardBee API Key",
    prompt: "Paste your gb_live_... API key (Developers page on app.guardbee.ai)",
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim().length === 0 ? "API key cannot be empty" : undefined),
  });
  if (!key) return;
  await context.secrets.store(SECRET_KEY, key.trim());
  vscode.window.showInformationMessage("GuardBee API key saved.");
}

export async function clearApiKey(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(SECRET_KEY);
  vscode.window.showInformationMessage("GuardBee API key cleared.");
}

export async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  return context.secrets.get(SECRET_KEY);
}
