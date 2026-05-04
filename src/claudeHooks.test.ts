import { describe, expect, it } from 'vitest';
import {
  applyInstallToSettings,
  applyUninstallFromSettings,
  quoteForShell,
  settingsContainsHook
} from './claudeHooks';
import type { ClaudeSettings } from './types';

const COMMAND = quoteForShell('/Users/alice/.supernotify/supernotify-hook.js');

describe('quoteForShell', () => {
  it('wraps the path in single quotes', () => {
    expect(quoteForShell('/tmp/foo')).toBe(`'/tmp/foo'`);
  });

  it('escapes embedded single quotes', () => {
    expect(quoteForShell(`/tmp/it's`)).toBe(`'/tmp/it'\\''s'`);
  });
});

describe('applyInstallToSettings', () => {
  it('creates Stop, Notification and PermissionRequest hooks on an empty settings file', () => {
    const next = applyInstallToSettings({}, COMMAND);
    expect(next.hooks).toBeDefined();
    expect(next.hooks?.Stop?.[0]?.hooks?.[0]).toEqual({ type: 'command', command: COMMAND });
    expect(next.hooks?.Notification?.[0]?.matcher).toBe('permission_prompt|idle_prompt');
    expect(next.hooks?.PermissionRequest?.[0]?.hooks?.[0]?.command).toBe(COMMAND);
  });

  it('is idempotent across repeated installs', () => {
    const first = applyInstallToSettings({}, COMMAND);
    const second = applyInstallToSettings(first, COMMAND);
    expect(second).toEqual(first);
  });

  it('preserves unrelated user hooks', () => {
    const initial: ClaudeSettings = {
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: 'my-existing-hook' }] }]
      }
    };
    const next = applyInstallToSettings(initial, COMMAND);
    const stopHooks = next.hooks?.Stop?.[0]?.hooks ?? [];
    expect(stopHooks.some((h) => h.command === 'my-existing-hook')).toBe(true);
    expect(stopHooks.some((h) => h.command === COMMAND)).toBe(true);
  });

  it('replaces previously-known third-party notification hooks', () => {
    const initial: ClaudeSettings = {
      hooks: {
        Stop: [
          {
            hooks: [
              { type: 'command', command: '/Users/alice/.cache/dimokol.claude-notifications/run.sh' },
              { type: 'command', command: 'unrelated' }
            ]
          }
        ]
      }
    };
    const next = applyInstallToSettings(initial, COMMAND);
    const commands = next.hooks?.Stop?.flatMap((g) => g.hooks ?? []).map((h) => h.command) ?? [];
    expect(commands).not.toContain('/Users/alice/.cache/dimokol.claude-notifications/run.sh');
    expect(commands).toContain('unrelated');
    expect(commands).toContain(COMMAND);
  });

  it('does not mutate the input settings', () => {
    const initial: ClaudeSettings = { hooks: { Stop: [] } };
    const snapshot = JSON.stringify(initial);
    applyInstallToSettings(initial, COMMAND);
    expect(JSON.stringify(initial)).toBe(snapshot);
  });
});

describe('applyUninstallFromSettings', () => {
  it('removes managed hooks while preserving foreign ones', () => {
    const installed = applyInstallToSettings(
      {
        hooks: {
          Stop: [{ hooks: [{ type: 'command', command: 'foreign' }] }]
        }
      },
      COMMAND
    );

    const next = applyUninstallFromSettings(installed, COMMAND);
    const stop = next.hooks?.Stop ?? [];
    expect(stop.flatMap((g) => g.hooks ?? []).every((h) => h.command !== COMMAND)).toBe(true);
    expect(stop.flatMap((g) => g.hooks ?? []).some((h) => h.command === 'foreign')).toBe(true);
  });

  it('removes empty hook event arrays after uninstall', () => {
    const installed = applyInstallToSettings({}, COMMAND);
    const next = applyUninstallFromSettings(installed, COMMAND);
    expect(next.hooks).toBeUndefined();
  });
});

describe('settingsContainsHook', () => {
  it('returns true after install, false after uninstall', () => {
    const installed = applyInstallToSettings({}, COMMAND);
    expect(settingsContainsHook(installed, COMMAND)).toBe(true);

    const removed = applyUninstallFromSettings(installed, COMMAND);
    expect(settingsContainsHook(removed, COMMAND)).toBe(false);
  });

  it('returns false on settings without hooks', () => {
    expect(settingsContainsHook({}, COMMAND)).toBe(false);
  });
});
