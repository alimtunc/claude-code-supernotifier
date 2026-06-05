import { describe, expect, it } from 'vitest';
import { fallbackSoundFile, freedesktopSoundFile } from './soundPresets';

describe('freedesktopSoundFile', () => {
  it('maps Glass and Pop to the message theme', () => {
    expect(freedesktopSoundFile('Glass')).toBe('/usr/share/sounds/freedesktop/stereo/message.oga');
    expect(freedesktopSoundFile('Pop')).toBe('/usr/share/sounds/freedesktop/stereo/message.oga');
  });

  it('maps Hero to complete and Funk to bell', () => {
    expect(freedesktopSoundFile('Hero')).toBe('/usr/share/sounds/freedesktop/stereo/complete.oga');
    expect(freedesktopSoundFile('Funk')).toBe('/usr/share/sounds/freedesktop/stereo/bell.oga');
  });

  it('returns undefined for an empty or unknown name', () => {
    expect(freedesktopSoundFile('')).toBeUndefined();
    expect(freedesktopSoundFile('Nonexistent')).toBeUndefined();
  });
});

describe('fallbackSoundFile', () => {
  it('maps Stop and SubagentStop to done.wav', () => {
    expect(fallbackSoundFile('Stop')).toBe('done.wav');
    expect(fallbackSoundFile('SubagentStop')).toBe('done.wav');
  });

  it('maps PermissionRequest to needs-input.wav', () => {
    expect(fallbackSoundFile('PermissionRequest')).toBe('needs-input.wav');
  });

  it('maps PreToolUse (AskUserQuestion) to question.wav', () => {
    expect(fallbackSoundFile('PreToolUse')).toBe('question.wav');
  });

  it('falls back to done.wav for an unknown event', () => {
    expect(fallbackSoundFile('Notification')).toBe('done.wav');
  });
});
