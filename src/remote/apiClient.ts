import * as vscode from "vscode";
import { getApiKey } from "./auth";

export class GuardbeeApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function getBaseUrl(): string {
  return vscode.workspace.getConfiguration("guardbee").get<string>("apiBaseUrl", "https://app.guardbee.ai/api/v1");
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function apiRequest<T>(
  context: vscode.ExtensionContext,
  path: string,
  init: RequestInit = {},
  retriesLeft = 3
): Promise<T> {
  const apiKey = await getApiKey(context);
  if (!apiKey) {
    throw new GuardbeeApiError("No GuardBee API key configured. Run 'GuardBee: Set API Key' first.", 401);
  }

  const url = `${getBaseUrl()}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (response.status === 429 && retriesLeft > 0) {
    const retryAfterHeader = response.headers.get("Retry-After") ?? response.headers.get("X-RateLimit-Reset");
    const waitMs = retryAfterHeader ? Math.max(1000, Number(retryAfterHeader) * 1000) : 5000;
    await sleep(waitMs);
    return apiRequest<T>(context, path, init, retriesLeft - 1);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new GuardbeeApiError(`GuardBee API ${response.status}: ${body || response.statusText}`, response.status);
  }

  return (await response.json()) as T;
}
