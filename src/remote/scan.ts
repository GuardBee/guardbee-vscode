import * as vscode from "vscode";
import { apiRequest } from "./apiClient";
import { Envelope, RemoteBrand, RemoteFinding, RemoteScan, TERMINAL_STATUSES } from "./types";

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 900_000; // 15 minutes, mirrors apify actor's default maxWaitSecs

export async function listBrands(context: vscode.ExtensionContext): Promise<RemoteBrand[]> {
  const res = await apiRequest<Envelope<RemoteBrand[]>>(context, "/domains");
  return res.data;
}

export async function listScans(context: vscode.ExtensionContext): Promise<RemoteScan[]> {
  const res = await apiRequest<Envelope<RemoteScan[]>>(context, "/scans");
  return res.data;
}

export async function triggerScan(
  context: vscode.ExtensionContext,
  target: { brandId: string } | { url: string }
): Promise<RemoteScan> {
  const res = await apiRequest<Envelope<RemoteScan>>(context, "/scans", {
    method: "POST",
    body: JSON.stringify(target),
  });
  return res.data;
}

export async function getScan(context: vscode.ExtensionContext, id: string): Promise<RemoteScan> {
  const res = await apiRequest<Envelope<RemoteScan>>(context, `/scans/${id}`);
  return res.data;
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
    const res = await apiRequest<Envelope<RemoteFinding[]>>(
      context,
      `/findings?scanId=${encodeURIComponent(scanId)}&page=${page}`
    );
    all.push(...res.data);
    if (res.data.length === 0) break;
    page += 1;
    if (page > 200) break; // safety cap
  }
  return all;
}
