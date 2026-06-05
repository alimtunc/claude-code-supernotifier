import { FALLBACK_SOUND_DONE, FALLBACK_SOUND_NEEDS_INPUT, FALLBACK_SOUND_QUESTION } from './constants';

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
