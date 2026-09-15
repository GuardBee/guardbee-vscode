# GuardBee for VS Code

Review GuardBee findings in the editor, and run GuardBee dashboard scans from the sidebar.

## Features

- **Local findings** — analyze the current file or workspace on save (or on demand). Results appear as editor diagnostics and in the Local Findings view.
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
