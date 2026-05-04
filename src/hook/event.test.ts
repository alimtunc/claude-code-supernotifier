import { describe, expect, it } from 'vitest';
import { normaliseEvent, shouldNotify } from './event';
import type { HookConfig } from './types';

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
    expect(ev.message).toMatch(/^Réponse terminée/);
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
    expect(ev.eventLabel).toBe('Permission requise');
  });

  it('falls back to the notification message when type is unknown', () => {
    const ev = normaliseEvent(
      { hook_event_name: 'Notification', message: 'Custom thing', cwd: '/tmp/r' },
      baseConfig
    );
    expect(ev.eventLabel).toBe('Custom thing');
  });
});

describe('shouldNotify', () => {
  const stopEvent = normaliseEvent({ hook_event_name: 'Stop', cwd: '/tmp/repo' }, baseConfig);
  const notifEvent = normaliseEvent({ hook_event_name: 'Notification', cwd: '/tmp/repo' }, baseConfig);

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
});
