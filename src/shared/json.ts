import * as fs from 'node:fs';
import * as path from 'node:path';

export function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot read JSON from ${filePath}: ${message}`, { cause: error });
  }
}

export function tryReadJson<T>(filePath: string, fallback: T): T {
  try {
    return readJson(filePath, fallback);
  } catch {
    return fallback;
  }
}

export function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
