import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyInstallToSettings,
  applyUninstallFromSettings,
  quoteForShell,
  settingsContainsHook
} from './claudeHooks';
import type { ClaudeSettings } from './types';

const COMMAND = quoteForShell('/Users/alice/.claude-code-supernotifier/hook.js');

describe('quoteForShell', () => {
  it('wraps the normalized path in single quotes', () => {
    expect(quoteForShell('/tmp/foo')).toBe(`'${path.normalize('/tmp/foo')}'`);
  });

  it('escapes embedded single quotes', () => {
    expect(quoteForShell(`/tmp/it's`)).toContain(`'\\''`);
  });
});

describe('applyInstallToSettings', () => {
  it('creates Stop, Notification, PermissionRequest and UserPromptSubmit hooks on an empty settings file', () => {
    const next = applyInstallToSettings({}, COMMAND);
    expect(next.hooks).toBeDefined();
    expect(next.hooks?.Stop?.[0]?.hooks?.[0]).toEqual({ type: 'command', command: COMMAND });
    expect(next.hooks?.Notification?.[0]?.matcher).toBe('permission_prompt|idle_prompt');
    expect(next.hooks?.PermissionRequest?.[0]?.hooks?.[0]?.command).toBe(COMMAND);
    expect(next.hooks?.UserPromptSubmit?.[0]?.hooks?.[0]?.command).toBe(COMMAND);
  });

  it('creates a PreToolUse (AskUserQuestion matcher) group and a SubagentStop group', () => {
    const next = applyInstallToSettings({}, COMMAND);
    expect(next.hooks?.PreToolUse?.[0]?.matcher).toBe('AskUserQuestion');
    expect(next.hooks?.PreToolUse?.[0]?.hooks?.[0]?.command).toBe(COMMAND);
    expect(next.hooks?.SubagentStop?.[0]?.matcher).toBeUndefined();
    expect(next.hooks?.SubagentStop?.[0]?.hooks?.[0]?.command).toBe(COMMAND);
  });

  it('preserves existing PreToolUse groups with other matchers', () => {
    const initial: ClaudeSettings = {
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-bash-hook' }] }]
      }
    };
    const next = applyInstallToSettings(initial, COMMAND);
    const bash = next.hooks?.PreToolUse?.find((g) => g.matcher === 'Bash');
    const question = next.hooks?.PreToolUse?.find((g) => g.matcher === 'AskUserQuestion');
    expect(bash?.hooks?.some((h) => h.command === 'my-bash-hook')).toBe(true);
    expect(question?.hooks?.[0]?.command).toBe(COMMAND);
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

  it('removes the PreToolUse and SubagentStop groups while preserving foreign PreToolUse matchers', () => {
    const initial: ClaudeSettings = {
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-bash-hook' }] }]
      }
    };
    const installed = applyInstallToSettings(initial, COMMAND);
    const next = applyUninstallFromSettings(installed, COMMAND);
    expect(next.hooks?.SubagentStop).toBeUndefined();
    expect(next.hooks?.PreToolUse?.find((g) => g.matcher === 'AskUserQuestion')).toBeUndefined();
    const bash = next.hooks?.PreToolUse?.find((g) => g.matcher === 'Bash');
    expect(bash?.hooks?.some((h) => h.command === 'my-bash-hook')).toBe(true);
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
