import { afterEach, describe, expect, it, vi } from 'vitest';
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
    existsSyncMock.mockReturnValue(true);
    expect(shouldNotify(stopEvent, baseConfig)).toBe(false);
  });

  it('notifies when no window is focused on the workspace', () => {
    existsSyncMock.mockReturnValue(false);
    expect(shouldNotify(stopEvent, baseConfig)).toBe(true);
  });
});
