import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFocusedPath, getStagePath, getTaskStartPath, mutedPath } from '../shared/paths';
import { normaliseEvent, shouldNotify } from './event';
import type { HookConfig } from './types';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => {
      throw new Error('ENOENT');
    })
  };
});

vi.mock('./pid', () => ({ getAncestorPids: vi.fn(() => []) }));
vi.mock('./ownership', () => ({ readMarkers: vi.fn(() => []) }));

const { existsSync, readFileSync } = await import('node:fs');
const existsSyncMock = vi.mocked(existsSync);
const readFileSyncMock = vi.mocked(readFileSync);
const { getAncestorPids } = await import('./pid');
const { readMarkers } = await import('./ownership');
const getAncestorPidsMock = vi.mocked(getAncestorPids);
const readMarkersMock = vi.mocked(readMarkers);

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

describe('normaliseEvent — pidChain capture (05 Part 2)', () => {
  afterEach(() => {
    getAncestorPidsMock.mockReturnValue([]);
  });

  it('captures the ancestor chain for clickable banner events', () => {
    getAncestorPidsMock.mockReturnValue([42, 7]);
    expect(normaliseEvent({ hook_event_name: 'Stop', cwd: '/tmp/r' }, baseConfig).pidChain).toEqual([42, 7]);
    expect(
      normaliseEvent({ hook_event_name: 'PermissionRequest', cwd: '/tmp/r' }, baseConfig).pidChain
    ).toEqual([42, 7]);
    expect(
      normaliseEvent(
        { hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', cwd: '/tmp/r' },
        baseConfig
      ).pidChain
    ).toEqual([42, 7]);
  });

  it('leaves pidChain empty for events that do not drive clickable banners', () => {
    getAncestorPidsMock.mockReturnValue([42, 7]);
    expect(normaliseEvent({ hook_event_name: 'Notification', cwd: '/tmp/r' }, baseConfig).pidChain).toEqual(
      []
    );
    expect(normaliseEvent({ hook_event_name: 'SubagentStop', cwd: '/tmp/r' }, baseConfig).pidChain).toEqual(
      []
    );
    expect(
      normaliseEvent({ hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: '/tmp/r' }, baseConfig).pidChain
    ).toEqual([]);
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

describe('shouldNotify — per-event levels (03 Part 2)', () => {
  const stopEvent = normaliseEvent({ hook_event_name: 'Stop', cwd: '/tmp/repo' }, baseConfig);
  const permissionEvent = normaliseEvent(
    { hook_event_name: 'PermissionRequest', cwd: '/tmp/repo' },
    baseConfig
  );
  const questionEvent = normaliseEvent(
    { hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', cwd: '/tmp/repo' },
    baseConfig
  );
  const subagentEvent = normaliseEvent({ hook_event_name: 'SubagentStop', cwd: '/tmp/repo' }, baseConfig);

  afterEach(() => {
    existsSyncMock.mockReturnValue(false);
  });

  it('shows the banner for sound+popup and popup, suppresses it for sound and off', () => {
    expect(shouldNotify(stopEvent, { ...baseConfig, stopLevel: 'sound+popup' })).toBe(true);
    expect(shouldNotify(stopEvent, { ...baseConfig, stopLevel: 'popup' })).toBe(true);
    expect(shouldNotify(stopEvent, { ...baseConfig, stopLevel: 'sound' })).toBe(false);
    expect(shouldNotify(stopEvent, { ...baseConfig, stopLevel: 'off' })).toBe(false);
  });

  it('gates permission, question and subagent banners on their level', () => {
    expect(shouldNotify(permissionEvent, { ...baseConfig, permissionLevel: 'sound' })).toBe(false);
    expect(shouldNotify(permissionEvent, { ...baseConfig, permissionLevel: 'popup' })).toBe(true);
    expect(shouldNotify(questionEvent, { ...baseConfig, questionLevel: 'off' })).toBe(false);
    expect(shouldNotify(questionEvent, { ...baseConfig, questionLevel: 'sound+popup' })).toBe(true);
    expect(shouldNotify(subagentEvent, { ...baseConfig, subagentStopLevel: 'popup' })).toBe(true);
    expect(shouldNotify(subagentEvent, { ...baseConfig, subagentStopLevel: 'off' })).toBe(false);
  });

  it('prefers the explicit level over the legacy boolean', () => {
    expect(shouldNotify(stopEvent, { ...baseConfig, notifyOnStop: true, stopLevel: 'off' })).toBe(false);
    expect(shouldNotify(stopEvent, { ...baseConfig, notifyOnStop: false, stopLevel: 'popup' })).toBe(true);
  });

  it('falls back to the legacy booleans when no level is set (back-compat)', () => {
    expect(shouldNotify(stopEvent, { ...baseConfig, notifyOnStop: false })).toBe(false);
    expect(shouldNotify(stopEvent, { ...baseConfig, notifyOnStop: true })).toBe(true);
    expect(shouldNotify(permissionEvent, { ...baseConfig, notifyOnAttention: false })).toBe(false);
  });
});

describe('shouldNotify — minimum task-duration threshold (04 Part 1)', () => {
  const stop = normaliseEvent({ hook_event_name: 'Stop', cwd: '/tmp/repo', session_id: 'sess' }, baseConfig);
  const markerPath = getTaskStartPath('sess');

  function stageMarker(startedAt: number): void {
    existsSyncMock.mockImplementation((p) => p === markerPath);
    readFileSyncMock.mockImplementation((p) => {
      if (p === markerPath) {
        return JSON.stringify({ startedAt, sessionId: 'sess' });
      }
      throw new Error('ENOENT');
    });
  }

  afterEach(() => {
    existsSyncMock.mockReturnValue(false);
    readFileSyncMock.mockImplementation(() => {
      throw new Error('ENOENT');
    });
  });

  it('does not suppress when the threshold is disabled (default 0)', () => {
    stageMarker(Date.now() - 100);
    expect(shouldNotify(stop, { ...baseConfig, notifyOnStop: true })).toBe(true);
  });

  it('suppresses a sub-threshold Stop when a recent marker exists', () => {
    stageMarker(Date.now() - 100);
    expect(shouldNotify(stop, { ...baseConfig, notifyOnStop: true, minTaskDurationSeconds: 5 })).toBe(false);
  });

  it('fires once the task has run at least the threshold', () => {
    stageMarker(Date.now() - 10_000);
    expect(shouldNotify(stop, { ...baseConfig, notifyOnStop: true, minTaskDurationSeconds: 5 })).toBe(true);
  });

  it('fails open and fires when the marker is missing', () => {
    existsSyncMock.mockReturnValue(false);
    expect(shouldNotify(stop, { ...baseConfig, notifyOnStop: true, minTaskDurationSeconds: 5 })).toBe(true);
  });
});

describe('shouldNotify — per-session stage dedup (04 Part 2)', () => {
  const stop = normaliseEvent({ hook_event_name: 'Stop', cwd: '/tmp/repo', session_id: 'sess' }, baseConfig);
  const subagent = normaliseEvent(
    { hook_event_name: 'SubagentStop', cwd: '/tmp/repo', session_id: 'sess' },
    baseConfig
  );
  const stagePath = getStagePath('sess');

  function stageState(firedReasons: string[]): void {
    existsSyncMock.mockImplementation((p) => p === stagePath);
    readFileSyncMock.mockImplementation((p) => {
      if (p === stagePath) {
        return JSON.stringify({ stageId: 1, firedReasons });
      }
      throw new Error('ENOENT');
    });
  }

  afterEach(() => {
    existsSyncMock.mockReturnValue(false);
    readFileSyncMock.mockImplementation(() => {
      throw new Error('ENOENT');
    });
  });

  it('suppresses a Stop whose reason already fired this stage', () => {
    stageState(['done']);
    expect(shouldNotify(stop, { ...baseConfig, notifyOnStop: true })).toBe(false);
  });

  it('fires a Stop whose reason has not fired yet this stage', () => {
    stageState(['input']);
    expect(shouldNotify(stop, { ...baseConfig, notifyOnStop: true })).toBe(true);
  });

  it('lets SubagentStop bypass dedup even when other reasons fired', () => {
    stageState(['done', 'input']);
    expect(shouldNotify(subagent, { ...baseConfig, notifyOnSubagentStop: true })).toBe(true);
  });

  it('fails open and fires when the stage file is missing', () => {
    existsSyncMock.mockReturnValue(false);
    expect(shouldNotify(stop, { ...baseConfig, notifyOnStop: true })).toBe(true);
  });
});

describe('shouldNotify — owner-aware focus suppression (05 Part 1)', () => {
  const ownedStop = normaliseEvent({ hook_event_name: 'Stop', cwd: '/proj/packages/api/src' }, baseConfig);
  const ownerFolder = '/proj/packages/api';

  afterEach(() => {
    existsSyncMock.mockReturnValue(false);
    readMarkersMock.mockReturnValue([]);
  });

  it('suppresses when the owning window is focused, even if findWorkspaceRoot differs', () => {
    readMarkersMock.mockReturnValue([{ pid: 111, folders: [ownerFolder] }]);
    existsSyncMock.mockImplementation((p) => p === getFocusedPath(ownerFolder));
    expect(shouldNotify(ownedStop, baseConfig)).toBe(false);
  });

  it('notifies when the owning window is unfocused', () => {
    readMarkersMock.mockReturnValue([{ pid: 111, folders: [ownerFolder] }]);
    existsSyncMock.mockReturnValue(false);
    expect(shouldNotify(ownedStop, baseConfig)).toBe(true);
  });

  it('ignores a focused non-owner window: the event-root flag is not consulted when an owner exists', () => {
    readMarkersMock.mockReturnValue([{ pid: 111, folders: [ownerFolder] }]);
    existsSyncMock.mockImplementation((p) => p === getFocusedPath(ownedStop.workspaceRoot));
    expect(shouldNotify(ownedStop, baseConfig)).toBe(true);
  });

  it('falls back to the event workspaceRoot flag when no window owns the cwd', () => {
    readMarkersMock.mockReturnValue([]);
    existsSyncMock.mockImplementation((p) => p === getFocusedPath(ownedStop.workspaceRoot));
    expect(shouldNotify(ownedStop, baseConfig)).toBe(false);
  });
});
