import * as vscode from "vscode";

export function getBaseUrl(): string {
  return vscode.workspace.getConfiguration("guardbee").get<string>("apiBaseUrl", "https://app.guardbee.ai/api/v1");
}

export function getDashboardOrigin(): string {
  const configured = vscode.workspace.getConfiguration("guardbee").get<string>("dashboardUrl");
  if (configured && configured.trim()) return configured.replace(/\/+$/, "");
  const base = getBaseUrl().replace(/\/+$/, "");
  return base.replace(/\/api\/v1$/i, "") || "https://app.guardbee.ai";
}
