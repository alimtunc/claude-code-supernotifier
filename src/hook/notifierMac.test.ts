import * as cp from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notify as notifyMacOS } from './notifierMac';
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
  createdAt: '2026-05-04T00:00:00.000Z',
  raw: {}
};

const fakeChild = { on: () => fakeChild, unref: () => {} } as unknown as cp.ChildProcess;

describe('notifier (macOS)', () => {
  const spawnMock = vi.mocked(cp.spawn);

  beforeEach(() => {
    spawnMock.mockReset();
    spawnMock.mockReturnValue(fakeChild);
  });

  it('does nothing when notifierBinaryPath is missing', () => {
    notifyMacOS(baseEvent, {});

    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('spawns the swift binary with the expected CLI args', () => {
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
    expect(args).toContain('Finished · main');
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
    notifyMacOS(baseEvent, {
      notifierBinaryPath: '/tmp/bundle/ClaudeCodeSupernotifier',
      focusOnClick: false
    });

    const [, args] = spawnMock.mock.calls[0] as [string, string[], unknown];
    expect(args).not.toContain('--click-touch');
  });

  it('omits --style when notificationStyle is system (default)', () => {
    notifyMacOS(baseEvent, {
      notifierBinaryPath: '/tmp/bundle/ClaudeCodeSupernotifier',
      notificationStyle: 'system'
    });

    const [, args] = spawnMock.mock.calls[0] as [string, string[], unknown];
    expect(args).not.toContain('--style');
  });

  it('passes --style banner when notificationStyle is banner', () => {
    notifyMacOS(baseEvent, {
      notifierBinaryPath: '/tmp/bundle/ClaudeCodeSupernotifier',
      notificationStyle: 'banner'
    });

    const [, args] = spawnMock.mock.calls[0] as [string, string[], unknown];
    expect(args).toContain('--style');
    expect(args).toContain('banner');
  });
});
