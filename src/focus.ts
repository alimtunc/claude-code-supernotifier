import * as cp from 'node:child_process';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { CONFIG_SECTION } from './constants';
import { DEFAULTS } from './shared/constants';
import { isPidInChain } from './shared/pidChain';

export interface FocusRequest {
  cwd?: string;
  sessionId?: string;
  pidChain?: number[];
}

const OPEN_LAST_COMMAND = 'claude-vscode.editor.openLast';

// With macOS native tabs, several VSCode windows live as tabs inside one AppKit
// window — `open -a Code.app` only activates the app and `vscode.commands.*`
// focus things *inside* the current window, so neither switches tabs. The bundled
// `code --reuse-window <path>` CLI asks the running instance to surface the
// window already holding that workspace, and AppKit switches the native tab as
// a side effect of `makeKeyAndOrderFront:`. When we don't know the workspace,
// fall back to plain app activation.
function bringHostWindowToFront(cwd: string | undefined): void {
  if (process.platform !== 'darwin') return;
  if (vscode.window.state.focused) return;
  const idx = process.execPath.indexOf('.app/');
  if (idx === -1) return;
  const appPath = process.execPath.slice(0, idx + '.app'.length);
  try {
    if (cwd) {
      const cliPath = path.join(appPath, 'Contents', 'Resources', 'app', 'bin', 'code');
      cp.spawn(cliPath, ['--reuse-window', cwd], { detached: true, stdio: 'ignore' }).unref();
    } else {
      cp.spawn('/usr/bin/open', ['-a', appPath], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    // best-effort; VSCode commands below may still focus the panel.
  }
}

export async function focusClaudeSession(request: FocusRequest): Promise<void> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const openSessionCommand = config.get('claudeOpenSessionCommand', DEFAULTS.claudeOpenSessionCommand);
  const focusCommand = config.get('claudeFocusCommand', DEFAULTS.claudeFocusCommand);

  bringHostWindowToFront(request.cwd);

  try {
    if (request.sessionId) {
      await vscode.commands.executeCommand(openSessionCommand, request.sessionId);
    } else {
      await vscode.commands.executeCommand(OPEN_LAST_COMMAND);
    }

    if (focusCommand) {
      await vscode.commands.executeCommand(focusCommand);
    }

    await revealClaudeTerminal(request.pidChain);
  } catch (error) {
    if (await openFolderFallback(request.cwd)) {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showWarningMessage(`Claude Code SuperNotifier could not focus Claude Code: ${message}`);
  }
}

async function revealClaudeTerminal(pidChain: number[] | undefined): Promise<void> {
  if (!pidChain || pidChain.length === 0) {
    return;
  }
  // Best-effort: a failed terminal reveal must not abort the click or trigger the
  // folder fallback — window focus is the fallback. So swallow here rather than
  // letting a rejected processId propagate to focusClaudeSession's catch.
  try {
    const terminals = vscode.window.terminals;
    const pids = await Promise.all(terminals.map((terminal) => terminal.processId));
    const index = pids.findIndex((pid) => pid !== undefined && isPidInChain(pid, pidChain));
    if (index !== -1) {
      terminals[index]?.show();
    }
  } catch {
    // leave the surfaced window focus as the fallback.
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
