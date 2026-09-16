import { apiRequest, apiRequestWithToken, GuardbeeApiError } from "./apiClient";
import { unwrapData } from "./envelope";
import { RemoteWorkspace } from "./types";

function asWorkspace(value: unknown): RemoteWorkspace | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string") return undefined;
  return {
    id: record.id,
    name: typeof record.name === "string" ? record.name : record.id,
    slug: typeof record.slug === "string" ? record.slug : undefined,
  };
}

export async function fetchWorkspaceWithToken(apiKey: string): Promise<RemoteWorkspace> {
  const res = await apiRequestWithToken<unknown>(apiKey, "/workspaces");
  const workspace = asWorkspace(unwrapData(res)) ?? asWorkspace(res);
  if (!workspace) throw new GuardbeeApiError("GuardBee API returned an unexpected workspace payload.", 500);
  return workspace;
}

export async function fetchWorkspace(context: import("vscode").ExtensionContext): Promise<RemoteWorkspace> {
  const res = await apiRequest<unknown>(context, "/workspaces");
  const workspace = asWorkspace(unwrapData(res)) ?? asWorkspace(res);
  if (!workspace) throw new GuardbeeApiError("GuardBee API returned an unexpected workspace payload.", 500);
  return workspace;
}
