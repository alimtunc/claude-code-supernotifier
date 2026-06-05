import { describe, expect, it } from 'vitest';
import {
  clampTaskDuration,
  MAX_TASK_DURATION_SECONDS,
  MIN_TASK_DURATION_SECONDS,
  parseTaskDuration,
  validateTaskDuration
} from './threshold';

describe('clampTaskDuration', () => {
  it('passes through an in-range value', () => {
    expect(clampTaskDuration(30)).toBe(30);
  });

  it('clamps below the minimum to the minimum', () => {
    expect(clampTaskDuration(-5)).toBe(MIN_TASK_DURATION_SECONDS);
  });

  it('clamps above the maximum to the maximum', () => {
    expect(clampTaskDuration(99999)).toBe(MAX_TASK_DURATION_SECONDS);
  });

  it('returns the minimum for any non-finite input (matches getRuntimeConfig)', () => {
    expect(clampTaskDuration(Number.NaN)).toBe(MIN_TASK_DURATION_SECONDS);
    expect(clampTaskDuration(Number.POSITIVE_INFINITY)).toBe(MIN_TASK_DURATION_SECONDS);
    expect(clampTaskDuration(Number.NEGATIVE_INFINITY)).toBe(MIN_TASK_DURATION_SECONDS);
  });
});

describe('parseTaskDuration', () => {
  it('parses a trimmed integer string', () => {
    expect(parseTaskDuration('  42 ')).toBe(42);
  });

  it('returns NaN for a non-numeric string', () => {
    expect(Number.isNaN(parseTaskDuration('abc'))).toBe(true);
  });
});

describe('validateTaskDuration', () => {
  it('accepts an in-range whole number', () => {
    expect(validateTaskDuration('0')).toBeUndefined();
    expect(validateTaskDuration('3600')).toBeUndefined();
    expect(validateTaskDuration('  120 ')).toBeUndefined();
  });

  it('rejects an empty string', () => {
    expect(validateTaskDuration('')).toBeTypeOf('string');
    expect(validateTaskDuration('   ')).toBeTypeOf('string');
  });

  it('rejects a non-numeric string', () => {
    expect(validateTaskDuration('soon')).toBeTypeOf('string');
  });

  it('rejects a non-integer value', () => {
    expect(validateTaskDuration('12.5')).toBeTypeOf('string');
  });

  it('rejects out-of-range values', () => {
    expect(validateTaskDuration('-1')).toBeTypeOf('string');
    expect(validateTaskDuration('3601')).toBeTypeOf('string');
  });
});
