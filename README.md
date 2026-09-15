# GuardBee for VS Code

Review GuardBee findings in the editor, run dashboard jobs from the sidebar, and let Cursor or VS Code agents check code before saving.

## Features

- **Local findings** — analyze the current file or workspace on save (or on demand). Results appear as editor diagnostics and in the Local Findings view.
- **Agent tools** — Cursor/VS Code agents can scan a file, scan the workspace, or check unsaved code before saving (`#guardbeeScanFile`, `#guardbeeScanWorkspace`, `#guardbeeCheckCode`, or `@guardbee` in chat).
- **Dashboard scans** — start a scan from the GuardBee dashboard and browse results in the Remote Scans view.

## Setup

1. `npm install`
2. `npm run compile`
3. Press `F5` to launch an Extension Development Host.

## Local findings

Runs automatically on save (configurable via `guardbee.scanOnSave`), or from the GuardBee sidebar / **GuardBee: Scan Current File** / **GuardBee: Scan Workspace**.

Findings appear as editor diagnostics. Hover for the recommendation, then use a Quick Fix (lightbulb) to:

- insert `// guardbee-disable-next-line` (or `#` / `<!-- -->` depending on language)
- add the match to the workspace `guardbee.yml` allowlist

You can also suppress inline:

```ts
// guardbee-disable-next-line
const demo = "example";

const demo2 = "example"; // guardbee-disable-line
```

Optional `guardbee.yml` in the workspace root can exclude paths and allowlist known test values.

Settings: `guardbee.enabledScanners`, `guardbee.scanOnSave`, `guardbee.severityThreshold`.
The status bar shows the current finding count; click it to focus Local Findings.

## Agent tools

In Cursor/VS Code agent chat, GuardBee registers three tools (also referenceable with `#`):

| Tool | When to use |
| --- | --- |
| `#guardbeeScanFile` | Scan the current file or a path |
| `#guardbeeScanWorkspace` | Scan the open folder (optional `credential` filter) |
| `#guardbeeCheckCode` | Check generated/unsaved code before saving |

Or chat with **`@guardbee`** / `@guardbee /file` / `@guardbee /workspace`.

Tools return locations and recommendations only — they do not send matched credential values to the model. Blocking (critical/high) findings set `canProceed` to false.

## Dashboard scans

1. Create a credential on the [Developers page](https://app.guardbee.ai).
2. Run **GuardBee: Connect Account** and paste it.
3. Run **GuardBee: Trigger Remote Scan** to pick a Brand (or enter a URL). Results appear in Remote Scans when the job completes.
4. Run **GuardBee: Show Recent Scans** to browse the last 10 jobs.

Ad-hoc URL scans that are not tied to a verified Brand must use a hostname that matches your account email domain.

### Known limitation

Remote findings currently don't include file/line locations (dashboard jobs target live URLs, not source files), so they appear only in the Remote Scans view.

## Development

- `npm run watch` — incremental esbuild rebuild
- `npm test` — extension test suite via `@vscode/test-electron`
- `npm run package` — produce a `.vsix`
