import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { CONFIG_SECTION } from './constants';
import { focusClaudeSession, focusHostWindow } from './focus';
import { CLICKED_FILE_NAME, DEFAULTS, SIGNAL_FILE_NAME } from './shared/constants';
import { tryReadJson } from './shared/json';
import { getClickedPath, getStateDir } from './shared/paths';
import type { ClickAction } from './types';

interface SignalPayload {
  cwd?: string;
  workspaceRoot?: string;
  sessionId?: string;
  pidChain?: number[];
}

export function startClickSignalWatcher(context: vscode.ExtensionContext): void {
  const watchers = new Map<string, vscode.FileSystemWatcher>();

  const refresh = (): void => {
    const currentRoots = new Set<string>();
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const root = folder.uri.fsPath;
      currentRoots.add(root);
      if (!watchers.has(root)) {
        watchers.set(root, registerWatcher(context, root));
      }
    }

    for (const [root, watcher] of watchers) {
      if (!currentRoots.has(root)) {
        watcher.dispose();
        watchers.delete(root);
      }
    }
  };

  refresh();
  scanExisting();

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(refresh),
    new vscode.Disposable(() => {
      for (const watcher of watchers.values()) {
        watcher.dispose();
      }
      watchers.clear();
    })
  );
}

function registerWatcher(context: vscode.ExtensionContext, workspaceRoot: string): vscode.FileSystemWatcher {
  const stateDir = getStateDir(workspaceRoot);
  fs.mkdirSync(stateDir, { recursive: true });

  const pattern = new vscode.RelativePattern(vscode.Uri.file(stateDir), CLICKED_FILE_NAME);
  const watcher = vscode.workspace.createFileSystemWatcher(pattern, false, true, true);

  watcher.onDidCreate((uri) => {
    void handleClicked(uri.fsPath);
  });

  context.subscriptions.push(watcher);
  return watcher;
}

function scanExisting(): void {
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const clickedPath = getClickedPath(folder.uri.fsPath);
    if (fs.existsSync(clickedPath)) {
      void handleClicked(clickedPath);
    }
  }
}

async function handleClicked(clickedPath: string): Promise<void> {
  const stateDir = path.dirname(clickedPath);
  const signalPath = path.join(stateDir, SIGNAL_FILE_NAME);
  const signal = tryReadJson<SignalPayload | null>(signalPath, null);

  try {
    fs.unlinkSync(clickedPath);
  } catch {
    // Already consumed by another window — let that window handle it.
    return;
  }

  if (!signal) {
    return;
  }

  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const clickAction = config.get<ClickAction>('clickAction', DEFAULTS.clickAction);
  if (clickAction === 'window') {
    focusHostWindow(signal.workspaceRoot ?? signal.cwd);
    return;
  }

  await focusClaudeSession({
    cwd: signal.workspaceRoot ?? signal.cwd,
    sessionId: signal.sessionId,
    pidChain: signal.pidChain
  });
}
