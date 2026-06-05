export const APP_DIR_NAME = '.claude-code-supernotifier';
export const HELPER_SCRIPT_NAME = 'hook.js';
export const CONFIG_FILE_NAME = 'config.json';
export const ICON_FILE_NAME = 'icon.png';
export const SOUNDS_DIR_NAME = 'sounds';
export const FALLBACK_SOUND_DONE = 'done.wav';
export const FALLBACK_SOUND_NEEDS_INPUT = 'needs-input.wav';
export const FALLBACK_SOUND_QUESTION = 'question.wav';
export const FALLBACK_SOUND_FILES = [
  FALLBACK_SOUND_DONE,
  FALLBACK_SOUND_NEEDS_INPUT,
  FALLBACK_SOUND_QUESTION
] as const;
export const EVENT_LOG_NAME = 'events.jsonl';
export const ERROR_LOG_NAME = 'errors.log';
export const FOCUS_STATE_DIR_NAME = 'focus-state';
export const ACTIVE_DIR_NAME = 'active';
export const TASK_START_DIR_NAME = 'task-start';
export const STAGE_DIR_NAME = 'stage';
export const SIGNAL_FILE_NAME = 'signal.json';
export const CLICKED_FILE_NAME = 'clicked';
export const FOCUSED_FILE_NAME = 'focused';
export const MUTED_FILE_NAME = 'muted';

export const NOTIFIER_DISPLAY_NAME = 'Claude Code SuperNotifier';
export const NOTIFIER_TOAST_APP_ID = 'ClaudeCodeSupernotifier';

export const CLAUDE_SETTINGS_DIRNAME = '.claude';
export const CLAUDE_SETTINGS_FILENAME = 'settings.json';

export const DEFAULTS = {
  notifyOnStop: true,
  notifyOnAttention: true,
  notifyOnSubagentStop: false,
  suppressSubagentInteractions: true,
  minTaskDurationSeconds: 0,
  sound: 'Glass',
  stopSound: '',
  permissionSound: '',
  questionSound: '',
  subagentStopSound: '',
  stopLevel: 'sound+popup',
  permissionLevel: 'sound+popup',
  questionLevel: 'sound+popup',
  subagentStopLevel: 'off',
  notificationStyle: 'system',
  titleTemplate: '${repo}',
  messageTemplate: '${eventLabel}${branchSuffix}',
  includeBranch: true,
  focusOnClick: true,
  claudeOpenSessionCommand: 'claude-vscode.editor.open',
  claudeFocusCommand: 'claude-vscode.focus',
  stopLabel: 'Finished',
  permissionLabel: 'Permission required',
  idlePromptLabel: 'Claude is waiting for input',
  attentionLabel: 'Claude needs you',
  questionLabel: 'Claude is asking a question',
  subagentStopLabel: 'Subagent finished',
  statusBarEnabled: true,
  notifyCommand: ''
} as const;
