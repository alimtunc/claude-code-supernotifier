import * as cp from 'node:child_process';
import * as vscode from 'vscode';
import { CONFIG_SECTION } from './constants';
import { DEFAULTS } from './shared/constants';

export interface FocusRequest {
  cwd?: string;
  sessionId?: string;
}

const OPEN_LAST_COMMAND = 'claude-vscode.editor.openLast';

// VSCode commands focus things *inside* the window but don't activate the app
// at OS level. The notification click activates the notifier .app, not VSCode,
// so we need to ask macOS to bring the host app forward. With macOS native
// tabs, passing the workspace path makes VSCode raise the *specific* tab that
// already has that folder open instead of whichever tab was most recent.
function bringHostAppToFront(workspaceRoot: string | undefined): void {
  if (process.platform !== 'darwin') return;
  const idx = process.execPath.indexOf('.app/');
  if (idx === -1) return;
  const appPath = process.execPath.slice(0, idx + '.app'.length);
  const args = workspaceRoot ? ['-a', appPath, workspaceRoot] : [appPath];
  try {
    cp.spawn('/usr/bin/open', args, { detached: true, stdio: 'ignore' }).unref();
  } catch {
    // best-effort; VSCode commands below may still focus the panel.
  }
}

export async function focusClaudeSession(request: FocusRequest): Promise<void> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const openSessionCommand = config.get('claudeOpenSessionCommand', DEFAULTS.claudeOpenSessionCommand);
  const focusCommand = config.get('claudeFocusCommand', DEFAULTS.claudeFocusCommand);

  bringHostAppToFront(request.cwd);

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
