import * as vscode from "vscode";
import { DiagnosticsManager } from "../diagnostics/manager";
import { runChatScan } from "./tools";

const PARTICIPANT_ID = "guardbee.chat";

export function registerChatParticipant(
  context: vscode.ExtensionContext,
  diagnostics: DiagnosticsManager,
  syncUi: () => Promise<void>
): void {
  if (typeof vscode.chat?.createChatParticipant !== "function") return;

  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, async (request, _ctx, stream, token) => {
    const wantsWorkspace =
      request.command === "workspace" ||
      (request.command !== "file" && (/\bworkspace\b/i.test(request.prompt) || /\ball files\b/i.test(request.prompt)));
    stream.progress(wantsWorkspace ? "Scanning workspace…" : "Scanning current file…");
    try {
      const markdown = await runChatScan(wantsWorkspace ? "workspace" : "file", diagnostics, syncUi, token);
      stream.markdown(markdown.replace(/\n/g, "  \n"));
    } catch (err) {
      stream.markdown(`GuardBee could not complete the scan: ${(err as Error).message}`);
    }
  });
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "icon.png");
  context.subscriptions.push(participant);
}
