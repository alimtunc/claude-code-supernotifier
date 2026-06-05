import { COMMAND_IDS } from '../constants';
import type { SoundEvent } from '../types';
import type { SessionState } from './sessionState';

export interface PanelEventSound {
  event: SoundEvent;
  label: string;
  sound: string;
}

export interface PanelState {
  state: SessionState;
  repo: string;
  ageMs: number | null;
  muted: boolean;
  eventSounds: readonly PanelEventSound[];
  thresholdSeconds: number;
}

export function buildPanelMarkdown(state: PanelState): string {
  const blocks: string[] = [`**${headlineFor(state.state, state.repo)}**`];

  if (state.muted) {
    blocks.push('$(mute) Muted — notifications are silenced.');
  }
  if (state.ageMs !== null) {
    blocks.push(`Last update ${formatAge(state.ageMs)} ago`);
  }

  blocks.push(
    state.muted
      ? commandLink('$(unmute) Unmute', COMMAND_IDS.toggleMute)
      : commandLink('$(mute) Mute', COMMAND_IDS.toggleMute)
  );

  blocks.push('**Sounds**');
  blocks.push(
    state.eventSounds
      .map(
        (entry) =>
          `- ${entry.label}: ${entry.sound} · ${commandLink('Change', COMMAND_IDS.pickEventSound, [entry.event])}`
      )
      .join('\n')
  );

  blocks.push(
    commandLink(`$(watch) Min task duration: ${state.thresholdSeconds}s`, COMMAND_IDS.setThreshold)
  );
  blocks.push(commandLink('$(gear) Open Settings', COMMAND_IDS.openSettings));

  return blocks.join('\n\n');
}

export function headlineFor(state: SessionState, repo: string): string {
  const where = repo ? ` in ${repo}` : '';
  switch (state) {
    case 'running':
      return `Claude is working${where}`;
    case 'waiting':
      return `Claude is waiting${where}`;
    case 'idle':
      return `Claude is idle${where}`;
    case 'inactive':
      return `No recent Claude activity${where}`;
  }
}

export function formatAge(ageMs: number): string {
  const seconds = Math.max(0, Math.round(ageMs / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

function commandLink(label: string, command: string, args?: readonly unknown[]): string {
  const href =
    args && args.length > 0
      ? `command:${command}?${encodeURIComponent(JSON.stringify(args))}`
      : `command:${command}`;
  return `[${label}](${href})`;
}
