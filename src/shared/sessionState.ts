import { cwdInsideFolder } from './ownership';

export type SessionState = 'running' | 'waiting' | 'idle' | 'inactive';

export interface EventEntry {
  event: string;
  notificationType: string;
  cwd: string;
  workspaceRoot: string;
  sessionId: string;
  repo: string;
  branch: string;
  eventLabel: string;
  createdAt: string;
}

export interface DeriveOptions {
  events: readonly EventEntry[];
  workspaceRoot: string;
  now: Date;
  idleHideAfterMs: number;
}

export interface SessionSnapshot {
  state: SessionState;
  lastEvent: EventEntry | null;
  ageMs: number | null;
}

export const STATE_PRIORITY: Record<SessionState, number> = {
  waiting: 3,
  running: 2,
  idle: 1,
  inactive: 0
};

export function deriveSessionState(opts: DeriveOptions): SessionSnapshot {
  const candidates = opts.events.filter((entry) => belongsToWorkspace(entry, opts.workspaceRoot));
  if (candidates.length === 0) {
    return { state: 'inactive', lastEvent: null, ageMs: null };
  }

  const latest = candidates.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
  const parsedAt = Date.parse(latest.createdAt);
  const ageMs = Number.isFinite(parsedAt) ? opts.now.getTime() - parsedAt : null;
  const baseState = mapEventToState(latest);

  if (baseState === 'idle' && ageMs !== null && ageMs > opts.idleHideAfterMs) {
    return { state: 'inactive', lastEvent: latest, ageMs };
  }

  return { state: baseState, lastEvent: latest, ageMs };
}

export function pickHighestPriority(
  snapshots: readonly { workspaceRoot: string; snapshot: SessionSnapshot }[]
): { workspaceRoot: string; snapshot: SessionSnapshot } | null {
  if (snapshots.length === 0) {
    return null;
  }
  return snapshots.reduce((best, current) =>
    STATE_PRIORITY[current.snapshot.state] > STATE_PRIORITY[best.snapshot.state] ? current : best
  );
}

function mapEventToState(entry: EventEntry): SessionState {
  if (entry.event === 'Stop' || entry.event === 'SubagentStop') return 'idle';
  if (entry.event === 'Notification' || entry.event === 'PermissionRequest' || entry.event === 'PreToolUse') {
    return 'waiting';
  }
  if (entry.event === 'UserPromptSubmit') return 'running';
  return 'idle';
}

export function belongsToWorkspace(entry: EventEntry, workspaceRoot: string): boolean {
  if (!workspaceRoot) return false;
  if (entry.workspaceRoot === workspaceRoot) return true;
  return cwdInsideFolder(entry.cwd, workspaceRoot);
}
