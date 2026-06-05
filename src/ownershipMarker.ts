import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { activeRoot, getOwnershipMarkerPath } from './shared/paths';

// Publishes a per-PID marker listing the workspace folders this window holds so
// the hook can resolve which live window owns a session's cwd. Removed on
// deactivate via context.subscriptions; stale markers are pruned hook-side.
export function startOwnershipMarker(context: vscode.ExtensionContext): void {
  const markerPath = getOwnershipMarkerPath(process.pid);

  writeMarker(markerPath);

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      writeMarker(markerPath);
    }),
    new vscode.Disposable(() => {
      try {
        fs.rmSync(markerPath, { force: true });
      } catch {
        // best-effort; a leftover marker is pruned by the hook's liveness probe.
      }
    })
  );
}

function writeMarker(markerPath: string): void {
  const folders = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
  try {
    fs.mkdirSync(activeRoot, { recursive: true });
    fs.writeFileSync(markerPath, folders.join('\n'), 'utf8');
  } catch {
    // best-effort; the worst case is the hook falls back to its workspace-root heuristic.
  }
}
