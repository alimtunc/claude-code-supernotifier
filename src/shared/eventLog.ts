import * as fs from 'node:fs';
import { eventLogPath } from './paths';
import type { EventEntry } from './sessionState';

const DEFAULT_MAX_LINES = 500;

export function readRecentEvents(maxLines = DEFAULT_MAX_LINES, logPath = eventLogPath): EventEntry[] {
  let content: string;
  try {
    content = fs.readFileSync(logPath, 'utf8');
  } catch {
    return [];
  }

  const lines = content.split('\n').filter((line) => line.trim().length > 0);
  const tail = lines.slice(-maxLines);
  const out: EventEntry[] = [];
  for (const line of tail) {
    const entry = parseLine(line);
    if (entry) out.push(entry);
  }
  return out;
}

function parseLine(line: string): EventEntry | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.event !== 'string' || typeof obj.createdAt !== 'string') return null;
  return {
    event: obj.event,
    notificationType: pickString(obj.notificationType),
    cwd: pickString(obj.cwd),
    workspaceRoot: pickString(obj.workspaceRoot),
    sessionId: pickString(obj.sessionId),
    repo: pickString(obj.repo),
    branch: pickString(obj.branch),
    eventLabel: pickString(obj.eventLabel),
    createdAt: obj.createdAt
  };
}

function pickString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
