import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  deriveSessionState,
  pickHighestPriority,
  type EventEntry,
  type SessionSnapshot
} from './sessionState';

const WORKSPACE = '/Users/alice/projects/foo';
const OTHER_WORKSPACE = '/Users/alice/projects/bar';

function makeEntry(overrides: Partial<EventEntry>): EventEntry {
  return {
    event: 'Stop',
    notificationType: '',
    cwd: WORKSPACE,
    workspaceRoot: WORKSPACE,
    sessionId: 'session-1',
    repo: 'foo',
    branch: 'main',
    eventLabel: 'Finished',
    createdAt: '2026-05-24T10:00:00.000Z',
    ...overrides
  };
}

describe('deriveSessionState', () => {
  it('returns inactive when no events exist', () => {
    const snapshot = deriveSessionState({
      events: [],
      workspaceRoot: WORKSPACE,
      now: new Date('2026-05-24T10:05:00Z'),
      idleHideAfterMs: 600_000
    });
    expect(snapshot).toEqual({ state: 'inactive', lastEvent: null, ageMs: null });
  });

  it('maps Stop to idle when fresh', () => {
    const snapshot = deriveSessionState({
      events: [makeEntry({ event: 'Stop' })],
      workspaceRoot: WORKSPACE,
      now: new Date('2026-05-24T10:01:00Z'),
      idleHideAfterMs: 600_000
    });
    expect(snapshot.state).toBe('idle');
  });

  it('hides idle when older than the idle timeout', () => {
    const snapshot = deriveSessionState({
      events: [makeEntry({ event: 'Stop', createdAt: '2026-05-24T09:00:00.000Z' })],
      workspaceRoot: WORKSPACE,
      now: new Date('2026-05-24T10:00:00Z'),
      idleHideAfterMs: 600_000
    });
    expect(snapshot.state).toBe('inactive');
  });

  it('does not hide waiting state regardless of age', () => {
    const snapshot = deriveSessionState({
      events: [makeEntry({ event: 'Notification', createdAt: '2026-05-24T08:00:00.000Z' })],
      workspaceRoot: WORKSPACE,
      now: new Date('2026-05-24T10:00:00Z'),
      idleHideAfterMs: 600_000
    });
    expect(snapshot.state).toBe('waiting');
  });

  it('maps UserPromptSubmit to running', () => {
    const snapshot = deriveSessionState({
      events: [makeEntry({ event: 'UserPromptSubmit' })],
      workspaceRoot: WORKSPACE,
      now: new Date('2026-05-24T10:01:00Z'),
      idleHideAfterMs: 600_000
    });
    expect(snapshot.state).toBe('running');
  });

  it('maps PermissionRequest to waiting', () => {
    const snapshot = deriveSessionState({
      events: [makeEntry({ event: 'PermissionRequest' })],
      workspaceRoot: WORKSPACE,
      now: new Date('2026-05-24T10:01:00Z'),
      idleHideAfterMs: 600_000
    });
    expect(snapshot.state).toBe('waiting');
  });

  it('maps PreToolUse (AskUserQuestion) to waiting', () => {
    const snapshot = deriveSessionState({
      events: [makeEntry({ event: 'PreToolUse' })],
      workspaceRoot: WORKSPACE,
      now: new Date('2026-05-24T10:01:00Z'),
      idleHideAfterMs: 600_000
    });
    expect(snapshot.state).toBe('waiting');
  });

  it('maps SubagentStop to idle', () => {
    const snapshot = deriveSessionState({
      events: [makeEntry({ event: 'SubagentStop' })],
      workspaceRoot: WORKSPACE,
      now: new Date('2026-05-24T10:01:00Z'),
      idleHideAfterMs: 600_000
    });
    expect(snapshot.state).toBe('idle');
  });

  it('uses the latest event, not the first', () => {
    const events = [
      makeEntry({ event: 'Stop', createdAt: '2026-05-24T09:00:00.000Z' }),
      makeEntry({ event: 'UserPromptSubmit', createdAt: '2026-05-24T09:30:00.000Z' }),
      makeEntry({ event: 'Notification', createdAt: '2026-05-24T09:31:00.000Z' })
    ];
    const snapshot = deriveSessionState({
      events,
      workspaceRoot: WORKSPACE,
      now: new Date('2026-05-24T09:32:00Z'),
      idleHideAfterMs: 600_000
    });
    expect(snapshot.state).toBe('waiting');
    expect(snapshot.lastEvent?.event).toBe('Notification');
  });

  it('ignores events from other workspaces', () => {
    const events = [
      makeEntry({ event: 'UserPromptSubmit', cwd: OTHER_WORKSPACE, workspaceRoot: OTHER_WORKSPACE })
    ];
    const snapshot = deriveSessionState({
      events,
      workspaceRoot: WORKSPACE,
      now: new Date('2026-05-24T10:01:00Z'),
      idleHideAfterMs: 600_000
    });
    expect(snapshot.state).toBe('inactive');
  });

  it('matches events from a subdirectory of the workspace', () => {
    const events = [
      makeEntry({
        event: 'UserPromptSubmit',
        cwd: path.join(WORKSPACE, 'src', 'nested'),
        workspaceRoot: ''
      })
    ];
    const snapshot = deriveSessionState({
      events,
      workspaceRoot: WORKSPACE,
      now: new Date('2026-05-24T10:01:00Z'),
      idleHideAfterMs: 600_000
    });
    expect(snapshot.state).toBe('running');
  });
});

function snap(state: SessionSnapshot['state']): SessionSnapshot {
  return { state, lastEvent: null, ageMs: null };
}

describe('pickHighestPriority', () => {
  it('returns null on empty input', () => {
    expect(pickHighestPriority([])).toBeNull();
  });

  it('prefers waiting over running', () => {
    const result = pickHighestPriority([
      { workspaceRoot: '/a', snapshot: snap('running') },
      { workspaceRoot: '/b', snapshot: snap('waiting') }
    ]);
    expect(result?.workspaceRoot).toBe('/b');
  });

  it('prefers running over idle over inactive', () => {
    const result = pickHighestPriority([
      { workspaceRoot: '/a', snapshot: snap('inactive') },
      { workspaceRoot: '/b', snapshot: snap('idle') },
      { workspaceRoot: '/c', snapshot: snap('running') }
    ]);
    expect(result?.workspaceRoot).toBe('/c');
  });
});
