export const APP_DIR_NAME = '.claude-code-supernotifier';
export const HELPER_SCRIPT_NAME = 'hook.js';
export const CONFIG_FILE_NAME = 'config.json';
export const EVENT_LOG_NAME = 'events.jsonl';
export const ERROR_LOG_NAME = 'errors.log';
export const FOCUS_STATE_DIR_NAME = 'focus-state';
export const SIGNAL_FILE_NAME = 'signal.json';
export const CLICKED_FILE_NAME = 'clicked';
export const FOCUSED_FILE_NAME = 'focused';

export const CLAUDE_SETTINGS_DIRNAME = '.claude';
export const CLAUDE_SETTINGS_FILENAME = 'settings.json';

export const DEFAULTS = {
  notifyOnStop: true,
  notifyOnAttention: true,
  sound: 'Glass',
  titleTemplate: '${repo}',
  messageTemplate: '${eventLabel}${branchSuffix}',
  includeBranch: true,
  focusOnClick: true,
  claudeOpenSessionCommand: 'claude-vscode.editor.open',
  claudeFocusCommand: 'claude-vscode.focus'
} as const;
