import * as cp from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  installClaudeHooks as installHooks,
  isClaudeHooksInstalled,
  uninstallClaudeHooks as uninstallHooks
} from './claudeHooks';
import { CONFIG_SECTION } from './constants';
import { writeRuntimeFiles } from './runtimeFiles';
import { findMacBinary } from './shared/binaries';
import { appDir, helperPath } from './shared/paths';

const HELPER_TIMEOUT_MS = 5000;

export async function installClaudeHooks(context: vscode.ExtensionContext): Promise<void> {
  try {
    writeRuntimeFiles(context);
    installHooks();

    const action = await vscode.window.showInformationMessage(
      'Claude Code SuperNotifier hooks installed. New Claude Code turns will now trigger macOS notifications.',
      'Test Notification',
      'Open Settings'
    );

    if (action === 'Test Notification') {
      await testNotification(context);
    } else if (action === 'Open Settings') {
      await openSettings();
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Claude Code SuperNotifier install failed: ${getErrorMessage(error)}`);
  }
}

export async function uninstallClaudeHooks(): Promise<void> {
  try {
    const wasInstalled = isClaudeHooksInstalled();
    uninstallHooks();
    vscode.window.showInformationMessage(
      wasInstalled
        ? 'Claude Code SuperNotifier hooks uninstalled.'
        : 'No Claude Code hooks were registered for SuperNotifier.'
    );
  } catch (error) {
    vscode.window.showErrorMessage(`Claude Code SuperNotifier uninstall failed: ${getErrorMessage(error)}`);
  }
}

export async function testNotification(context: vscode.ExtensionContext): Promise<void> {
  writeRuntimeFiles(context);

  const sample = {
    session_id: 'supernotify-test',
    transcript_path: path.join(appDir, 'test-transcript.jsonl'),
    cwd: getWorkspaceCwd(),
    permission_mode: 'default',
    hook_event_name: 'Stop',
    last_assistant_message: 'Test notification from Claude Code SuperNotifier.'
  };

  try {
    const result = cp.spawnSync(helperPath, ['--test'], {
      input: JSON.stringify(sample),
      encoding: 'utf8',
      timeout: HELPER_TIMEOUT_MS
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || `Helper exited with code ${result.status}`);
    }

    vscode.window.showInformationMessage('Claude Code SuperNotifier test notification sent.');
  } catch (error) {
    vscode.window.showErrorMessage(`Claude Code SuperNotifier test failed: ${getErrorMessage(error)}`);
  }
}

export async function openSettings(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.openSettings', CONFIG_SECTION);
}

export async function configureMacNotifier(context: vscode.ExtensionContext): Promise<void> {
  if (process.platform !== 'darwin') {
    vscode.window.showInformationMessage(
      'Claude Code SuperNotifier macOS notifier setup is only needed on macOS.'
    );
    return;
  }

  const terminalNotifier = findMacBinary('terminal-notifier');
  if (terminalNotifier) {
    const choice = await vscode.window.showInformationMessage(
      `terminal-notifier is installed at ${terminalNotifier}`,
      'Test Notification',
      'Open Notification Settings'
    );

    if (choice === 'Test Notification') {
      await testNotification(context);
    } else if (choice === 'Open Notification Settings') {
      openMacNotificationSettings();
    }
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    'Claude Code SuperNotifier needs Homebrew terminal-notifier for clickable macOS banners.',
    'Install',
    'Open Settings'
  );

  if (choice === 'Install') {
    installTerminalNotifier();
  } else if (choice === 'Open Settings') {
    openMacNotificationSettings();
  }
}

function installTerminalNotifier(): void {
  const brew = findMacBinary('brew');
  if (!brew) {
    vscode.window.showWarningMessage(
      'Homebrew was not found. Install terminal-notifier manually, then run "Configure macOS terminal-notifier" again.'
    );
    return;
  }

  const terminal = vscode.window.createTerminal('Claude Code SuperNotifier Setup');
  terminal.show();
  terminal.sendText(`${brew} install terminal-notifier`);
}

function openMacNotificationSettings(): void {
  cp.spawn('open', ['x-apple.systempreferences:com.apple.preference.notifications'], {
    detached: true,
    stdio: 'ignore'
  }).unref();
}

function getWorkspaceCwd(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder?.uri.fsPath ?? os.homedir();
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
