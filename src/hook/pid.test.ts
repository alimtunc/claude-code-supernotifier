import * as cp from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAncestorPids, parsePpidOutput } from './pid';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof cp>();
  return { ...actual, spawnSync: vi.fn() };
});

const spawnSyncMock = vi.mocked(cp.spawnSync);

function psResult(stdout: string): cp.SpawnSyncReturns<string> {
  return { pid: 0, output: [], stdout, stderr: '', status: 0, signal: null };
}

function ppidFor(map: Record<number, string>): void {
  spawnSyncMock.mockImplementation((_command, args) => {
    const pidArg = args ? args[3] : undefined;
    const pid = pidArg === undefined ? Number.NaN : Number.parseInt(pidArg, 10);
    return psResult(map[pid] ?? '');
  });
}

let originalPlatform: PropertyDescriptor | undefined;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value, configurable: true });
}

describe('parsePpidOutput', () => {
  it('parses a padded ppid line', () => {
    expect(parsePpidOutput(' 4321\n')).toBe(4321);
  });

  it('returns null for empty output', () => {
    expect(parsePpidOutput('')).toBeNull();
  });

  it('returns null for non-numeric output', () => {
    expect(parsePpidOutput('abc')).toBeNull();
  });

  it('returns null for non-positive pids', () => {
    expect(parsePpidOutput('0')).toBeNull();
    expect(parsePpidOutput('-5')).toBeNull();
  });
});

describe('getAncestorPids', () => {
  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    spawnSyncMock.mockReset();
  });

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  it('returns [] on win32 without spawning anything', () => {
    setPlatform('win32');
    expect(getAncestorPids(1234)).toEqual([]);
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });

  it('walks the chain and stops at PID <= 1', () => {
    setPlatform('linux');
    ppidFor({ 100: '50\n', 50: '1\n' });
    expect(getAncestorPids(100)).toEqual([100, 50]);
  });

  it('caps the walk at maxDepth', () => {
    setPlatform('linux');
    ppidFor({});
    spawnSyncMock.mockImplementation(() => psResult('999\n'));
    const chain = getAncestorPids(1000);
    expect(chain).toHaveLength(10);
    expect(spawnSyncMock).toHaveBeenCalledTimes(10);
  });

  it('returns the partial chain when a spawn throws', () => {
    setPlatform('linux');
    spawnSyncMock
      .mockImplementationOnce(() => psResult('50\n'))
      .mockImplementationOnce(() => {
        throw new Error('boom');
      });
    expect(getAncestorPids(100)).toEqual([100, 50]);
  });

  it('returns the partial chain when spawnSync reports an error', () => {
    setPlatform('linux');
    spawnSyncMock.mockImplementation(() => ({ ...psResult(''), error: new Error('ENOENT') }));
    expect(getAncestorPids(100)).toEqual([100]);
  });
});
