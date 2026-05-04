import * as vscode from 'vscode';
import * as commands from './commands';
import { startClickSignalWatcher } from './clickSignals';
import { COMMAND_IDS, CONFIG_SECTION } from './constants';
import { ensureNotifierApp } from './notifierApp';
import { writeRuntimeFiles } from './runtimeFiles';
import { SupernotifierUriHandler } from './uriHandler';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.installClaudeHooks, () =>
      commands.installClaudeHooks(context)
    ),
    vscode.commands.registerCommand(COMMAND_IDS.uninstallClaudeHooks, () => commands.uninstallClaudeHooks()),
    vscode.commands.registerCommand(COMMAND_IDS.testNotification, () => commands.testNotification(context)),
    vscode.commands.registerCommand(COMMAND_IDS.configureMacNotifier, () =>
      commands.configureMacNotifier(context)
    ),
    vscode.commands.registerCommand(COMMAND_IDS.openSettings, () => commands.openSettings()),
    vscode.window.registerUriHandler(new SupernotifierUriHandler()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(CONFIG_SECTION)) {
        writeRuntimeFiles(context);
      }
    })
  );

  ensureNotifierApp(context);
  writeRuntimeFiles(context);
  startClickSignalWatcher(context);
}

export function deactivate(): void {}
