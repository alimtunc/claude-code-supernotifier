import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { appDir } from './shared/paths';

export const NOTIFIER_APP_NAME = 'ClaudeCodeSupernotifier.app';
export const NOTIFIER_BUNDLE_ID = 'com.alimtunc.claude-code-supernotifier';

const STAMP_FILE = '.notifier-app.stamp';
const PRIME_TIMEOUT_MS = 4000;

export function installedNotifierAppPath(): string {
  return path.join(appDir, NOTIFIER_APP_NAME);
}

export function notifierBinaryPath(): string {
  return path.join(installedNotifierAppPath(), 'Contents', 'MacOS', 'ClaudeCodeSupernotifier');
}

export function ensureNotifierApp(context: vscode.ExtensionContext): void {
  if (process.platform !== 'darwin') {
    return;
  }

  const source = path.join(context.extensionPath, 'media', NOTIFIER_APP_NAME);
  if (!fs.existsSync(source)) {
    return;
  }

  const target = installedNotifierAppPath();
  const stampPath = path.join(appDir, STAMP_FILE);
  const sourceStamp = readStamp(source);

  const upToDate =
    fs.existsSync(target) && sourceStamp !== undefined && readStampFile(stampPath) === sourceStamp;

  if (!upToDate) {
    try {
      fs.mkdirSync(appDir, { recursive: true });
      fs.rmSync(target, { recursive: true, force: true });
      fs.cpSync(source, target, { recursive: true });
      fs.chmodSync(notifierBinaryPath(), 0o755);
      if (sourceStamp) {
        fs.writeFileSync(stampPath, sourceStamp, 'utf8');
      }
      primeAuthorization(target);
    } catch (error) {
      console.error('[claude-code-supernotifier] failed to install notifier app', error);
    }
  }
}

function primeAuthorization(appPath: string): void {
  const exe = path.join(appPath, 'Contents', 'MacOS', 'ClaudeCodeSupernotifier');
  if (!fs.existsSync(exe)) {
    return;
  }
  try {
    cp.spawnSync(exe, ['--prime'], {
      timeout: PRIME_TIMEOUT_MS,
      stdio: 'ignore'
    });
  } catch {
    // Best-effort. The user will see the permission prompt the first time
    // they receive a real notification instead.
  }
}

function readStamp(appPath: string): string | undefined {
  try {
    const plist = fs.readFileSync(path.join(appPath, 'Contents', 'Info.plist'));
    const exe = fs.readFileSync(path.join(appPath, 'Contents', 'MacOS', 'ClaudeCodeSupernotifier'));
    return `${plist.length}:${exe.length}`;
  } catch {
    return undefined;
  }
}

function readStampFile(stampPath: string): string | undefined {
  try {
    return fs.readFileSync(stampPath, 'utf8');
  } catch {
    return undefined;
  }
}
