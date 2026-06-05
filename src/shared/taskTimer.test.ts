import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTaskStartPath, taskStartRoot } from './paths';
import {
  isExpired,
  isUnderThreshold,
  MARKER_MAX_AGE_MS,
  recordTaskStart,
  sanitiseSessionId,
  shouldSuppressForThreshold
} from './taskTimer';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => {
      throw new Error('ENOENT');
    }),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn()
  };
});

const { existsSync, readFileSync, writeFileSync } = await import('node:fs');
const existsSyncMock = vi.mocked(existsSync);
const readFileSyncMock = vi.mocked(readFileSync);
const writeFileSyncMock = vi.mocked(writeFileSync);

afterEach(() => {
  vi.clearAllMocks();
  existsSyncMock.mockReturnValue(false);
});

describe('sanitiseSessionId', () => {
  it('keeps allowed characters unchanged', () => {
    expect(sanitiseSessionId('Abc-1._2')).toBe('Abc-1._2');
  });

  it('strips characters outside [A-Za-z0-9._-]', () => {
    expect(sanitiseSessionId('a/b c!d')).toBe('abcd');
  });

  it('strips parent-directory traversal sequences', () => {
    expect(sanitiseSessionId('a..b')).toBe('ab');
    expect(sanitiseSessionId('..')).toBe('_');
  });

  it('falls back to a sentinel for empty/missing ids', () => {
    expect(sanitiseSessionId('')).toBe('_');
  });
});

describe('task-start path traversal', () => {
  it('a crafted session_id cannot escape the task-start directory', () => {
    const resolved = getTaskStartPath(sanitiseSessionId('../../escape'));
    expect(path.dirname(resolved)).toBe(taskStartRoot);
    expect(resolved.includes('..')).toBe(false);
    expect(path.basename(resolved)).toBe('escape.json');
  });
});

describe('isUnderThreshold', () => {
  it('is false when the threshold is disabled (<= 0)', () => {
    expect(isUnderThreshold(1000, 1500, 0)).toBe(false);
    expect(isUnderThreshold(1000, 1500, -5)).toBe(false);
  });

  it('is true only when the elapsed time is below threshold milliseconds', () => {
    expect(isUnderThreshold(1000, 1500, 1)).toBe(true);
    expect(isUnderThreshold(1000, 2000, 1)).toBe(false);
    expect(isUnderThreshold(1000, 5000, 1)).toBe(false);
  });
});

describe('isExpired', () => {
  it('is true only when the file is older than the max age', () => {
    const now = MARKER_MAX_AGE_MS * 2;
    expect(isExpired(now - MARKER_MAX_AGE_MS - 1, now, MARKER_MAX_AGE_MS)).toBe(true);
    expect(isExpired(now - MARKER_MAX_AGE_MS + 1, now, MARKER_MAX_AGE_MS)).toBe(false);
    expect(isExpired(now, now, MARKER_MAX_AGE_MS)).toBe(false);
  });
});

describe('shouldSuppressForThreshold', () => {
  const sessionId = 'sess';
  const markerPath = getTaskStartPath('sess');

  function stageMarker(startedAt: number): void {
    existsSyncMock.mockImplementation((p) => p === markerPath);
    readFileSyncMock.mockImplementation((p) => {
      if (p === markerPath) {
        return JSON.stringify({ startedAt, sessionId });
      }
      throw new Error('ENOENT');
    });
  }

  it('fails open when the threshold is disabled', () => {
    stageMarker(990);
    expect(shouldSuppressForThreshold(sessionId, 0, 1000)).toBe(false);
  });

  it('fails open when the marker is missing', () => {
    existsSyncMock.mockReturnValue(false);
    expect(shouldSuppressForThreshold(sessionId, 5, 1000)).toBe(false);
  });

  it('fails open when the marker is corrupt', () => {
    existsSyncMock.mockImplementation((p) => p === markerPath);
    readFileSyncMock.mockImplementation(() => 'not json');
    expect(shouldSuppressForThreshold(sessionId, 5, 1000)).toBe(false);
  });

  it('suppresses when the task ran shorter than the threshold', () => {
    stageMarker(1000);
    expect(shouldSuppressForThreshold(sessionId, 5, 1500)).toBe(true);
  });

  it('does not suppress when the task ran at least the threshold', () => {
    stageMarker(1000);
    expect(shouldSuppressForThreshold(sessionId, 5, 11000)).toBe(false);
  });
});

describe('recordTaskStart', () => {
  it('writes a per-session marker with the start timestamp', () => {
    recordTaskStart('sess', 1234);
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    const [file, contents] = writeFileSyncMock.mock.calls[0] ?? [];
    expect(file).toBe(getTaskStartPath('sess'));
    expect(JSON.parse(String(contents))).toMatchObject({ startedAt: 1234, sessionId: 'sess' });
  });

  it('writes inside the task-start directory even for a crafted session_id', () => {
    recordTaskStart('../../escape', 1);
    const [file] = writeFileSyncMock.mock.calls[0] ?? [];
    expect(path.dirname(String(file))).toBe(taskStartRoot);
    expect(String(file).includes('..')).toBe(false);
  });
});
