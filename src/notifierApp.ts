import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { appDir } from './shared/paths';

export const NOTIFIER_APP_NAME = 'ClaudeCodeSupernotifier.app';
export const NOTIFIER_BUNDLE_ID = 'com.alimtunc.claude-code-supernotifier';

const STAMP_FILE = '.notifier-app.stamp';
const PRIME_TIMEOUT_MS = 4000;
const LSREGISTER =
  '/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister';
const LSREGISTER_TIMEOUT_MS = 2000;

export function installedNotifierAppPath(): string {
  return path.join(appDir, NOTIFIER_APP_NAME);
}

export function notifierBinaryPath(): string {
  return path.join(installedNotifierAppPath(), 'Contents', 'MacOS', 'ClaudeCodeSupernotifier');
}

const SYSTEM_SOUNDS_DIR = '/System/Library/Sounds';

export function previewSound(name: string): void {
  if (!name || process.platform !== 'darwin') {
    return;
  }
  try {
    const child = cp.spawn('afplay', [path.join(SYSTEM_SOUNDS_DIR, `${name}.aiff`)], {
      detached: true,
      stdio: 'ignore'
    });
    child.on('error', () => {
      // Best-effort audition; a missing sound file must never surface a modal.
    });
    child.unref();
  } catch {
    // Best-effort.
  }
}

export function clearDeliveredNotifications(folders: readonly string[]): void {
  if (process.platform !== 'darwin' || folders.length === 0) {
    return;
  }
  const binary = notifierBinaryPath();
  if (!fs.existsSync(binary)) {
    return;
  }
  const args = ['--clear'];
  for (const folder of folders) {
    args.push('--cwd', folder);
  }
  try {
    const child = cp.spawn(binary, args, {
      detached: true,
      stdio: 'ignore'
    });
    child.on('error', () => {
      // Best-effort cleanup; a failed clear must never surface a modal.
    });
    child.unref();
  } catch {
    // Best-effort.
  }
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

  let staged = false;
  if (!upToDate) {
    try {
      fs.mkdirSync(appDir, { recursive: true });
      fs.rmSync(target, { recursive: true, force: true });
      fs.cpSync(source, target, { recursive: true });
      fs.chmodSync(notifierBinaryPath(), 0o755);
      if (sourceStamp) {
        fs.writeFileSync(stampPath, sourceStamp, 'utf8');
      }
      staged = true;
    } catch (error) {
      console.error('[claude-code-supernotifier] failed to install notifier app', error);
    }
  }

  // UNUserNotificationCenter requires the calling bundle to be registered with
  // LaunchServices; cpSync alone doesn't register it, so notifications get
  // silently dropped and the app never appears in System Settings → Notifications.
  // Idempotent — runs every activate so existing installs from before this fix
  // also get registered.
  const registered = fs.existsSync(target) && registerWithLaunchServices(target);

  if (staged && registered) {
    primeAuthorization(target);
  }
}

function registerWithLaunchServices(appPath: string): boolean {
  try {
    const result = cp.spawnSync(LSREGISTER, ['-f', appPath], {
      encoding: 'utf8',
      timeout: LSREGISTER_TIMEOUT_MS
    });
    if (result.error) {
      console.error('[claude-code-supernotifier] failed to register notifier app', result.error);
      return false;
    }
    if (result.status !== 0) {
      console.error(
        '[claude-code-supernotifier] lsregister failed',
        result.stderr || `exit code ${result.status}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error('[claude-code-supernotifier] lsregister threw', error);
    return false;
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
