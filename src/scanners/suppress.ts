import { NormalizedFinding, ScannerId } from "./types";

const NEXT_LINE_RE = /guardbee-disable-next-line(?:\s+([a-z0-9-]+))?/i;
const THIS_LINE_RE = /guardbee-disable-line(?:\s+([a-z0-9-]+))?/i;

function scannerMatches(specified: string | undefined, scanner: ScannerId): boolean {
  if (!specified) return true;
  return specified === scanner || scanner.startsWith(specified);
}

export function isSuppressedAt(lines: string[], lineNumber1Based: number, scanner: ScannerId): boolean {
  const idx = lineNumber1Based - 1;
  if (idx < 0 || idx >= lines.length) return false;

  const thisLine = lines[idx].match(THIS_LINE_RE);
  if (thisLine && scannerMatches(thisLine[1], scanner)) return true;

  if (idx > 0) {
    const previous = lines[idx - 1].match(NEXT_LINE_RE);
    if (previous && scannerMatches(previous[1], scanner)) return true;
  }

  return false;
}

export function filterSuppressedFindings(
  findings: NormalizedFinding[],
  getLines: (filePath: string) => string[] | undefined
): NormalizedFinding[] {
  return findings.filter((finding) => {
    if (!finding.file || finding.line <= 0) return true;
    const lines = getLines(finding.file);
    if (!lines) return true;
    return !isSuppressedAt(lines, finding.line, finding.scanner);
  });
}

/** Returns undefined for languages that cannot host a line comment (plain JSON). */
export function disableNextLineComment(languageId: string, scanner?: ScannerId): string | undefined {
  const body = scanner ? `guardbee-disable-next-line ${scanner}` : "guardbee-disable-next-line";
  switch (languageId) {
    case "json":
      return undefined;
    case "python":
    case "yaml":
    case "shellscript":
    case "ruby":
    case "toml":
    case "dockerfile":
    case "makefile":
    case "r":
    case "perl":
    case "elixir":
    case "powershell":
    case "gitignore":
    case "dotenv":
    case "ini":
      return `# ${body}`;
    case "html":
    case "xml":
    case "svg":
    case "markdown":
      return `<!-- ${body} -->`;
    case "css":
    case "scss":
    case "less":
      return `/* ${body} */`;
    case "sql":
      return `-- ${body}`;
    default:
      return `// ${body}`;
  }
}
