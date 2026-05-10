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
// at OS level. The notification click activated the notifier .app, not VSCode,
// so when our window is in the background we ask macOS to bring VSCode forward.
// We deliberately omit any path argument: `open -a Code.app <path>` falls back
// to spawning a NEW window when VSCode's internal path comparison disagrees
// (symlinks, case, native-tabs dispatcher), which is issue #2.
function bringHostAppToFront(): void {
  if (process.platform !== 'darwin') return;
  if (vscode.window.state.focused) return;
  const idx = process.execPath.indexOf('.app/');
  if (idx === -1) return;
  const appPath = process.execPath.slice(0, idx + '.app'.length);
  try {
    cp.spawn('/usr/bin/open', ['-a', appPath], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    // best-effort; VSCode commands below may still focus the panel.
  }
}

export async function focusClaudeSession(request: FocusRequest): Promise<void> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const openSessionCommand = config.get('claudeOpenSessionCommand', DEFAULTS.claudeOpenSessionCommand);
  const focusCommand = config.get('claudeFocusCommand', DEFAULTS.claudeFocusCommand);

  bringHostAppToFront();

  try {
    if (request.sessionId) {
      await vscode.commands.executeCommand(openSessionCommand, request.sessionId);
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
