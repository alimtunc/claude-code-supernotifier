import * as cp from 'node:child_process';

const MAX_DEPTH = 10;

export function parsePpidOutput(stdout: string): number | null {
  const value = Number.parseInt(stdout.trim(), 10);
  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

export function getAncestorPids(startPid: number = process.ppid, maxDepth = MAX_DEPTH): number[] {
  // Windows has no /bin/ps and no integrated-terminal PID matching to do.
  if (process.platform === 'win32') {
    return [];
  }

  const chain: number[] = [];
  let pid = startPid;
  for (let depth = 0; depth < maxDepth; depth++) {
    if (!Number.isInteger(pid) || pid <= 1) {
      break;
    }
    chain.push(pid);

    let stdout: string;
    try {
      const result = cp.spawnSync('/bin/ps', ['-o', 'ppid=', '-p', String(pid)], { encoding: 'utf8' });
      if (result.error) {
        break;
      }
      stdout = typeof result.stdout === 'string' ? result.stdout : '';
    } catch {
      break;
    }

    const parent = parsePpidOutput(stdout);
    if (parent === null) {
      break;
    }
    pid = parent;
  }
  return chain;
}
