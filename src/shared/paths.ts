import * as crypto from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  APP_DIR_NAME,
  CLAUDE_SETTINGS_DIRNAME,
  CLAUDE_SETTINGS_FILENAME,
  CLICKED_FILE_NAME,
  CONFIG_FILE_NAME,
  ERROR_LOG_NAME,
  EVENT_LOG_NAME,
  FOCUS_STATE_DIR_NAME,
  FOCUSED_FILE_NAME,
  HELPER_SCRIPT_NAME,
  SIGNAL_FILE_NAME
} from './constants';

export const appDir = path.join(os.homedir(), APP_DIR_NAME);
export const helperPath = path.join(appDir, HELPER_SCRIPT_NAME);
export const configPath = path.join(appDir, CONFIG_FILE_NAME);
export const eventLogPath = path.join(appDir, EVENT_LOG_NAME);
export const errorLogPath = path.join(appDir, ERROR_LOG_NAME);
export const focusStateRoot = path.join(appDir, FOCUS_STATE_DIR_NAME);
export const claudeSettingsPath = path.join(os.homedir(), CLAUDE_SETTINGS_DIRNAME, CLAUDE_SETTINGS_FILENAME);

export function hashWorkspace(workspaceRoot: string): string {
  return crypto.createHash('sha1').update(workspaceRoot).digest('hex').slice(0, 12);
}

export function getStateDir(workspaceRoot: string): string {
  return path.join(focusStateRoot, hashWorkspace(workspaceRoot));
}

export function getSignalPath(workspaceRoot: string): string {
  return path.join(getStateDir(workspaceRoot), SIGNAL_FILE_NAME);
}

export function getClickedPath(workspaceRoot: string): string {
  return path.join(getStateDir(workspaceRoot), CLICKED_FILE_NAME);
}

export function getFocusedPath(workspaceRoot: string): string {
  return path.join(getStateDir(workspaceRoot), FOCUSED_FILE_NAME);
}
