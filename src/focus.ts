import * as vscode from 'vscode';
import { CONFIG_SECTION } from './constants';
import { DEFAULTS } from './shared/constants';

export interface FocusRequest {
  cwd?: string;
  sessionId?: string;
}

const OPEN_LAST_COMMAND = 'claude-vscode.editor.openLast';

export async function focusClaudeSession(request: FocusRequest): Promise<void> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const openSessionCommand = config.get('claudeOpenSessionCommand', DEFAULTS.claudeOpenSessionCommand);
  const focusCommand = config.get('claudeFocusCommand', DEFAULTS.claudeFocusCommand);

  try {
    if (request.sessionId) {
      await vscode.commands.executeCommand(
        openSessionCommand,
        request.sessionId,
        undefined,
        vscode.ViewColumn.Active
      );
    } else {
      await vscode.commands.executeCommand(OPEN_LAST_COMMAND);
    }

    if (focusCommand) {
      await vscode.commands.executeCommand(focusCommand);
    }
  } catch (error) {
    if (await openFolderFallback(request.cwd)) {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showWarningMessage(`Claude Code SuperNotifier could not focus Claude Code: ${message}`);
  }
}

async function openFolderFallback(cwd: string | undefined): Promise<boolean> {
  if (!cwd) {
    return false;
  }
  await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(cwd), {
    forceNewWindow: false
  });
  return true;
}
