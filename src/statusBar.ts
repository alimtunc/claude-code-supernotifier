import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { getRuntimeConfig } from './config';
import { CONFIG_SECTION } from './constants';
import { focusClaudeSession } from './focus';
import { readRecentEvents } from './shared/eventLog';
import { isMuted } from './shared/mute';
import { buildPanelMarkdown, type PanelEventSound, type PanelState } from './shared/panelMarkdown';
import { appDir, eventLogPath } from './shared/paths';
import { createRestartable } from './shared/restartable';
import {
  deriveSessionState,
  pickHighestPriority,
  type SessionSnapshot,
  type SessionState
} from './shared/sessionState';
import type { SupernotifierConfig } from './types';

const STATUS_BAR_COMMAND = `${CONFIG_SECTION}.statusBarClick`;
const STATUS_BAR_ENABLED_KEY = `${CONFIG_SECTION}.statusBar.enabled`;
const REFRESH_DEBOUNCE_MS = 200;
const IDLE_HIDE_AFTER_MS = 10 * 60 * 1000;
const STALENESS_TICK_MS = 60 * 1000;

interface DisplayState {
  workspaceRoot: string;
  snapshot: SessionSnapshot;
}

let activeRefresh: (() => void) | null = null;

export function requestStatusBarRefresh(): void {
  activeRefresh?.();
}

export function startStatusBarTracker(context: vscode.ExtensionContext): void {
  const tracker = createRestartable(createTracker);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration(STATUS_BAR_ENABLED_KEY)) {
        return;
      }
      if (getRuntimeConfig().statusBarEnabled) {
        tracker.start();
      } else {
        tracker.stop();
      }
    }),
    new vscode.Disposable(() => tracker.stop())
  );

  if (getRuntimeConfig().statusBarEnabled) {
    tracker.start();
  }
}

function createTracker(): vscode.Disposable[] {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = STATUS_BAR_COMMAND;
  item.name = 'Claude Code SuperNotifier';

  let current: DisplayState | null = null;
  const dismissedAt = new Map<string, string>();

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

  const click = vscode.commands.registerCommand(STATUS_BAR_COMMAND, () => {
    if (!current?.snapshot.lastEvent) return;
    dismissedAt.set(current.workspaceRoot, current.snapshot.lastEvent.createdAt);
    void focusClaudeSession({
      cwd: current.workspaceRoot,
      sessionId: current.snapshot.lastEvent.sessionId || undefined
    });
    refresh();
  });

  let debounce: NodeJS.Timeout | undefined;
  const scheduleRefresh = (): void => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(refresh, REFRESH_DEBOUNCE_MS);
  };

  const watcher = watchEventLog(scheduleRefresh);
  const tick = setInterval(refresh, STALENESS_TICK_MS);
  const folderListener = vscode.workspace.onDidChangeWorkspaceFolders(refresh);

  activeRefresh = refresh;
  refresh();

  return [
    item,
    click,
    folderListener,
    new vscode.Disposable(() => {
      if (debounce) clearTimeout(debounce);
      clearInterval(tick);
      watcher.close();
      if (activeRefresh === refresh) {
        activeRefresh = null;
      }
    })
  ];
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
  const muted = isMuted();
  if (!current || current.snapshot.state === 'inactive') {
    if (!muted) {
      item.hide();
      return;
    }
    item.text = '$(mute) Claude muted';
    item.tooltip = buildPanelTooltip(toPanelState(current, muted));
    item.backgroundColor = undefined;
    item.show();
    return;
  }
  const { state } = current.snapshot;
  item.text = `${iconFor(state)} ${labelFor(state)}${muted ? ' $(mute)' : ''}`;
  item.tooltip = buildPanelTooltip(toPanelState(current, muted));
  item.backgroundColor = backgroundFor(state);
  item.show();
}

function buildPanelTooltip(state: PanelState): vscode.MarkdownString {
  const md = new vscode.MarkdownString(buildPanelMarkdown(state), true);
  md.isTrusted = true;
  md.supportThemeIcons = true;
  return md;
}

function toPanelState(current: DisplayState | null, muted: boolean): PanelState {
  const config = getRuntimeConfig();
  const snapshot = current?.snapshot ?? null;
  const repo = current
    ? snapshot?.lastEvent?.repo || path.basename(current.workspaceRoot) || current.workspaceRoot
    : workspaceDisplayName();
  return {
    state: snapshot?.state ?? 'inactive',
    repo,
    ageMs: snapshot?.ageMs ?? null,
    muted,
    eventSounds: eventSoundsFor(config),
    thresholdSeconds: config.minTaskDurationSeconds
  };
}

function eventSoundsFor(config: SupernotifierConfig): PanelEventSound[] {
  return [
    { event: 'stop', label: 'Finished', sound: effectiveSoundName(config.stopSound, config.sound) },
    {
      event: 'permission',
      label: 'Permission',
      sound: effectiveSoundName(config.permissionSound, config.sound)
    },
    {
      event: 'question',
      label: 'Question',
      sound: effectiveSoundName(config.questionSound, config.sound)
    },
    {
      event: 'subagentStop',
      label: 'Subagent',
      sound: effectiveSoundName(config.subagentStopSound, config.sound)
    }
  ];
}

function effectiveSoundName(perEvent: string, global: string): string {
  return perEvent || global || 'No sound';
}

function workspaceDisplayName(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? path.basename(folder.uri.fsPath) : '';
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
