import { describe, expect, it } from 'vitest';
import { renderTemplate, truncate } from './template';

describe('renderTemplate', () => {
  it('replaces ${var} with the matching value', () => {
    expect(renderTemplate('Hello ${name}', { name: 'world' })).toBe('Hello world');
  });

  it('replaces multiple variables and supports underscores/digits', () => {
    expect(renderTemplate('${repo}@${branch_2}', { repo: 'app', branch_2: 'main' })).toBe('app@main');
  });

  it('renders missing variables as empty strings', () => {
    expect(renderTemplate('A:${a} B:${b}', { a: 'one' })).toBe('A:one B:');
  });

  it('renders null/undefined as empty strings', () => {
    expect(renderTemplate('${x}-${y}', { x: null, y: undefined })).toBe('-');
  });

  it('coerces non-string values via String()', () => {
    expect(renderTemplate('${count}', { count: 42 })).toBe('42');
  });

  it('leaves syntax with non-matching characters untouched', () => {
    expect(renderTemplate('keep ${not-a-var} as-is', { 'not-a-var': 'oops' })).toBe(
      'keep ${not-a-var} as-is'
    );
  });
});

describe('truncate', () => {
  it('returns the string unchanged when within the limit', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('collapses whitespace before measuring length', () => {
    expect(truncate('  hello   world  ', 11)).toBe('hello world');
  });

  it('truncates with an ellipsis when exceeding the limit', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcd…');
  });

  it('respects the maximum length including the ellipsis', () => {
    const max = 6;
    const result = truncate('abcdefghijklmno', max);
    expect(result.length).toBe(max);
    expect(result.endsWith('…')).toBe(true);
  });
});
