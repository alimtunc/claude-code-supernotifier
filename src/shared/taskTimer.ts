import { tryReadJson, writeJson } from './json';
import { getTaskStartPath } from './paths';

const SESSION_ID_FALLBACK = '_';
export const MARKER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function sanitiseSessionId(id: string): string {
  let cleaned = (id || '').replace(/[^A-Za-z0-9._-]/g, '');
  while (cleaned.includes('..')) {
    cleaned = cleaned.replace(/\.\./g, '');
  }
  return cleaned || SESSION_ID_FALLBACK;
}

export function recordTaskStart(sessionId: string, now: number): void {
  try {
    writeJson(getTaskStartPath(sanitiseSessionId(sessionId)), { startedAt: now, sessionId });
  } catch {
    // Best-effort marker; never block the notification path.
  }
}

export function isUnderThreshold(startedAt: number, now: number, thresholdSec: number): boolean {
  if (thresholdSec <= 0) {
    return false;
  }
  return now - startedAt < thresholdSec * 1000;
}

export function shouldSuppressForThreshold(sessionId: string, thresholdSec: number, now: number): boolean {
  if (thresholdSec <= 0) {
    return false;
  }
  const startedAt = readStartedAt(sessionId);
  if (startedAt === null) {
    return false;
  }
  return isUnderThreshold(startedAt, now, thresholdSec);
}

export function isExpired(mtimeMs: number, now: number, maxAgeMs: number): boolean {
  return now - mtimeMs > maxAgeMs;
}

function readStartedAt(sessionId: string): number | null {
  const marker = tryReadJson<{ startedAt?: unknown }>(getTaskStartPath(sanitiseSessionId(sessionId)), {});
  return typeof marker.startedAt === 'number' && Number.isFinite(marker.startedAt) ? marker.startedAt : null;
}
