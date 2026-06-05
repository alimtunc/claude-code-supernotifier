import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventLogPath } from '../shared/paths';
import { runHook } from './index';
import { notify } from './notifier';
import type { HookInputEvent } from './types';

vi.mock('./notifier', () => ({ notify: vi.fn() }));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => {
      throw new Error('ENOENT');
    }),
    statSync: vi.fn(() => {
      throw new Error('ENOENT');
    }),
    mkdirSync: vi.fn(),
    appendFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    renameSync: vi.fn()
  };
});

const { appendFileSync } = await import('node:fs');
const appendFileSyncMock = vi.mocked(appendFileSync);
const notifyMock = vi.mocked(notify);

const stopInput: HookInputEvent = { hook_event_name: 'Stop', cwd: '/tmp/repo', session_id: 'sess' };
const cmuxEnv = { CMUX_CLAUDE_HOOK_CMUX_BIN: '/usr/local/bin/cmux' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runHook — cmux output suppression (04 Part 3)', () => {
  it('appends the event to the log but suppresses notify inside cmux', () => {
    runHook(stopInput, [], cmuxEnv);
    expect(appendFileSyncMock.mock.calls.some(([file]) => file === eventLogPath)).toBe(true);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('notifies normally outside cmux', () => {
    runHook(stopInput, [], {});
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it('still notifies under --test even inside cmux', () => {
    runHook(stopInput, ['--test'], cmuxEnv);
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });
});
