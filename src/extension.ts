import * as vscode from 'vscode';
import { startClickSignalWatcher } from './clickSignals';
import * as commands from './commands';
import { COMMAND_IDS, CONFIG_SECTION } from './constants';
import { startFocusStateTracker } from './focusState';
import { ensureNotifierApp } from './notifierApp';
import { writeRuntimeFiles } from './runtimeFiles';
import { startStatusBarTracker } from './statusBar';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.installClaudeHooks, () =>
      commands.installClaudeHooks(context)
    ),
    vscode.commands.registerCommand(COMMAND_IDS.uninstallClaudeHooks, () => commands.uninstallClaudeHooks()),
    vscode.commands.registerCommand(COMMAND_IDS.testNotification, () => commands.testNotification(context)),
    vscode.commands.registerCommand(COMMAND_IDS.openSettings, () => commands.openSettings()),
    vscode.commands.registerCommand(COMMAND_IDS.toggleMute, () => commands.toggleMute()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(CONFIG_SECTION)) {
        writeRuntimeFiles(context);
      }
    })
  );

  ensureNotifierApp(context);
  writeRuntimeFiles(context);
  startClickSignalWatcher(context);
  startFocusStateTracker(context);
  startStatusBarTracker(context);
}

export function deactivate(): void {}
