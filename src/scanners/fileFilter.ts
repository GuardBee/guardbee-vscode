const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "out",
  "coverage",
  ".next",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
  ".tox",
  "build",
  ".vscode-test",
]);

const SKIP_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".bmp",
  ".mp4",
  ".mov",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  ".pdf",
  ".zip",
  ".gz",
  ".tgz",
  ".wasm",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".map",
  ".lock",
]);

const SKIP_BASENAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "Cargo.lock",
  "composer.lock",
  "go.sum",
  "Gemfile.lock",
]);

export const DEFAULT_WORKSPACE_EXCLUDES = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/out/**",
  "**/.next/**",
  "**/coverage/**",
  "**/.venv/**",
  "**/venv/**",
  "**/vendor/**",
  "**/.vscode-test/**",
];

export const MAX_SCAN_CHARS = 1_000_000;

function fileName(posixPath: string): string {
  const parts = posixPath.split("/");
  return parts[parts.length - 1] ?? "";
}

function extensionOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

export function shouldScanPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  if (parts.some((part) => SKIP_DIR_NAMES.has(part))) return false;

  const name = fileName(normalized);
  if (SKIP_BASENAMES.has(name)) return false;
  if (name.endsWith(".min.js") || name.endsWith(".min.css")) return false;
  if (SKIP_EXTENSIONS.has(extensionOf(name))) return false;
  return true;
}

export function shouldScanContents(filePath: string, textLength: number): boolean {
  return textLength <= MAX_SCAN_CHARS && shouldScanPath(filePath);
}
