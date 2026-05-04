import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { getRuntimeConfig } from './config';
import { HELPER_SCRIPT_NAME } from './shared/constants';
import { writeJson } from './shared/json';
import { appDir, configPath, helperPath } from './shared/paths';

export function writeRuntimeFiles(context: vscode.ExtensionContext): void {
  fs.mkdirSync(appDir, { recursive: true });

  const sourcePath = path.join(context.extensionPath, 'dist', HELPER_SCRIPT_NAME);
  fs.copyFileSync(sourcePath, helperPath);
  fs.chmodSync(helperPath, 0o755);

  writeJson(configPath, getRuntimeConfig());
}
