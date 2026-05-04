import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { appDir } from './shared/paths';

export const NOTIFIER_APP_NAME = 'ClaudeCodeSupernotifier.app';
export const NOTIFIER_BUNDLE_ID = 'com.alimtunc.claude-code-supernotifier';

const LSREGISTER_PATH =
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
const LSREGISTER_TIMEOUT_MS = 5000;
const STAMP_FILE = '.notifier-app.stamp';

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

  if (fs.existsSync(target) && sourceStamp && readStampFile(stampPath) === sourceStamp) {
    return;
  }

  try {
    fs.mkdirSync(appDir, { recursive: true });
    fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(source, target, { recursive: true });
    registerWithLaunchServices(target);
    if (sourceStamp) {
      fs.writeFileSync(stampPath, sourceStamp, 'utf8');
    }
  } catch (error) {
    console.error('[claude-code-supernotifier] failed to install notifier app', error);
  }
}

function registerWithLaunchServices(appPath: string): void {
  if (!fs.existsSync(LSREGISTER_PATH)) {
    return;
  }
  cp.spawnSync(LSREGISTER_PATH, ['-f', appPath], {
    encoding: 'utf8',
    timeout: LSREGISTER_TIMEOUT_MS
  });
}

function readStamp(appPath: string): string | undefined {
  try {
    const plist = fs.readFileSync(path.join(appPath, 'Contents', 'Info.plist'));
    const icns = fs.readFileSync(path.join(appPath, 'Contents', 'Resources', 'AppIcon.icns'));
    return `${plist.length}:${icns.length}`;
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
