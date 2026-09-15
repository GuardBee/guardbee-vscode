import * as vscode from "vscode";
import { apiRequest } from "./apiClient";
import { unwrapArray, unwrapData } from "./envelope";
import { RemoteBrand, RemoteFinding, RemoteScan, TERMINAL_STATUSES } from "./types";

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 900_000; // 15 minutes, mirrors apify actor's default maxWaitSecs

export async function listBrands(context: vscode.ExtensionContext): Promise<RemoteBrand[]> {
  const res = await apiRequest<unknown>(context, "/domains");
  return unwrapArray<RemoteBrand>(res);
}

export async function listScans(context: vscode.ExtensionContext): Promise<RemoteScan[]> {
  const res = await apiRequest<unknown>(context, "/scans");
  return unwrapArray<RemoteScan>(res);
}

export async function triggerScan(
  context: vscode.ExtensionContext,
  target: { brandId: string } | { url: string }
): Promise<RemoteScan> {
  const res = await apiRequest<unknown>(context, "/scans", {
    method: "POST",
    body: JSON.stringify(target),
  });
  return unwrapData<RemoteScan>(res);
}

export async function getScan(context: vscode.ExtensionContext, id: string): Promise<RemoteScan> {
  const res = await apiRequest<unknown>(context, `/scans/${id}`);
  return unwrapData<RemoteScan>(res);
}

export async function pollScan(
  context: vscode.ExtensionContext,
  id: string,
  onTick: (scan: RemoteScan) => void,
  isCancelled: () => boolean
): Promise<RemoteScan> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (isCancelled()) throw new Error("GuardBee remote scan polling cancelled");
    const scan = await getScan(context, id);
    onTick(scan);
    if (TERMINAL_STATUSES.includes(scan.status)) return scan;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`GuardBee remote scan ${id} did not finish within ${POLL_TIMEOUT_MS / 1000}s`);
}

export async function fetchFindings(context: vscode.ExtensionContext, scanId: string): Promise<RemoteFinding[]> {
  const all: RemoteFinding[] = [];
  let page = 1;
  for (;;) {
    const res = await apiRequest<unknown>(
      context,
      `/findings?scanId=${encodeURIComponent(scanId)}&page=${page}`
    );
    const batch = unwrapArray<RemoteFinding>(res);
    all.push(...batch);
    if (batch.length === 0) break;
    page += 1;
    if (page > 200) break; // safety cap
  }
  return all;
}
