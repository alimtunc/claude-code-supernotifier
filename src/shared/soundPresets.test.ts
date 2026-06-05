import { describe, expect, it } from 'vitest';
import {
  fallbackSoundFile,
  freedesktopSoundFile,
  LINUX_SOUNDS,
  listPresetsForPlatform,
  MACOS_SOUNDS,
  NO_SOUND_LABEL,
  NO_SOUND_VALUE,
  WIN_SOUNDS
} from './soundPresets';

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

describe('preset lists', () => {
  it('exposes a non-empty macOS list including the common system sounds', () => {
    expect(MACOS_SOUNDS.length).toBeGreaterThan(0);
    expect(MACOS_SOUNDS).toContain('Glass');
    expect(MACOS_SOUNDS).toContain('Funk');
    expect(MACOS_SOUNDS).toContain('Submarine');
  });

  it('exposes Windows ms-winsoundevent names', () => {
    expect(WIN_SOUNDS).toContain('Notification.Default');
    expect(WIN_SOUNDS).toContain('Notification.IM');
  });

  it('exposes a freedesktop Linux set', () => {
    expect(LINUX_SOUNDS).toContain('message');
    expect(LINUX_SOUNDS).toContain('complete');
    expect(LINUX_SOUNDS).toContain('bell');
  });

  it('exposes an explicit "No sound" sentinel as the empty string', () => {
    expect(NO_SOUND_VALUE).toBe('');
    expect(NO_SOUND_LABEL).toBe('No sound');
  });
});

describe('listPresetsForPlatform', () => {
  it('returns the macOS list for darwin', () => {
    expect(listPresetsForPlatform('darwin')).toBe(MACOS_SOUNDS);
  });

  it('returns the Windows list for win32', () => {
    expect(listPresetsForPlatform('win32')).toBe(WIN_SOUNDS);
  });

  it('returns the Linux list for linux', () => {
    expect(listPresetsForPlatform('linux')).toBe(LINUX_SOUNDS);
  });

  it('falls back to the Linux list for any other platform', () => {
    expect(listPresetsForPlatform('freebsd')).toBe(LINUX_SOUNDS);
  });
});
