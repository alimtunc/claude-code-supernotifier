import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stagedSoundPath } from '../shared/paths';
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

const FREEDESKTOP_MESSAGE = '/usr/share/sounds/freedesktop/stereo/message.oga';

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
  pidChain: [],
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

  it('spawns notify-send first with title, message, app-name, urgency and icon', () => {
    notify(baseEvent, { sound: 'Glass' });

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

  it('plays the freedesktop sound via paplay after notify-send', () => {
    notify(baseEvent, { sound: 'Glass' });

    expect(spawnMock).toHaveBeenCalledTimes(2);
    const [firstCmd] = spawnMock.mock.calls[0] as [string, string[], unknown];
    expect(firstCmd).toBe('notify-send');
    const [audioCmd, audioArgs] = spawnMock.mock.calls[1] as [string, string[], unknown];
    expect(audioCmd).toBe('paplay');
    expect(audioArgs).toEqual([FREEDESKTOP_MESSAGE]);
  });

  it('falls back to the staged WAV when the freedesktop sound is missing', () => {
    existsMock.mockImplementation((p) => !String(p).includes('freedesktop'));

    notify(baseEvent, { sound: 'Glass' });

    expect(spawnMock).toHaveBeenCalledTimes(2);
    const [audioCmd, audioArgs] = spawnMock.mock.calls[1] as [string, string[], unknown];
    expect(audioCmd).toBe('paplay');
    expect(audioArgs).toEqual([stagedSoundPath('done.wav')]);
  });

  it('plays no audio when the resolved sound is empty', () => {
    notify(baseEvent, { sound: '' });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd] = spawnMock.mock.calls[0] as [string, string[], unknown];
    expect(cmd).toBe('notify-send');
  });

  it('does not spawn at all when the resolved level is off', () => {
    notify(baseEvent, { sound: 'Glass', stopLevel: 'off' });

    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('shows the banner but plays no sound when the level is popup', () => {
    notify(baseEvent, { sound: 'Glass', stopLevel: 'popup' });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd] = spawnMock.mock.calls[0] as [string, string[], unknown];
    expect(cmd).toBe('notify-send');
  });

  it('plays no audio when neither the freedesktop sound nor the staged fallback exists', () => {
    existsMock.mockImplementation((p) => String(p).endsWith('icon.png'));

    notify(baseEvent, { sound: 'Glass' });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd] = spawnMock.mock.calls[0] as [string, string[], unknown];
    expect(cmd).toBe('notify-send');
  });

  it('retries with aplay once when paplay errors', () => {
    const erroringChild = {
      on: (eventName: string, cb: () => void) => {
        if (eventName === 'error') {
          cb();
        }
        return erroringChild;
      },
      unref: () => {}
    } as unknown as cp.ChildProcess;
    spawnMock.mockImplementation((cmd) => (cmd === 'paplay' ? erroringChild : fakeChild));

    notify(baseEvent, { sound: 'Glass' });

    const aplayCall = spawnMock.mock.calls.find((call) => call[0] === 'aplay');
    expect(aplayCall).toBeDefined();
    expect(aplayCall?.[1]).toEqual([FREEDESKTOP_MESSAGE]);
  });
});
