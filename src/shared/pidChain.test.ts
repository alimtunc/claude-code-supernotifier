import { describe, expect, it } from 'vitest';
import { isPidInChain } from './pidChain';

describe('isPidInChain', () => {
  it('returns true when the pid is in the chain', () => {
    expect(isPidInChain(42, [7, 42, 99])).toBe(true);
  });

  it('returns false when the pid is absent', () => {
    expect(isPidInChain(13, [7, 42, 99])).toBe(false);
  });

  it('returns false for an empty chain', () => {
    expect(isPidInChain(42, [])).toBe(false);
  });

  it('returns false for a non-positive pid even if present', () => {
    expect(isPidInChain(0, [0])).toBe(false);
    expect(isPidInChain(-1, [-1])).toBe(false);
  });
});
