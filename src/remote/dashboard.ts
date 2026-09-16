export function developersKeysUrl(origin: string): string {
  return `${origin}/developers?tab=keys`;
}

export function scansHomeUrl(origin: string): string {
  return `${origin}/scans`;
}

export function dashboardScanUrl(scanId: string, origin: string): string {
  return `${origin}/scans/${encodeURIComponent(scanId)}`;
}

export function dashboardFindingUrl(scanId: string, findingId: string | undefined, origin: string): string {
  const scan = dashboardScanUrl(scanId, origin);
  if (!findingId) return scan;
  return `${scan}?finding=${encodeURIComponent(findingId)}`;
}

export function parseConnectToken(uri: { path: string; query: string }): string | undefined {
  const path = uri.path.replace(/^\//, "");
  if (path && path !== "connect") return undefined;
  const params = new URLSearchParams(uri.query);
  const token = params.get("token") ?? params.get("key") ?? params.get("credential");
  const trimmed = token?.trim();
  return trimmed || undefined;
}
