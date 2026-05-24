import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { getRuntimeConfig } from './config';
import { HELPER_SCRIPT_NAME, ICON_FILE_NAME } from './shared/constants';
import { writeJson } from './shared/json';
import { appDir, configPath, helperPath, iconPath } from './shared/paths';

export function writeRuntimeFiles(context: vscode.ExtensionContext): void {
  fs.mkdirSync(appDir, { recursive: true });

  const helperSource = path.join(context.extensionPath, 'dist', HELPER_SCRIPT_NAME);
  fs.copyFileSync(helperSource, helperPath);
  fs.chmodSync(helperPath, 0o755);

  const iconSource = path.join(context.extensionPath, 'media', ICON_FILE_NAME);
  if (fs.existsSync(iconSource)) {
    fs.copyFileSync(iconSource, iconPath);
  }

  writeJson(configPath, getRuntimeConfig());
}
