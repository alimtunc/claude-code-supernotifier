import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findMacBinary } from './binaries';

describe('findMacBinary', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsn-bin-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns an empty string when the binary is unknown', () => {
    expect(findMacBinary('definitely-not-a-real-binary-xyzzy', [tmpDir])).toBe('');
  });

  it('returns the absolute path when the binary exists in an extra dir', () => {
    const file = path.join(tmpDir, 'mybin');
    fs.writeFileSync(file, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(file, 0o755);

    expect(findMacBinary('mybin', [tmpDir])).toBe(file);
  });

  it('skips a non-executable file with the right name', () => {
    const file = path.join(tmpDir, 'mybin');
    fs.writeFileSync(file, 'not executable');
    fs.chmodSync(file, 0o644);

    expect(findMacBinary('mybin', [tmpDir])).toBe('');
  });
});
