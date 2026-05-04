import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readJson, tryReadJson, writeJson } from './json';

describe('json I/O helpers', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'supernotify-json-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('readJson returns the parsed contents', () => {
    const file = path.join(tmpDir, 'data.json');
    fs.writeFileSync(file, JSON.stringify({ a: 1 }));
    expect(readJson<{ a: number }>(file, { a: 0 })).toEqual({ a: 1 });
  });

  it('readJson returns the fallback when the file is missing', () => {
    expect(readJson(path.join(tmpDir, 'missing.json'), 'fallback')).toBe('fallback');
  });

  it('readJson throws a wrapped error when JSON is malformed', () => {
    const file = path.join(tmpDir, 'broken.json');
    fs.writeFileSync(file, '{not-json');
    expect(() => readJson(file, null)).toThrowError(/Cannot read JSON from/);
  });

  it('tryReadJson swallows errors and returns the fallback', () => {
    const file = path.join(tmpDir, 'broken.json');
    fs.writeFileSync(file, '{not-json');
    expect(tryReadJson(file, { ok: false })).toEqual({ ok: false });
  });

  it('writeJson creates parent directories and pretty-prints', () => {
    const file = path.join(tmpDir, 'nested', 'data.json');
    writeJson(file, { hello: 'world' });
    const text = fs.readFileSync(file, 'utf8');
    expect(text).toBe('{\n  "hello": "world"\n}\n');
  });
});
