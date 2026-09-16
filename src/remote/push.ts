import * as vscode from "vscode";
import { NormalizedFinding } from "../scanners/types";
import { apiRequest, GuardbeeApiError } from "./apiClient";
import { getDashboardOrigin } from "./config";
import { dashboardScanUrl, scansHomeUrl } from "./dashboard";
import { unwrapData } from "./envelope";
import { localFindingsPushBody, localFindingsPushMarkdown } from "./pushPayload";

export interface PushLocalResult {
  mode: "uploaded" | "copied";
  dashboardUrl: string;
  findingCount: number;
}

export async function pushLocalFindings(
  context: vscode.ExtensionContext,
  findings: NormalizedFinding[],
  workspaceRoot?: string
): Promise<PushLocalResult> {
  const version = vscode.extensions.getExtension("guardbee-ai.guardbee-vscode")?.packageJSON?.version as
    | string
    | undefined;
  const body = localFindingsPushBody(findings, workspaceRoot, version);
  const origin = getDashboardOrigin();

  try {
    const res = await apiRequest<unknown>(context, "/ide/findings", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const data = unwrapData<Record<string, unknown>>(res);
    const scanId = typeof data?.scanId === "string" ? data.scanId : undefined;
    const url = typeof data?.url === "string" ? data.url : scanId ? dashboardScanUrl(scanId, origin) : scansHomeUrl(origin);
    return { mode: "uploaded", dashboardUrl: url, findingCount: findings.length };
  } catch (err) {
    if (err instanceof GuardbeeApiError && (err.status === 404 || err.status === 405)) {
      await vscode.env.clipboard.writeText(localFindingsPushMarkdown(findings, workspaceRoot));
      return { mode: "copied", dashboardUrl: scansHomeUrl(origin), findingCount: findings.length };
    }
    throw err;
  }
}
