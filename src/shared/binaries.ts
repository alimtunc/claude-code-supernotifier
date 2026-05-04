import * as fs from 'node:fs';

const MAC_BINARY_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin'];

export function findMacBinary(name: string, extraDirs: readonly string[] = []): string {
  for (const dir of [...MAC_BINARY_DIRS, ...extraDirs]) {
    const candidate = `${dir}/${name}`;
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Try the next standard macOS location.
    }
  }
  return '';
}
