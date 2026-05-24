import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notify } from './notifierLinux';
import type { NormalisedEvent } from './types';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof cp>();
  return { ...actual, spawn: vi.fn() };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return { ...actual, existsSync: vi.fn() };
});

const baseEvent: NormalisedEvent = {
  cwd: '/tmp/repo',
  repo: 'repo',
  branch: 'main',
  event: 'Stop',
  eventLabel: 'Finished',
  notificationType: '',
  notificationMessage: '',
  sessionId: 'sess-1',
  transcriptPath: '/tmp/repo/.transcript',
  workspaceRoot: '/tmp/repo',
  clickedPath: '/tmp/state/clicked',
  signalPath: '/tmp/state/signal.json',
  title: 'Claude: repo',
  message: 'Finished · main',
  createdAt: '2026-05-24T00:00:00.000Z',
  raw: {}
};

const fakeChild = { on: () => fakeChild, unref: () => {} } as unknown as cp.ChildProcess;

describe('notifier (Linux)', () => {
  const spawnMock = vi.mocked(cp.spawn);
  const existsMock = vi.mocked(fs.existsSync);

  beforeEach(() => {
    spawnMock.mockReset();
    spawnMock.mockReturnValue(fakeChild);
    existsMock.mockReset();
    existsMock.mockReturnValue(true);
  });

  it('spawns notify-send with title, message, app-name, urgency and icon', () => {
    notify(baseEvent, { sound: 'Glass' });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd, args] = spawnMock.mock.calls[0] as [string, string[], unknown];
    expect(cmd).toBe('notify-send');
    expect(args).toContain('--app-name');
    expect(args).toContain('Claude Code SuperNotifier');
    expect(args).toContain('--urgency');
    expect(args).toContain('normal');
    expect(args).toContain('--icon');
    expect(args).toContain('Claude: repo');
    expect(args).toContain('Finished · main');
    expect(args.indexOf('Claude: repo')).toBeLessThan(args.indexOf('Finished · main'));
  });

  it('omits --icon when the staged icon is missing', () => {
    existsMock.mockReturnValue(false);

    notify(baseEvent, {});

    const [, args] = spawnMock.mock.calls[0] as [string, string[], unknown];
    expect(args).not.toContain('--icon');
  });

  it('uses notifyCommand override when provided', () => {
    notify(baseEvent, { notifyCommand: 'dunstify' });

    const [cmd] = spawnMock.mock.calls[0] as [string, string[], unknown];
    expect(cmd).toBe('dunstify');
  });

  it('ignores empty notifyCommand and falls back to notify-send', () => {
    notify(baseEvent, { notifyCommand: '   ' });

    const [cmd] = spawnMock.mock.calls[0] as [string, string[], unknown];
    expect(cmd).toBe('notify-send');
  });
});
