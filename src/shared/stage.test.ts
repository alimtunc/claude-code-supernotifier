import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStagePath, stageRoot } from './paths';
import {
  advanceStage,
  reasonForEvent,
  readStageState,
  shouldFire,
  type StageState,
  writeStageState
} from './stage';

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

describe('advanceStage', () => {
  it('bumps the stage id and clears fired reasons', () => {
    expect(advanceStage({ stageId: 2, firedReasons: ['done', 'input'] })).toEqual({
      stageId: 3,
      firedReasons: []
    });
  });
});

describe('shouldFire', () => {
  it('fires the first time a reason appears and records it in next', () => {
    const result = shouldFire({ stageId: 0, firedReasons: [] }, 'done');
    expect(result.fire).toBe(true);
    expect(result.next.firedReasons).toEqual(['done']);
  });

  it('does not fire a reason that already fired this stage', () => {
    const result = shouldFire({ stageId: 0, firedReasons: ['done'] }, 'done');
    expect(result.fire).toBe(false);
    expect(result.next.firedReasons).toEqual(['done']);
  });

  it('coalesces a repeated reason to exactly one fire within a stage', () => {
    let state: StageState = { stageId: 0, firedReasons: [] };
    const first = shouldFire(state, 'done');
    state = first.next;
    const second = shouldFire(state, 'done');
    expect(first.fire).toBe(true);
    expect(second.fire).toBe(false);
  });

  it('fires the same reason again after the stage advances', () => {
    let state: StageState = { stageId: 0, firedReasons: [] };
    state = shouldFire(state, 'done').next;
    state = advanceStage(state);
    expect(shouldFire(state, 'done').fire).toBe(true);
  });

  it('fires each distinct reason once within the same stage', () => {
    let state: StageState = { stageId: 0, firedReasons: [] };
    const done = shouldFire(state, 'done');
    state = done.next;
    const input = shouldFire(state, 'input');
    expect(done.fire).toBe(true);
    expect(input.fire).toBe(true);
  });
});

describe('reasonForEvent', () => {
  it('maps notifiable events to a small reason set', () => {
    expect(reasonForEvent('Stop', undefined)).toBe('done');
    expect(reasonForEvent('PermissionRequest', undefined)).toBe('input');
    expect(reasonForEvent('Notification', undefined)).toBe('input');
    expect(reasonForEvent('PreToolUse', 'AskUserQuestion')).toBe('question');
  });

  it('bypasses dedup (null) for SubagentStop and non-question events', () => {
    expect(reasonForEvent('SubagentStop', undefined)).toBeNull();
    expect(reasonForEvent('PreToolUse', 'Bash')).toBeNull();
    expect(reasonForEvent('UserPromptSubmit', undefined)).toBeNull();
  });
});

describe('readStageState', () => {
  it('fails open to a fresh stage when the file is missing', () => {
    existsSyncMock.mockReturnValue(false);
    expect(readStageState('sess')).toEqual({ stageId: 0, firedReasons: [] });
  });

  it('fails open to a fresh stage when the file is corrupt', () => {
    existsSyncMock.mockImplementation((p) => p === getStagePath('sess'));
    readFileSyncMock.mockImplementation(() => 'not json');
    expect(readStageState('sess')).toEqual({ stageId: 0, firedReasons: [] });
  });

  it('reads a persisted stage and keeps only string reasons', () => {
    existsSyncMock.mockImplementation((p) => p === getStagePath('sess'));
    readFileSyncMock.mockImplementation(() => JSON.stringify({ stageId: 4, firedReasons: ['done', 7] }));
    expect(readStageState('sess')).toEqual({ stageId: 4, firedReasons: ['done'] });
  });
});

describe('writeStageState', () => {
  it('persists the state inside the stage directory', () => {
    writeStageState('sess', { stageId: 1, firedReasons: ['done'] });
    const [file, contents] = writeFileSyncMock.mock.calls[0] ?? [];
    expect(file).toBe(getStagePath('sess'));
    expect(JSON.parse(String(contents))).toEqual({ stageId: 1, firedReasons: ['done'] });
  });

  it('cannot escape the stage directory with a crafted session_id', () => {
    writeStageState('../../escape', { stageId: 0, firedReasons: [] });
    const [file] = writeFileSyncMock.mock.calls[0] ?? [];
    expect(path.dirname(String(file))).toBe(stageRoot);
    expect(String(file).includes('..')).toBe(false);
  });
});
