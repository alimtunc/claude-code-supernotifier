import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFocusedPath, mutedPath } from '../shared/paths';
import { normaliseEvent, shouldNotify } from './event';
import type { HookConfig } from './types';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, existsSync: vi.fn(() => false) };
});

const { existsSync } = await import('node:fs');
const existsSyncMock = vi.mocked(existsSync);

const baseConfig: HookConfig = {
  notifyOnStop: true,
  notifyOnAttention: true,
  includeBranch: true,
  titleTemplate: 'Claude: ${repo}',
  messageTemplate: '${eventLabel}${branchSuffix}',
  focusOnClick: false
};

describe('normaliseEvent', () => {
  it('renders title and message from templates', () => {
    const ev = normaliseEvent({ hook_event_name: 'Stop', cwd: '/tmp/myrepo' }, baseConfig);
    expect(ev.title).toBe('Claude: myrepo');
    expect(ev.message).toMatch(/^Finished/);
    expect(ev.event).toBe('Stop');
    expect(ev.repo).toBe('myrepo');
  });

  it('uses customRepoNames when present', () => {
    const ev = normaliseEvent(
      { hook_event_name: 'Stop', cwd: '/tmp/internal-name' },
      { ...baseConfig, customRepoNames: { 'internal-name': 'Public Name' } }
    );
    expect(ev.repo).toBe('Public Name');
    expect(ev.title).toBe('Claude: Public Name');
  });

  it('produces the permission_prompt label for Notification events', () => {
    const ev = normaliseEvent(
      { hook_event_name: 'Notification', notification_type: 'permission_prompt', cwd: '/tmp/r' },
      baseConfig
    );
    expect(ev.eventLabel).toBe('Permission required');
  });

  it('falls back to the notification message when type is unknown', () => {
    const ev = normaliseEvent(
      { hook_event_name: 'Notification', message: 'Custom thing', cwd: '/tmp/r' },
      baseConfig
    );
    expect(ev.eventLabel).toBe('Custom thing');
  });

  it('uses configured label overrides', () => {
    const ev = normaliseEvent(
      { hook_event_name: 'Stop', cwd: '/tmp/r' },
      { ...baseConfig, stopLabel: 'Réponse terminée' }
    );
    expect(ev.eventLabel).toBe('Réponse terminée');
  });

  it('uses configured attention fallback when notification message is empty', () => {
    const ev = normaliseEvent(
      { hook_event_name: 'Notification', cwd: '/tmp/r' },
      { ...baseConfig, attentionLabel: 'Heads up' }
    );
    expect(ev.eventLabel).toBe('Heads up');
  });

  it('produces the permission label for PermissionRequest events', () => {
    const ev = normaliseEvent({ hook_event_name: 'PermissionRequest', cwd: '/tmp/r' }, baseConfig);
    expect(ev.eventLabel).toBe('Permission required');
  });

  it('produces the question label for PreToolUse/AskUserQuestion events', () => {
    const ev = normaliseEvent(
      { hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', cwd: '/tmp/r' },
      baseConfig
    );
    expect(ev.eventLabel).toBe('Claude is asking a question');
  });

  it('produces the subagent-stop label for SubagentStop events', () => {
    const ev = normaliseEvent({ hook_event_name: 'SubagentStop', cwd: '/tmp/r' }, baseConfig);
    expect(ev.eventLabel).toBe('Subagent finished');
  });

  it('uses configured questionLabel/subagentStopLabel overrides', () => {
    expect(
      normaliseEvent(
        { hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', cwd: '/tmp/r' },
        { ...baseConfig, questionLabel: 'Question en attente' }
      ).eventLabel
    ).toBe('Question en attente');
    expect(
      normaliseEvent(
        { hook_event_name: 'SubagentStop', cwd: '/tmp/r' },
        { ...baseConfig, subagentStopLabel: 'Sous-agent terminé' }
      ).eventLabel
    ).toBe('Sous-agent terminé');
  });
});

describe('shouldNotify', () => {
  const stopEvent = normaliseEvent({ hook_event_name: 'Stop', cwd: '/tmp/repo' }, baseConfig);
  const notifEvent = normaliseEvent({ hook_event_name: 'Notification', cwd: '/tmp/repo' }, baseConfig);

  afterEach(() => {
    existsSyncMock.mockReturnValue(false);
  });

  it('respects notifyOnStop', () => {
    expect(shouldNotify(stopEvent, { ...baseConfig, notifyOnStop: false })).toBe(false);
    expect(shouldNotify(stopEvent, { ...baseConfig, notifyOnStop: true })).toBe(true);
  });

  it('respects notifyOnAttention', () => {
    expect(shouldNotify(notifEvent, { ...baseConfig, notifyOnAttention: false })).toBe(false);
    expect(shouldNotify(notifEvent, { ...baseConfig, notifyOnAttention: true })).toBe(true);
  });

  it('blocks repos missing from allowedRepos', () => {
    expect(shouldNotify(stopEvent, { ...baseConfig, allowedRepos: ['other'] })).toBe(false);
    expect(shouldNotify(stopEvent, { ...baseConfig, allowedRepos: ['repo'] })).toBe(true);
  });

  it('returns false for unknown events', () => {
    const evt = normaliseEvent({ hook_event_name: 'Custom', cwd: '/tmp/repo' }, baseConfig);
    expect(shouldNotify(evt, baseConfig)).toBe(false);
  });

  it('suppresses notifications when the matching VSCode window is focused', () => {
    existsSyncMock.mockImplementation((p) => p === getFocusedPath(stopEvent.workspaceRoot));
    expect(shouldNotify(stopEvent, baseConfig)).toBe(false);
  });

  it('notifies when no window is focused on the workspace', () => {
    existsSyncMock.mockReturnValue(false);
    expect(shouldNotify(stopEvent, baseConfig)).toBe(true);
  });
});

describe('shouldNotify — file-based mute', () => {
  afterEach(() => {
    existsSyncMock.mockReturnValue(false);
  });

  it('returns false for every event type when the mute file exists', () => {
    existsSyncMock.mockImplementation((p) => p === mutedPath);
    const events = {
      stop: normaliseEvent({ hook_event_name: 'Stop', cwd: '/tmp/repo' }, baseConfig),
      notif: normaliseEvent({ hook_event_name: 'Notification', cwd: '/tmp/repo' }, baseConfig),
      perm: normaliseEvent({ hook_event_name: 'PermissionRequest', cwd: '/tmp/repo' }, baseConfig),
      question: normaliseEvent(
        { hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', cwd: '/tmp/repo' },
        baseConfig
      ),
      sub: normaliseEvent({ hook_event_name: 'SubagentStop', cwd: '/tmp/repo' }, baseConfig)
    };
    expect(shouldNotify(events.stop, { ...baseConfig, notifyOnStop: true })).toBe(false);
    expect(shouldNotify(events.notif, { ...baseConfig, notifyOnAttention: true })).toBe(false);
    expect(shouldNotify(events.perm, { ...baseConfig, notifyOnAttention: true })).toBe(false);
    expect(shouldNotify(events.question, { ...baseConfig, notifyOnAttention: true })).toBe(false);
    expect(shouldNotify(events.sub, { ...baseConfig, notifyOnSubagentStop: true })).toBe(false);
  });

  it('overrides the allow-list: mute wins even when the repo is allow-listed', () => {
    existsSyncMock.mockImplementation((p) => p === mutedPath);
    const stop = normaliseEvent({ hook_event_name: 'Stop', cwd: '/tmp/repo' }, baseConfig);
    expect(shouldNotify(stop, { ...baseConfig, allowedRepos: ['repo'] })).toBe(false);
  });

  it('does not affect events when the mute file is absent', () => {
    existsSyncMock.mockReturnValue(false);
    const stop = normaliseEvent({ hook_event_name: 'Stop', cwd: '/tmp/repo' }, baseConfig);
    expect(shouldNotify(stop, baseConfig)).toBe(true);
  });
});

describe('shouldNotify — permission & question (Part 1)', () => {
  const permissionEvent = normaliseEvent(
    { hook_event_name: 'PermissionRequest', cwd: '/tmp/repo' },
    baseConfig
  );
  const questionEvent = normaliseEvent(
    { hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', cwd: '/tmp/repo' },
    baseConfig
  );

  afterEach(() => {
    existsSyncMock.mockReturnValue(false);
  });

  it('banners a PermissionRequest gated by notifyOnAttention', () => {
    expect(shouldNotify(permissionEvent, { ...baseConfig, notifyOnAttention: true })).toBe(true);
    expect(shouldNotify(permissionEvent, { ...baseConfig, notifyOnAttention: false })).toBe(false);
  });

  it('banners a PreToolUse/AskUserQuestion event gated by notifyOnAttention', () => {
    expect(shouldNotify(questionEvent, { ...baseConfig, notifyOnAttention: true })).toBe(true);
    expect(shouldNotify(questionEvent, { ...baseConfig, notifyOnAttention: false })).toBe(false);
  });

  it('does not banner a PreToolUse event for other tools', () => {
    const other = normaliseEvent(
      { hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: '/tmp/repo' },
      baseConfig
    );
    expect(shouldNotify(other, baseConfig)).toBe(false);
  });

  it('does not double-fire: a PermissionRequest whose tool is AskUserQuestion is dropped', () => {
    const perm = normaliseEvent(
      { hook_event_name: 'PermissionRequest', tool_name: 'AskUserQuestion', cwd: '/tmp/repo' },
      baseConfig
    );
    expect(shouldNotify(perm, baseConfig)).toBe(false);
  });

  it('short-circuits permission/question events when the window is focused', () => {
    existsSyncMock.mockImplementation((p) => p === getFocusedPath(permissionEvent.workspaceRoot));
    expect(shouldNotify(permissionEvent, baseConfig)).toBe(false);
    expect(shouldNotify(questionEvent, baseConfig)).toBe(false);
  });
});

describe('shouldNotify — SubagentStop (Part 2)', () => {
  const subagentEvent = normaliseEvent({ hook_event_name: 'SubagentStop', cwd: '/tmp/repo' }, baseConfig);

  afterEach(() => {
    existsSyncMock.mockReturnValue(false);
  });

  it('does not banner by default or when notifyOnSubagentStop is omitted', () => {
    expect(shouldNotify(subagentEvent, baseConfig)).toBe(false);
    expect(shouldNotify(subagentEvent, { ...baseConfig, notifyOnSubagentStop: undefined })).toBe(false);
  });

  it('banners only when notifyOnSubagentStop === true', () => {
    expect(shouldNotify(subagentEvent, { ...baseConfig, notifyOnSubagentStop: true })).toBe(true);
    expect(shouldNotify(subagentEvent, { ...baseConfig, notifyOnSubagentStop: false })).toBe(false);
  });
});

describe('shouldNotify — subagent interaction suppression (Part 3)', () => {
  const permFromSubagent = normaliseEvent(
    { hook_event_name: 'PermissionRequest', cwd: '/tmp/repo', agent_id: 'agent-123' },
    baseConfig
  );
  const questionFromSubagent = normaliseEvent(
    { hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', cwd: '/tmp/repo', agent_id: 'agent-123' },
    baseConfig
  );

  afterEach(() => {
    existsSyncMock.mockReturnValue(false);
  });

  it('drops a subagent PermissionRequest by default (suppress omitted or true)', () => {
    expect(shouldNotify(permFromSubagent, baseConfig)).toBe(false);
    expect(shouldNotify(permFromSubagent, { ...baseConfig, suppressSubagentInteractions: true })).toBe(false);
  });

  it('drops a subagent PreToolUse/AskUserQuestion by default', () => {
    expect(shouldNotify(questionFromSubagent, baseConfig)).toBe(false);
  });

  it('falls through to the Part 1 banner when suppression is disabled', () => {
    expect(
      shouldNotify(permFromSubagent, {
        ...baseConfig,
        suppressSubagentInteractions: false,
        notifyOnAttention: true
      })
    ).toBe(true);
    expect(
      shouldNotify(questionFromSubagent, {
        ...baseConfig,
        suppressSubagentInteractions: false,
        notifyOnAttention: true
      })
    ).toBe(true);
  });

  it('leaves top-level interactions (no agent_id or empty) unaffected', () => {
    const topPerm = normaliseEvent({ hook_event_name: 'PermissionRequest', cwd: '/tmp/repo' }, baseConfig);
    const emptyAgent = normaliseEvent(
      { hook_event_name: 'PermissionRequest', cwd: '/tmp/repo', agent_id: '' },
      baseConfig
    );
    expect(shouldNotify(topPerm, baseConfig)).toBe(true);
    expect(shouldNotify(emptyAgent, baseConfig)).toBe(true);
  });

  it('does not suppress Stop/Notification/SubagentStop even with an agent_id', () => {
    const stop = normaliseEvent(
      { hook_event_name: 'Stop', cwd: '/tmp/repo', agent_id: 'agent-1' },
      baseConfig
    );
    const notif = normaliseEvent(
      { hook_event_name: 'Notification', cwd: '/tmp/repo', agent_id: 'agent-1' },
      baseConfig
    );
    const sub = normaliseEvent(
      { hook_event_name: 'SubagentStop', cwd: '/tmp/repo', agent_id: 'agent-1' },
      baseConfig
    );
    expect(shouldNotify(stop, baseConfig)).toBe(true);
    expect(shouldNotify(notif, baseConfig)).toBe(true);
    expect(shouldNotify(sub, { ...baseConfig, notifyOnSubagentStop: true })).toBe(true);
  });
});
