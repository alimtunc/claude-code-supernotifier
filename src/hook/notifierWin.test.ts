import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildToastScript, notify } from './notifierWin';
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
  cwd: 'C:\\repo',
  repo: 'repo',
  branch: 'main',
  event: 'Stop',
  eventLabel: 'Finished',
  notificationType: '',
  notificationMessage: '',
  sessionId: 'sess-1',
  transcriptPath: 'C:\\repo\\.transcript',
  workspaceRoot: 'C:\\repo',
  clickedPath: 'C:\\state\\clicked',
  signalPath: 'C:\\state\\signal.json',
  title: 'Claude: repo',
  message: 'Finished · main',
  createdAt: '2026-05-24T00:00:00.000Z',
  raw: {}
};

const fakeChild = { on: () => fakeChild, unref: () => {} } as unknown as cp.ChildProcess;

describe('notifier (Windows)', () => {
  const spawnMock = vi.mocked(cp.spawn);
  const existsMock = vi.mocked(fs.existsSync);

  beforeEach(() => {
    spawnMock.mockReset();
    spawnMock.mockReturnValue(fakeChild);
    existsMock.mockReset();
    existsMock.mockReturnValue(true);
  });

  it('spawns powershell with the toast script', () => {
    notify(baseEvent, { sound: 'Glass' });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd, args] = spawnMock.mock.calls[0] as [string, string[], unknown];
    expect(cmd).toBe('powershell');
    expect(args[0]).toBe('-NoProfile');
    expect(args).toContain('-ExecutionPolicy');
    expect(args).toContain('Bypass');
    expect(args).toContain('-Command');
    const script = args[args.length - 1] as string;
    expect(script).toContain('Windows.UI.Notifications.ToastNotificationManager');
    expect(script).toContain('ToastGeneric');
    expect(script).toContain('<text>Claude: repo</text>');
    expect(script).toContain('<text>Finished · main</text>');
    expect(script).toContain("CreateToastNotifier('ClaudeCodeSupernotifier')");
  });

  it('uses notifyCommand override when provided', () => {
    notify(baseEvent, { notifyCommand: 'pwsh' });

    const [cmd] = spawnMock.mock.calls[0] as [string, string[], unknown];
    expect(cmd).toBe('pwsh');
  });

  describe('buildToastScript', () => {
    it('embeds the default audio when sound is non-empty', () => {
      const script = buildToastScript(baseEvent, { sound: 'Glass' });
      expect(script).toContain('<audio src="ms-winsoundevent:Notification.Default"/>');
    });

    it('emits silent audio when sound is an empty string', () => {
      const script = buildToastScript(baseEvent, { sound: '' });
      expect(script).toContain('<audio silent="true"/>');
    });

    it('honours a per-event override when the global sound is empty', () => {
      const script = buildToastScript(
        { ...baseEvent, event: 'PreToolUse' },
        { sound: '', questionSound: 'Funk' }
      );
      expect(script).toContain('<audio src="ms-winsoundevent:Notification.Default"/>');
    });

    it('XML-escapes title and message', () => {
      const script = buildToastScript(
        { ...baseEvent, title: 'A & B <c>', message: 'd > "e"' },
        { sound: 'Glass' }
      );
      expect(script).toContain('<text>A &amp; B &lt;c&gt;</text>');
      expect(script).toContain('<text>d &gt; &quot;e&quot;</text>');
    });

    it('escapes single quotes for PowerShell embedding', () => {
      const script = buildToastScript({ ...baseEvent, title: "it's" }, { sound: 'Glass' });
      expect(script).toContain('<text>it&apos;s</text>');
      expect(script).not.toMatch(/<text>it'/);
    });

    it('includes the staged icon when present', () => {
      existsMock.mockReturnValue(true);
      const script = buildToastScript(baseEvent, { sound: 'Glass' });
      expect(script).toContain('placement="appLogoOverride"');
      expect(script).toContain('file://');
    });

    it('omits the icon image tag when the icon file is missing', () => {
      existsMock.mockReturnValue(false);
      const script = buildToastScript(baseEvent, { sound: 'Glass' });
      expect(script).not.toContain('placement="appLogoOverride"');
    });
  });
});
