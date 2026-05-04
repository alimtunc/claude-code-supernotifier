import * as cp from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyMacOS } from './notifier';
import type { HookConfig, NormalisedEvent } from './types';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof cp>();
  return { ...actual, spawn: vi.fn() };
});

const baseEvent: NormalisedEvent = {
  cwd: '/tmp/repo',
  repo: 'repo',
  branch: 'main',
  event: 'Stop',
  eventLabel: 'Réponse terminée',
  notificationType: '',
  notificationMessage: '',
  sessionId: 'sess-1',
  transcriptPath: '/tmp/repo/.transcript',
  workspaceRoot: '/tmp/repo',
  clickedPath: '/tmp/state/clicked',
  signalPath: '/tmp/state/signal.json',
  title: 'Claude: repo',
  message: 'Réponse terminée · main',
  createdAt: '2026-05-04T00:00:00.000Z',
  raw: {}
};

const fakeChild = { on: () => fakeChild, unref: () => {} } as unknown as cp.ChildProcess;

describe('notifyMacOS', () => {
  let originalPlatform: PropertyDescriptor | undefined;
  const spawnMock = vi.mocked(cp.spawn);

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    spawnMock.mockReset();
    spawnMock.mockReturnValue(fakeChild);
  });

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  it('skips on non-darwin platforms', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });

    notifyMacOS(baseEvent, { notifierBinaryPath: '/tmp/bin' });

    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('does nothing when notifierBinaryPath is missing', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    notifyMacOS(baseEvent, {});

    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('spawns the swift binary with the expected CLI args', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    const config: HookConfig = {
      notifierBinaryPath: '/tmp/bundle/ClaudeCodeSupernotifier',
      sound: 'Glass',
      focusOnClick: true
    };

    notifyMacOS(baseEvent, config);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd, args] = spawnMock.mock.calls[0] as [string, string[], unknown];
    expect(cmd).toBe('/tmp/bundle/ClaudeCodeSupernotifier');
    expect(args).toContain('--title');
    expect(args).toContain('Claude: repo');
    expect(args).toContain('--message');
    expect(args).toContain('Réponse terminée · main');
    expect(args).toContain('--sound');
    expect(args).toContain('Glass');
    expect(args).toContain('--group');
    expect(args).toContain('sess-1');
    expect(args).toContain('--signal-path');
    expect(args).toContain('/tmp/state/signal.json');
    expect(args).toContain('--click-touch');
    expect(args).toContain('/tmp/state/clicked');
  });

  it('omits click-touch when focusOnClick is false', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    notifyMacOS(baseEvent, {
      notifierBinaryPath: '/tmp/bundle/ClaudeCodeSupernotifier',
      focusOnClick: false
    });

    const [, args] = spawnMock.mock.calls[0] as [string, string[], unknown];
    expect(args).not.toContain('--click-touch');
  });
});
