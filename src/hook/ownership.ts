import * as fs from 'node:fs';
import { parseMarker, type OwnershipMarker } from '../shared/ownership';
import { activeRoot, getOwnershipMarkerPath } from '../shared/paths';

export function readMarkers(): OwnershipMarker[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(activeRoot);
  } catch {
    return [];
  }

  const markers: OwnershipMarker[] = [];
  for (const entry of entries) {
    const pid = Number.parseInt(entry, 10);
    if (!Number.isInteger(pid) || pid <= 0) {
      continue;
    }

    const markerPath = getOwnershipMarkerPath(pid);
    if (!isAlive(pid)) {
      try {
        fs.rmSync(markerPath, { force: true });
      } catch {
        // Best-effort cleanup; a leftover stale marker is harmless.
      }
      continue;
    }

    try {
      markers.push(parseMarker(pid, fs.readFileSync(markerPath, 'utf8')));
    } catch {
      // Best-effort; skip a marker we cannot read.
    }
  }
  return markers;
}

// EPERM means the PID exists but is owned by another user — still alive.
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) === 'EPERM';
  }
}

function errorCode(error: unknown): string | undefined {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return undefined;
}
