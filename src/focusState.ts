import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { getFocusedPath } from './shared/paths';

// The hook runs outside the extension host and can't query
// `vscode.window.state.focused`. We mirror the focus state to a per-workspace
// flag file so the hook can decide whether to suppress a notification when
// the user is already on the matching VSCode window.
export function startFocusStateTracker(context: vscode.ExtensionContext): void {
  syncFocusFiles(vscode.window.state.focused);

  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((state) => {
      syncFocusFiles(state.focused);
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      syncFocusFiles(vscode.window.state.focused);
    }),
    new vscode.Disposable(() => {
      syncFocusFiles(false);
    })
  );
}

function syncFocusFiles(focused: boolean): void {
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const flagPath = getFocusedPath(folder.uri.fsPath);
    try {
      if (focused) {
        fs.mkdirSync(path.dirname(flagPath), { recursive: true });
        fs.writeFileSync(flagPath, '', 'utf8');
      } else {
        fs.rmSync(flagPath, { force: true });
      }
    } catch {
      // best-effort; the worst case is a redundant notification.
    }
  }
}
