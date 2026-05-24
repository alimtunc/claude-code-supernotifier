import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { getRuntimeConfig } from './config';
import { CONFIG_SECTION } from './constants';
import { focusClaudeSession } from './focus';
import { readRecentEvents } from './shared/eventLog';
import { appDir, eventLogPath } from './shared/paths';
import {
  deriveSessionState,
  pickHighestPriority,
  type SessionSnapshot,
  type SessionState
} from './shared/sessionState';

const STATUS_BAR_COMMAND = `${CONFIG_SECTION}.statusBarClick`;
const REFRESH_DEBOUNCE_MS = 200;
const IDLE_HIDE_AFTER_MS = 10 * 60 * 1000;
const STALENESS_TICK_MS = 60 * 1000;

interface DisplayState {
  workspaceRoot: string;
  snapshot: SessionSnapshot;
}

export function startStatusBarTracker(context: vscode.ExtensionContext): void {
  if (!getRuntimeConfig().statusBarEnabled) {
    return;
  }

  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = STATUS_BAR_COMMAND;
  item.name = 'Claude Code SuperNotifier';

  let current: DisplayState | null = null;
  const dismissedAt = new Map<string, string>();

  const click = vscode.commands.registerCommand(STATUS_BAR_COMMAND, () => {
    if (!current?.snapshot.lastEvent) return;
    dismissedAt.set(current.workspaceRoot, current.snapshot.lastEvent.createdAt);
    void focusClaudeSession({
      cwd: current.workspaceRoot,
      sessionId: current.snapshot.lastEvent.sessionId || undefined
    });
    refresh();
  });

  const refresh = (): void => {
    const events = readRecentEvents();
    const folders = vscode.workspace.workspaceFolders ?? [];
    const snapshots: DisplayState[] = folders.map((folder) => {
      const workspaceRoot = folder.uri.fsPath;
      const snapshot = deriveSessionState({
        events,
        workspaceRoot,
        now: new Date(),
        idleHideAfterMs: IDLE_HIDE_AFTER_MS
      });
      return { workspaceRoot, snapshot: applyDismissal(snapshot, dismissedAt.get(workspaceRoot)) };
    });
    current = pickHighestPriority(snapshots);
    render(item, current);
  };

  let debounce: NodeJS.Timeout | undefined;
  const scheduleRefresh = (): void => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(refresh, REFRESH_DEBOUNCE_MS);
  };

  const watcher = watchEventLog(scheduleRefresh);
  const tick = setInterval(refresh, STALENESS_TICK_MS);

  context.subscriptions.push(
    item,
    click,
    new vscode.Disposable(() => {
      if (debounce) clearTimeout(debounce);
      clearInterval(tick);
      watcher.close();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(refresh)
  );

  refresh();
}

function applyDismissal(snapshot: SessionSnapshot, ack: string | undefined): SessionSnapshot {
  if (!ack || !snapshot.lastEvent) return snapshot;
  if (snapshot.lastEvent.createdAt > ack) return snapshot;
  return { state: 'inactive', lastEvent: snapshot.lastEvent, ageMs: snapshot.ageMs };
}

function watchEventLog(onChange: () => void): { close: () => void } {
  let watcher: fs.FSWatcher | undefined;
  try {
    fs.mkdirSync(appDir, { recursive: true });
    const logBasename = path.basename(eventLogPath);
    watcher = fs.watch(appDir, { persistent: false }, (_event, filename) => {
      if (!filename || filename === logBasename || filename === `${logBasename}.1`) {
        onChange();
      }
    });
    watcher.on('error', () => {
      // best-effort; the periodic tick will still pick up state changes.
    });
  } catch {
    // best-effort.
  }
  return {
    close: (): void => {
      watcher?.close();
    }
  };
}

function render(item: vscode.StatusBarItem, current: DisplayState | null): void {
  if (!current || current.snapshot.state === 'inactive') {
    item.hide();
    return;
  }
  const { state, lastEvent, ageMs } = current.snapshot;
  item.text = `${iconFor(state)} ${labelFor(state)}`;
  item.tooltip = buildTooltip(current.workspaceRoot, state, lastEvent?.repo ?? '', ageMs);
  item.backgroundColor = backgroundFor(state);
  item.show();
}

function iconFor(state: SessionState): string {
  switch (state) {
    case 'running':
      return '$(sync~spin)';
    case 'waiting':
      return '$(bell-dot)';
    case 'idle':
      return '$(check)';
    case 'inactive':
      return '$(circle-large-outline)';
  }
}

function labelFor(state: SessionState): string {
  switch (state) {
    case 'running':
      return 'Claude · working';
    case 'waiting':
      return 'Claude · waiting';
    case 'idle':
      return 'Claude · idle';
    case 'inactive':
      return 'Claude';
  }
}

function backgroundFor(state: SessionState): vscode.ThemeColor | undefined {
  if (state === 'waiting') {
    return new vscode.ThemeColor('statusBarItem.warningBackground');
  }
  return undefined;
}

function buildTooltip(
  workspaceRoot: string,
  state: SessionState,
  repo: string,
  ageMs: number | null
): vscode.MarkdownString {
  const display = repo || path.basename(workspaceRoot) || workspaceRoot;
  const headline = headlineFor(state, display);
  const age = ageMs !== null ? formatAge(ageMs) : null;
  const md = new vscode.MarkdownString(undefined, true);
  md.appendMarkdown(`**${headline}**\n\n`);
  if (age) {
    md.appendMarkdown(`Last update ${age} ago\n\n`);
  }
  md.appendMarkdown('Click to focus the Claude Code session.');
  return md;
}

function headlineFor(state: SessionState, repo: string): string {
  switch (state) {
    case 'running':
      return `Claude is working in ${repo}`;
    case 'waiting':
      return `Claude is waiting in ${repo}`;
    case 'idle':
      return `Claude is idle in ${repo}`;
    case 'inactive':
      return `No recent Claude activity in ${repo}`;
  }
}

function formatAge(ageMs: number): string {
  const seconds = Math.max(0, Math.round(ageMs / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}
