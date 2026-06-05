import * as fs from 'node:fs';
import { mutedPath } from './paths';

export function isMuted(): boolean {
  return fs.existsSync(mutedPath);
}
