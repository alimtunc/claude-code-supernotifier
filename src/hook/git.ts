import * as cp from 'node:child_process';

export function getGitBranch(cwd: string): string {
  const result = cp.spawnSync('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], {
    encoding: 'utf8',
    timeout: 700
  });

  if (result.status !== 0) {
    return '';
  }

  const branch = result.stdout.trim();
  return branch === 'HEAD' ? '' : branch;
}
