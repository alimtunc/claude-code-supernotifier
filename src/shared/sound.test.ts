import { describe, expect, it } from 'vitest';
import { resolveSound } from './sound';
import type { HookConfig } from '../hook/types';

describe('resolveSound', () => {
  it('returns the per-event override when it is non-empty', () => {
    const config: HookConfig = { sound: 'Glass', stopSound: 'Hero' };
    expect(resolveSound('Stop', config)).toBe('Hero');
  });

  it('falls back to the global sound when the override is empty', () => {
    const config: HookConfig = { sound: 'Glass', stopSound: '' };
    expect(resolveSound('Stop', config)).toBe('Glass');
  });

  it('maps PermissionRequest to permissionSound', () => {
    expect(resolveSound('PermissionRequest', { sound: 'Glass', permissionSound: 'Submarine' })).toBe(
      'Submarine'
    );
  });

  it('maps PreToolUse (AskUserQuestion) to questionSound', () => {
    expect(resolveSound('PreToolUse', { sound: 'Glass', questionSound: 'Funk' })).toBe('Funk');
  });

  it('maps SubagentStop to subagentStopSound', () => {
    expect(resolveSound('SubagentStop', { sound: 'Glass', subagentStopSound: 'Pop' })).toBe('Pop');
  });

  it('resolves an unknown event to the global sound', () => {
    expect(resolveSound('Notification', { sound: 'Glass' })).toBe('Glass');
  });

  it('returns an empty string when neither override nor global sound is set', () => {
    expect(resolveSound('Stop', {})).toBe('');
    expect(resolveSound('Stop', { sound: '' })).toBe('');
    expect(resolveSound('PreToolUse', { questionSound: '' })).toBe('');
  });
});
