import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { getRuntimeConfig } from './config';
import {
  FALLBACK_SOUND_FILES,
  HELPER_SCRIPT_NAME,
  ICON_FILE_NAME,
  SOUNDS_DIR_NAME
} from './shared/constants';
import { writeJson } from './shared/json';
import {
  appDir,
  configPath,
  helperPath,
  iconPath,
  soundsDir,
  stagedSoundPath,
  stageRoot,
  taskStartRoot
} from './shared/paths';
import { isExpired, MARKER_MAX_AGE_MS } from './shared/taskTimer';

export function writeRuntimeFiles(context: vscode.ExtensionContext): void {
  fs.mkdirSync(appDir, { recursive: true });

  const helperSource = path.join(context.extensionPath, 'dist', HELPER_SCRIPT_NAME);
  fs.copyFileSync(helperSource, helperPath);
  fs.chmodSync(helperPath, 0o755);

  const iconSource = path.join(context.extensionPath, 'media', ICON_FILE_NAME);
  if (fs.existsSync(iconSource)) {
    fs.copyFileSync(iconSource, iconPath);
  }

  stageFallbackSounds(context.extensionPath);
  sweepStaleMarkers(Date.now());

  writeJson(configPath, getRuntimeConfig());
}

function sweepStaleMarkers(now: number): void {
  for (const dir of [taskStartRoot, stageRoot]) {
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      // Directory not created yet (no hook has run); nothing to sweep.
      continue;
    }
    for (const name of entries) {
      const file = path.join(dir, name);
      try {
        if (isExpired(fs.statSync(file).mtimeMs, now, MARKER_MAX_AGE_MS)) {
          fs.rmSync(file);
        }
      } catch {
        // File vanished mid-sweep or is unreadable; skip it.
      }
    }
  }
}

function stageFallbackSounds(extensionPath: string): void {
  fs.mkdirSync(soundsDir, { recursive: true });
  const sourceDir = path.join(extensionPath, 'media', SOUNDS_DIR_NAME);
  for (const file of FALLBACK_SOUND_FILES) {
    const source = path.join(sourceDir, file);
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, stagedSoundPath(file));
    }
  }
}
