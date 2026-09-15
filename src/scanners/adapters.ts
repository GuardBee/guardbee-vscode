import { NormalizedFinding, ScannerId, ID } from "./types";

type RawFinding = {
  patternId: string;
  patternName: string;
  severity: string;
  file?: string;
  line: number;
  column: number;
  match: string;
  context: string;
  category?: string;
  recommendation?: string;
};

type ScannerModule = { scanText: (text: string, filePath?: string) => RawFinding[] };

// The @guardbee/mcp-* scanner packages are ESM-only; dynamic import() keeps them
// loadable from this CJS-bundled extension host code.
function importScanner(scanner: ScannerId): Promise<ScannerModule> {
  if (scanner === ID.secret) {
    return import("@guardbee/mcp-secret-scanner") as unknown as Promise<ScannerModule>;
  }
  if (scanner === ID.aiCode) {
    return import("@guardbee/mcp-ai-code-scanner") as unknown as Promise<ScannerModule>;
  }
  if (scanner === ID.mcp) {
    return import("@guardbee/mcp-server-auditor") as unknown as Promise<ScannerModule>;
  }
  if (scanner === ID.prompt) {
    return import("@guardbee/mcp-prompt-injection-scanner") as unknown as Promise<ScannerModule>;
  }
  throw new Error(`Unknown scanner: ${scanner}`);
}

const moduleCache = new Map<ScannerId, Promise<ScannerModule>>();

function loadScanner(scanner: ScannerId): Promise<ScannerModule> {
  let cached = moduleCache.get(scanner);
  if (!cached) {
    cached = importScanner(scanner);
    moduleCache.set(scanner, cached);
  }
  return cached;
}

function normalize(scanner: ScannerId, raw: RawFinding[]): NormalizedFinding[] {
  return raw.map((f) => ({
    scanner,
    patternId: f.patternId,
    patternName: f.patternName,
    severity: f.severity as NormalizedFinding["severity"],
    file: f.file,
    line: f.line,
    column: f.column,
    match: f.match,
    context: f.context,
    category: f.category,
    recommendation: f.recommendation,
  }));
}

export async function scanTextWith(scanner: ScannerId, text: string, filePath?: string): Promise<NormalizedFinding[]> {
  const mod = await loadScanner(scanner);
  return normalize(scanner, mod.scanText(text, filePath));
}

export async function scanTextWithAll(
  scanners: ScannerId[],
  text: string,
  filePath?: string
): Promise<NormalizedFinding[]> {
  const results = await Promise.all(scanners.map((s) => scanTextWith(s, text, filePath)));
  return results.flat();
}
