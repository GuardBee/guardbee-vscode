export interface RemoteBrand {
  id: string;
  domain?: string;
  name?: string;
  url?: string;
}

export type RemoteScanStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface RemoteScan {
  id: string;
  url: string;
  status: RemoteScanStatus;
  score?: number;
  brandId?: string;
  workspaceId?: string;
  createdAt: string;
  finishedAt?: string;
}

export interface RemoteFinding {
  id: string;
  scanId: string;
  moduleId: string;
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO" | "PASSED";
  status: string;
  description?: string;
  recommendation?: string;
  cveId?: string;
  documentationUrl?: string;
  createdAt: string;
}

export interface RemoteWorkspace {
  id: string;
  name: string;
  slug?: string;
}

export interface Envelope<T> {
  data: T;
}

export const TERMINAL_STATUSES: RemoteScanStatus[] = ["COMPLETED", "FAILED", "CANCELLED"];
