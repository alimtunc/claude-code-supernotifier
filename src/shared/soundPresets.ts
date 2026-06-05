import { FALLBACK_SOUND_DONE, FALLBACK_SOUND_NEEDS_INPUT, FALLBACK_SOUND_QUESTION } from './constants';

export const NO_SOUND_VALUE = '';
export const NO_SOUND_LABEL = 'No sound';

export const MACOS_SOUNDS = [
  'Glass',
  'Ping',
  'Submarine',
  'Funk',
  'Hero',
  'Pop',
  'Basso',
  'Blow',
  'Bottle',
  'Frog',
  'Morse',
  'Purr',
  'Sosumi',
  'Tink'
] as const;

export const WIN_SOUNDS = [
  'Notification.Default',
  'Notification.IM',
  'Notification.Mail',
  'Notification.Reminder',
  'Notification.SMS'
] as const;

export const LINUX_SOUNDS = [
  'message',
  'message-new-instant',
  'complete',
  'bell',
  'dialog-information'
] as const;

export function listPresetsForPlatform(platform: NodeJS.Platform): readonly string[] {
  switch (platform) {
    case 'darwin':
      return MACOS_SOUNDS;
    case 'win32':
      return WIN_SOUNDS;
    default:
      return LINUX_SOUNDS;
  }
}

const FREEDESKTOP_STEREO_DIR = '/usr/share/sounds/freedesktop/stereo';

const FREEDESKTOP_THEME: Readonly<Record<string, string>> = {
  Glass: 'message',
  Pop: 'message',
  Ping: 'message',
  Tink: 'message',
  Bottle: 'message',
  Frog: 'message',
  Purr: 'message',
  Hero: 'complete',
  Submarine: 'complete',
  Funk: 'bell',
  Blow: 'bell',
  Sosumi: 'bell',
  Morse: 'bell',
  Basso: 'dialog-error'
};

export function freedesktopSoundFile(name: string): string | undefined {
  const theme = FREEDESKTOP_THEME[name];
  return theme ? `${FREEDESKTOP_STEREO_DIR}/${theme}.oga` : undefined;
}

export function fallbackSoundFile(event: string): string {
  switch (event) {
    case 'PermissionRequest':
      return FALLBACK_SOUND_NEEDS_INPUT;
    case 'PreToolUse':
      return FALLBACK_SOUND_QUESTION;
    default:
      return FALLBACK_SOUND_DONE;
  }
}
