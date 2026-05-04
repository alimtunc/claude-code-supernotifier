import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export function findWorkspaceRoot(cwd: string): string {
  const home = os.homedir();
  let current = cwd;
  let best = cwd;

  while (current && current !== path.dirname(current)) {
    if (current === home) {
      break;
    }
    if (fs.existsSync(path.join(current, '.vscode'))) {
      best = current;
    }
    current = path.dirname(current);
  }

  return best;
}
