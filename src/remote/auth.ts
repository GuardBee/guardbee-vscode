import * as vscode from "vscode";
import { RemoteWorkspace } from "./types";

const SECRET_KEY = "guardbee.credential";
const WORKSPACE_STATE = "guardbee.workspace";

export async function setApiKey(context: vscode.ExtensionContext, key: string): Promise<void> {
  await context.secrets.store(SECRET_KEY, key.trim());
}

export async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  return context.secrets.get(SECRET_KEY);
}

export function getStoredWorkspace(context: vscode.ExtensionContext): RemoteWorkspace | undefined {
  return context.globalState.get<RemoteWorkspace>(WORKSPACE_STATE);
}

export async function setStoredWorkspace(
  context: vscode.ExtensionContext,
  workspace: RemoteWorkspace | undefined
): Promise<void> {
  await context.globalState.update(WORKSPACE_STATE, workspace);
}

export async function disconnectAccount(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(SECRET_KEY);
  await context.globalState.update(WORKSPACE_STATE, undefined);
  vscode.window.showInformationMessage("GuardBee account disconnected.");
}
