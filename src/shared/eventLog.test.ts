import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readRecentEvents } from './eventLog';

let tmpDir: string;
let logPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'supernotifier-eventlog-'));
  logPath = path.join(tmpDir, 'events.jsonl');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('readRecentEvents', () => {
  it('returns an empty array when the log does not exist', () => {
    expect(readRecentEvents(100, logPath)).toEqual([]);
  });

  it('parses JSONL entries and ignores blank lines', () => {
    const entries = [
      JSON.stringify({ event: 'Stop', createdAt: '2026-05-24T10:00:00.000Z', cwd: '/a' }),
      '',
      JSON.stringify({
        event: 'UserPromptSubmit',
        createdAt: '2026-05-24T10:01:00.000Z',
        cwd: '/a'
      })
    ];
    fs.writeFileSync(logPath, `${entries.join('\n')}\n`, 'utf8');

    const result = readRecentEvents(100, logPath);
    expect(result).toHaveLength(2);
    expect(result[0]?.event).toBe('Stop');
    expect(result[1]?.event).toBe('UserPromptSubmit');
  });

  it('skips lines that are not valid JSON or do not have required fields', () => {
    const lines = ['not json', JSON.stringify({ foo: 'bar' }), JSON.stringify({ event: 'Stop' })];
    fs.writeFileSync(logPath, `${lines.join('\n')}\n`, 'utf8');
    expect(readRecentEvents(100, logPath)).toEqual([]);
  });

  it('respects maxLines and keeps the tail', () => {
    const lines: string[] = [];
    for (let i = 0; i < 10; i++) {
      lines.push(
        JSON.stringify({ event: 'Stop', createdAt: `2026-05-24T10:${String(i).padStart(2, '0')}:00.000Z` })
      );
    }
    fs.writeFileSync(logPath, `${lines.join('\n')}\n`, 'utf8');

    const result = readRecentEvents(3, logPath);
    expect(result).toHaveLength(3);
    expect(result[2]?.createdAt).toBe('2026-05-24T10:09:00.000Z');
  });
});
