import { describe, expect, it } from 'vitest';
import { effectiveShowBanner, effectiveSound, resolveLevel, withForcedLevel } from './level';
import type { HookConfig } from '../hook/types';

describe('resolveLevel', () => {
  it('returns the explicit per-event level when set', () => {
    expect(resolveLevel('Stop', { stopLevel: 'popup' })).toBe('popup');
    expect(resolveLevel('PermissionRequest', { permissionLevel: 'sound' })).toBe('sound');
    expect(resolveLevel('PreToolUse', { questionLevel: 'off' })).toBe('off');
    expect(resolveLevel('SubagentStop', { subagentStopLevel: 'sound+popup' })).toBe('sound+popup');
  });

  it('falls back to the legacy notifyOnStop boolean for Stop when level is unset', () => {
    expect(resolveLevel('Stop', {})).toBe('sound+popup');
    expect(resolveLevel('Stop', { notifyOnStop: true })).toBe('sound+popup');
    expect(resolveLevel('Stop', { notifyOnStop: false })).toBe('off');
  });

  it('falls back to the legacy notifyOnAttention boolean for permission/question', () => {
    expect(resolveLevel('PermissionRequest', {})).toBe('sound+popup');
    expect(resolveLevel('PermissionRequest', { notifyOnAttention: false })).toBe('off');
    expect(resolveLevel('PreToolUse', {})).toBe('sound+popup');
    expect(resolveLevel('PreToolUse', { notifyOnAttention: false })).toBe('off');
  });

  it('derives the Notification level from the legacy notifyOnAttention boolean', () => {
    expect(resolveLevel('Notification', {})).toBe('sound+popup');
    expect(resolveLevel('Notification', { notifyOnAttention: false })).toBe('off');
  });

  it('falls back to the legacy notifyOnSubagentStop boolean (default off) for SubagentStop', () => {
    expect(resolveLevel('SubagentStop', {})).toBe('off');
    expect(resolveLevel('SubagentStop', { notifyOnSubagentStop: false })).toBe('off');
    expect(resolveLevel('SubagentStop', { notifyOnSubagentStop: true })).toBe('sound+popup');
  });

  it('prefers the explicit level over the legacy boolean', () => {
    expect(resolveLevel('Stop', { stopLevel: 'off', notifyOnStop: true })).toBe('off');
    expect(
      resolveLevel('SubagentStop', { subagentStopLevel: 'sound+popup', notifyOnSubagentStop: false })
    ).toBe('sound+popup');
  });

  it('returns off for unhandled events', () => {
    expect(resolveLevel('Unknown', {})).toBe('off');
  });
});

describe('effectiveShowBanner', () => {
  it('shows a banner only for sound+popup and popup', () => {
    expect(effectiveShowBanner('sound+popup')).toBe(true);
    expect(effectiveShowBanner('popup')).toBe(true);
    expect(effectiveShowBanner('sound')).toBe(false);
    expect(effectiveShowBanner('off')).toBe(false);
  });
});

describe('effectiveSound', () => {
  it('plays a sound only for sound+popup and sound', () => {
    expect(effectiveSound('sound+popup')).toBe(true);
    expect(effectiveSound('sound')).toBe(true);
    expect(effectiveSound('popup')).toBe(false);
    expect(effectiveSound('off')).toBe(false);
  });
});

describe('withForcedLevel', () => {
  it('forces the matching per-event level to sound+popup without mutating the input', () => {
    const config: HookConfig = { stopLevel: 'off', sound: 'Glass' };
    const forced = withForcedLevel(config, 'Stop');
    expect(forced.stopLevel).toBe('sound+popup');
    expect(forced.sound).toBe('Glass');
    expect(config.stopLevel).toBe('off');
  });

  it('forces each event to a visible+audible level', () => {
    expect(
      resolveLevel('PermissionRequest', withForcedLevel({ permissionLevel: 'off' }, 'PermissionRequest'))
    ).toBe('sound+popup');
    expect(resolveLevel('PreToolUse', withForcedLevel({ questionLevel: 'off' }, 'PreToolUse'))).toBe(
      'sound+popup'
    );
    expect(resolveLevel('SubagentStop', withForcedLevel({ subagentStopLevel: 'off' }, 'SubagentStop'))).toBe(
      'sound+popup'
    );
    expect(resolveLevel('Notification', withForcedLevel({ notifyOnAttention: false }, 'Notification'))).toBe(
      'sound+popup'
    );
  });

  it('leaves the config unchanged for events without a level key', () => {
    const config: HookConfig = { sound: 'Glass' };
    expect(withForcedLevel(config, 'Unknown')).toBe(config);
  });
});
