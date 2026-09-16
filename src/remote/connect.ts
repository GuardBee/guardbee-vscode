import * as vscode from "vscode";
import { setApiKey, setStoredWorkspace } from "./auth";
import { getDashboardOrigin } from "./config";
import { developersKeysUrl, parseConnectToken } from "./dashboard";
import { RemoteWorkspace } from "./types";
import { fetchWorkspaceWithToken } from "./workspace";

export async function connectAccount(context: vscode.ExtensionContext): Promise<RemoteWorkspace | undefined> {
  const opened = await vscode.window.showInformationMessage(
    "Copy an API key from the GuardBee Developers page, then paste it here.",
    "Open Developers page",
    "Paste key"
  );
  if (!opened) return undefined;

  if (opened === "Open Developers page") {
    await vscode.env.openExternal(vscode.Uri.parse(developersKeysUrl(getDashboardOrigin())));
  }

  const key = await vscode.window.showInputBox({
    title: "GuardBee credential",
    prompt: "Paste the API key from the Developers page",
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim().length === 0 ? "Credential cannot be empty" : undefined),
  });
  if (!key) return undefined;
  return completeConnect(context, key);
}

export async function completeConnect(context: vscode.ExtensionContext, key: string): Promise<RemoteWorkspace> {
  const workspace = await fetchWorkspaceWithToken(key.trim());
  await setApiKey(context, key);
  await setStoredWorkspace(context, workspace);
  vscode.window.showInformationMessage(`GuardBee: connected to ${workspace.name}.`);
  return workspace;
}

export function registerConnectUriHandler(
  context: vscode.ExtensionContext,
  onConnected: () => Promise<void>
): void {
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      async handleUri(uri) {
        const token = parseConnectToken(uri);
        if (!token) {
          vscode.window.showWarningMessage("GuardBee: connect link is missing a token.");
          return;
        }
        try {
          await completeConnect(context, token);
          await onConnected();
        } catch (err) {
          vscode.window.showErrorMessage(`GuardBee: ${(err as Error).message}`);
        }
      },
    })
  );
}
