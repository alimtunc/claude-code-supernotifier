import { describe, expect, it } from 'vitest';
import { COMMAND_IDS } from '../constants';
import { buildPanelMarkdown, formatAge, headlineFor, type PanelState } from './panelMarkdown';

function baseState(overrides: Partial<PanelState> = {}): PanelState {
  return {
    state: 'running',
    repo: 'app',
    ageMs: 5000,
    muted: false,
    eventSounds: [
      { event: 'stop', label: 'Finished', sound: 'Glass' },
      { event: 'permission', label: 'Permission', sound: 'Ping' },
      { event: 'question', label: 'Question', sound: 'No sound' },
      { event: 'subagentStop', label: 'Subagent', sound: 'Submarine' }
    ],
    thresholdSeconds: 30,
    ...overrides
  };
}

describe('headlineFor', () => {
  it('renders a state-specific headline with the repo', () => {
    expect(headlineFor('running', 'app')).toBe('Claude is working in app');
    expect(headlineFor('waiting', 'app')).toBe('Claude is waiting in app');
    expect(headlineFor('idle', 'app')).toBe('Claude is idle in app');
    expect(headlineFor('inactive', 'app')).toBe('No recent Claude activity in app');
  });

  it('omits the trailing location when the repo is empty', () => {
    expect(headlineFor('running', '')).toBe('Claude is working');
    expect(headlineFor('inactive', '')).toBe('No recent Claude activity');
  });
});

describe('formatAge', () => {
  it('formats seconds, minutes and hours', () => {
    expect(formatAge(5000)).toBe('5s');
    expect(formatAge(90_000)).toBe('2m');
    expect(formatAge(3_600_000)).toBe('1h');
    expect(formatAge(7_200_000)).toBe('2h');
  });

  it('never goes negative', () => {
    expect(formatAge(-100)).toBe('0s');
  });
});

describe('buildPanelMarkdown', () => {
  it('leads with the headline and the age line', () => {
    const md = buildPanelMarkdown(baseState());
    expect(md).toContain('**Claude is working in app**');
    expect(md).toContain('Last update 5s ago');
  });

  it('omits the age line when ageMs is null', () => {
    const md = buildPanelMarkdown(baseState({ ageMs: null }));
    expect(md).not.toContain('Last update');
  });

  it('shows a Mute link and no muted note when not muted', () => {
    const md = buildPanelMarkdown(baseState({ muted: false }));
    expect(md).toContain(`[$(mute) Mute](command:${COMMAND_IDS.toggleMute})`);
    expect(md).not.toContain('[$(unmute) Unmute]');
    expect(md).not.toContain('notifications are silenced');
  });

  it('flips to an Unmute link and a muted note when muted', () => {
    const md = buildPanelMarkdown(baseState({ muted: true }));
    expect(md).toContain(`[$(unmute) Unmute](command:${COMMAND_IDS.toggleMute})`);
    expect(md).not.toContain('[$(mute) Mute]');
    expect(md).toContain('notifications are silenced');
  });

  it('renders a per-event sound name and a Change link with JSON/URI-encoded args', () => {
    const md = buildPanelMarkdown(baseState());
    expect(md).toContain('Finished: Glass');
    expect(md).toContain('Permission: Ping');
    expect(md).toContain('Subagent: Submarine');
    expect(md).toContain(`command:${COMMAND_IDS.pickEventSound}?%5B%22stop%22%5D`);
    expect(md).toContain(`command:${COMMAND_IDS.pickEventSound}?%5B%22permission%22%5D`);
    expect(md).toContain(`command:${COMMAND_IDS.pickEventSound}?%5B%22question%22%5D`);
    expect(md).toContain(`command:${COMMAND_IDS.pickEventSound}?%5B%22subagentStop%22%5D`);
  });

  it('decodes the pickEventSound args back to the event key', () => {
    const md = buildPanelMarkdown(baseState());
    const match = md.match(/pickEventSound\?([^)]+)\)/);
    expect(match).not.toBeNull();
    const encoded = match?.[1] ?? '';
    expect(JSON.parse(decodeURIComponent(encoded))).toEqual(['stop']);
  });

  it('renders the threshold link with the current value', () => {
    const md = buildPanelMarkdown(baseState({ thresholdSeconds: 45 }));
    expect(md).toContain('45s');
    expect(md).toContain(`command:${COMMAND_IDS.setThreshold}`);
  });

  it('renders the Open Settings link', () => {
    const md = buildPanelMarkdown(baseState());
    expect(md).toContain(`command:${COMMAND_IDS.openSettings}`);
  });
});
