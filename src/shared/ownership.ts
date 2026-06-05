import * as path from 'node:path';

export interface OwnershipMarker {
  pid: number;
  folders: string[];
}

export function cwdInsideFolder(cwd: string, folder: string): boolean {
  if (!folder) {
    return false;
  }
  return cwd === folder || cwd.startsWith(folder + path.sep);
}

export function ownedFolder(cwd: string, marker: OwnershipMarker): string | null {
  let best: string | null = null;
  for (const folder of marker.folders) {
    if (cwdInsideFolder(cwd, folder) && (best === null || folder.length > best.length)) {
      best = folder;
    }
  }
  return best;
}

export function ownerOf(cwd: string, markers: readonly OwnershipMarker[]): OwnershipMarker | null {
  let best: OwnershipMarker | null = null;
  let bestLength = -1;
  for (const marker of markers) {
    const folder = ownedFolder(cwd, marker);
    if (folder !== null && folder.length > bestLength) {
      best = marker;
      bestLength = folder.length;
    }
  }
  return best;
}

export function parseMarker(pid: number, content: string): OwnershipMarker {
  const folders = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return { pid, folders };
}
