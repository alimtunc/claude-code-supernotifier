import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import { NOTIFIER_DISPLAY_NAME } from '../shared/constants';
import { effectiveSound, resolveLevel } from '../shared/level';
import { iconPath, stagedSoundPath } from '../shared/paths';
import { resolveSound } from '../shared/sound';
import { fallbackSoundFile, freedesktopSoundFile } from '../shared/soundPresets';
import type { HookConfig, NormalisedEvent } from './types';

const DEFAULT_COMMAND = 'notify-send';

export function notify(event: NormalisedEvent, config: HookConfig): void {
  const level = resolveLevel(event.event, config);
  if (level === 'off') {
    return;
  }

  const command = config.notifyCommand?.trim() || DEFAULT_COMMAND;

  const args = ['--app-name', NOTIFIER_DISPLAY_NAME, '--urgency', 'normal'];

  if (fs.existsSync(iconPath)) {
    args.push('--icon', iconPath);
  }

  args.push(event.title, event.message);

  const child = cp.spawn(command, args, {
    detached: true,
    stdio: 'ignore'
  });
  child.on('error', () => {
    // notify-send (or the user-provided notifyCommand) is missing from PATH.
    // Silent failure — recorded by the hook's stderr/errors.log if it crashes.
  });
  child.unref();

  if (effectiveSound(level)) {
    playSound(event, config);
  }
}

function playSound(event: NormalisedEvent, config: HookConfig): void {
  const sound = resolveSound(event.event, config);
  if (!sound) {
    return;
  }

  const file = resolveAudioFile(event.event, sound);
  if (file) {
    spawnPlayer(file);
  }
}

function resolveAudioFile(event: string, sound: string): string | undefined {
  const themeFile = freedesktopSoundFile(sound);
  if (themeFile && fs.existsSync(themeFile)) {
    return themeFile;
  }

  const fallback = stagedSoundPath(fallbackSoundFile(event));
  return fs.existsSync(fallback) ? fallback : undefined;
}

function spawnPlayer(file: string): void {
  const child = cp.spawn('paplay', [file], { detached: true, stdio: 'ignore' });
  child.on('error', () => {
    // paplay is missing (no PulseAudio/PipeWire) — fall back to ALSA's aplay once.
    const fallback = cp.spawn('aplay', [file], { detached: true, stdio: 'ignore' });
    fallback.on('error', () => {});
    fallback.unref();
  });
  child.unref();
}
