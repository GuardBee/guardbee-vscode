# GuardBee for VS Code

Brings GuardBee's security/compliance scanning into the editor.

## Features

- **Local scanning** — runs GuardBee's `secret-scanner`, `ai-code-scanner`, `mcp-server-auditor`, and `prompt-injection-scanner` packages on save (or on demand) and shows findings as inline diagnostics + a "Local Findings" sidebar view.
- **Remote scanning** — trigger and poll a scan from the [GuardBee dashboard](https://app.guardbee.ai) and browse results in a "Remote Scans" sidebar view.

## Setup

1. `npm install`
2. `npm run compile`
3. Press `F5` to launch an Extension Development Host.

## Local scanning

Runs automatically on save (configurable via `guardbee.scanOnSave`), or manually via **GuardBee: Scan Current File** / **GuardBee: Scan Workspace**.

Configure via a `guardbee.yml` in your workspace root:

```yaml
secret-scanner:
  exclude: ["**/*.test.ts", "fixtures/"]
  allowlist: ["EXAMPLE_KEY", "sk_test_fake"]
ai-code-scanner:
  exclude: ["fixtures/"]
```

Settings: `guardbee.enabledScanners`, `guardbee.scanOnSave`, `guardbee.severityThreshold`.

## Remote scanning

1. Generate an API key on the [Developers page](https://app.guardbee.ai) (needs `scans.read`, `scans.write`, `findings.read`, `domains.read` scopes).
2. Run **GuardBee: Set API Key** and paste it.
3. Run **GuardBee: Trigger Remote Scan** to pick a Brand (or enter a URL) and start a scan; results land in the "Remote Scans" view once the scan completes.
4. Run **GuardBee: Show Recent Scans** to browse the last 10 scans.

Note: ad-hoc URL scans (not tied to a verified Brand) require the URL's hostname to match your account's corporate email domain — this is enforced server-side.

### Known limitation

Remote findings currently don't carry file/line information (GuardBee's dashboard scans live URLs, not source files), so they appear only in the "Remote Scans" view, not as editor diagnostics. Also, `ruleId`/`cweId` aren't yet exposed by the `/api/v1/findings` response even though they exist server-side.

## Development

- `npm run watch` — incremental esbuild rebuild
- `npm test` — runs the extension test suite via `@vscode/test-electron`
