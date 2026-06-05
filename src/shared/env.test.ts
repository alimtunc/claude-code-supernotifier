import { describe, expect, it } from 'vitest';
import { isInsideCmux } from './env';

describe('isInsideCmux', () => {
  it('is true only when CMUX_CLAUDE_HOOK_CMUX_BIN is present', () => {
    expect(isInsideCmux({ CMUX_CLAUDE_HOOK_CMUX_BIN: '/usr/local/bin/cmux' })).toBe(true);
  });

  it('is false for a plain tmux session ($TMUX only)', () => {
    expect(isInsideCmux({ TMUX: '/tmp/tmux-501/default,123,0' })).toBe(false);
  });

  it('is false for an empty environment', () => {
    expect(isInsideCmux({})).toBe(false);
  });

  it('is false when the variable is present but empty', () => {
    expect(isInsideCmux({ CMUX_CLAUDE_HOOK_CMUX_BIN: '' })).toBe(false);
  });
});
