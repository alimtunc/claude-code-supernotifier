import { afterEach, describe, expect, it, vi } from 'vitest';
import { isMuted } from './mute';
import { mutedPath } from './paths';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, existsSync: vi.fn(() => false) };
});

const { existsSync } = await import('node:fs');
const existsSyncMock = vi.mocked(existsSync);

describe('isMuted', () => {
  afterEach(() => {
    existsSyncMock.mockReturnValue(false);
  });

  it('is true only when the mute file exists', () => {
    existsSyncMock.mockImplementation((p) => p === mutedPath);
    expect(isMuted()).toBe(true);
  });

  it('is false when the mute file is absent', () => {
    existsSyncMock.mockReturnValue(false);
    expect(isMuted()).toBe(false);
  });
});
