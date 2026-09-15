/** GuardBee `/api/v1` wraps every body in `{ data }`. List endpoints wrap again as `{ data: T[] }`. */

export function unwrapData<T>(body: unknown): T {
  if (body && typeof body === "object" && "data" in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

export function unwrapArray<T>(body: unknown): T[] {
  const inner = unwrapData<unknown>(body);
  if (Array.isArray(inner)) return inner as T[];
  if (inner && typeof inner === "object") {
    const record = inner as Record<string, unknown>;
    if (Array.isArray(record.data)) return record.data as T[];
    if (Array.isArray(record.items)) return record.items as T[];
  }
  return [];
}
