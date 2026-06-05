import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cwdInsideFolder, ownedFolder, ownerOf, parseMarker, type OwnershipMarker } from './ownership';

const sep = path.sep;
const p = (...parts: string[]): string => sep + parts.join(sep);

describe('cwdInsideFolder', () => {
  it('matches an identical path', () => {
    expect(cwdInsideFolder(p('proj'), p('proj'))).toBe(true);
  });

  it('matches a descendant path', () => {
    expect(cwdInsideFolder(p('proj', 'a'), p('proj'))).toBe(true);
  });

  it('rejects a sibling that merely shares a prefix (trailing-separator guard)', () => {
    expect(cwdInsideFolder(p('proj-other'), p('proj'))).toBe(false);
  });

  it('rejects an ancestor', () => {
    expect(cwdInsideFolder(p('proj'), p('proj', 'a'))).toBe(false);
  });

  it('rejects an empty folder', () => {
    expect(cwdInsideFolder(p('proj'), '')).toBe(false);
  });
});

describe('parseMarker', () => {
  it('splits on newline, trims and drops empty lines', () => {
    const marker = parseMarker(99, `${p('a')}\n  ${p('b')}  \n\n\n${p('c')}\n`);
    expect(marker).toEqual({ pid: 99, folders: [p('a'), p('b'), p('c')] });
  });

  it('returns an empty folder list for empty content', () => {
    expect(parseMarker(7, '   \n  \n')).toEqual({ pid: 7, folders: [] });
  });
});

describe('ownerOf', () => {
  it('returns null when no marker owns the cwd', () => {
    const markers: OwnershipMarker[] = [{ pid: 1, folders: [p('elsewhere')] }];
    expect(ownerOf(p('proj', 'a'), markers)).toBeNull();
  });

  it('returns the only owning marker', () => {
    const owner: OwnershipMarker = { pid: 5, folders: [p('proj')] };
    expect(ownerOf(p('proj', 'a'), [owner])).toBe(owner);
  });

  it('prefers the longest-prefix marker when folders nest', () => {
    const parent: OwnershipMarker = { pid: 1, folders: [p('proj')] };
    const child: OwnershipMarker = { pid: 2, folders: [p('proj', 'packages', 'api')] };
    expect(ownerOf(p('proj', 'packages', 'api', 'src'), [parent, child])).toBe(child);
    expect(ownerOf(p('proj', 'packages', 'api', 'src'), [child, parent])).toBe(child);
  });
});

describe('ownedFolder', () => {
  it('returns the longest matching folder within a marker', () => {
    const marker: OwnershipMarker = {
      pid: 3,
      folders: [p('proj'), p('proj', 'packages', 'api'), p('other')]
    };
    expect(ownedFolder(p('proj', 'packages', 'api', 'src'), marker)).toBe(p('proj', 'packages', 'api'));
  });

  it('returns null when no folder matches', () => {
    expect(ownedFolder(p('proj'), { pid: 4, folders: [p('elsewhere')] })).toBeNull();
  });
});
