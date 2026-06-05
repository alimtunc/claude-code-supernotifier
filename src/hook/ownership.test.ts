import { afterEach, describe, expect, it, vi } from 'vitest';
import { getOwnershipMarkerPath } from '../shared/paths';
import { readMarkers } from './ownership';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    readdirSync: vi.fn(() => {
      throw new Error('ENOENT');
    }),
    readFileSync: vi.fn(() => {
      throw new Error('ENOENT');
    }),
    rmSync: vi.fn()
  };
});

const { readdirSync, readFileSync, rmSync } = await import('node:fs');
const readdirSyncMock = vi.mocked(readdirSync);
const readFileSyncMock = vi.mocked(readFileSync);
const rmSyncMock = vi.mocked(rmSync);
const killSpy = vi.spyOn(process, 'kill');

function errno(code: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(code);
  error.code = code;
  return error;
}

afterEach(() => {
  vi.clearAllMocks();
  readdirSyncMock.mockImplementation(() => {
    throw new Error('ENOENT');
  });
  readFileSyncMock.mockImplementation(() => {
    throw new Error('ENOENT');
  });
});

describe('readMarkers', () => {
  it('returns [] when the active dir cannot be read', () => {
    expect(readMarkers()).toEqual([]);
    expect(killSpy).not.toHaveBeenCalled();
  });

  it('prunes a dead (ESRCH) PID and keeps EPERM and live PIDs', () => {
    readdirSyncMock.mockReturnValue(['100', '200', '300']);
    killSpy.mockImplementation((pid) => {
      if (pid === 100) throw errno('ESRCH');
      if (pid === 200) throw errno('EPERM');
      return true;
    });
    readFileSyncMock.mockImplementation((file) => {
      if (file === getOwnershipMarkerPath(200)) return '/projB\n';
      if (file === getOwnershipMarkerPath(300)) return '/projC\n';
      throw new Error('ENOENT');
    });

    const markers = readMarkers();

    expect(markers).toEqual([
      { pid: 200, folders: ['/projB'] },
      { pid: 300, folders: ['/projC'] }
    ]);
    expect(rmSyncMock).toHaveBeenCalledWith(getOwnershipMarkerPath(100), { force: true });
    expect(rmSyncMock).not.toHaveBeenCalledWith(getOwnershipMarkerPath(200), expect.anything());
  });

  it('ignores filenames that are not positive integers', () => {
    readdirSyncMock.mockReturnValue(['.DS_Store', '0', 'abc', '500']);
    killSpy.mockReturnValue(true);
    readFileSyncMock.mockImplementation((file) => {
      if (file === getOwnershipMarkerPath(500)) return '/projE\n';
      throw new Error('ENOENT');
    });

    expect(readMarkers()).toEqual([{ pid: 500, folders: ['/projE'] }]);
  });
});
