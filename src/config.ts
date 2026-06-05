import * as vscode from 'vscode';
import { CONFIG_SECTION } from './constants';
import { notifierBinaryPath } from './notifierApp';
import { DEFAULTS } from './shared/constants';
import type { SupernotifierConfig } from './types';

export function getRuntimeConfig(): SupernotifierConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

  return {
    notifyOnStop: config.get('notifyOnStop', DEFAULTS.notifyOnStop),
    notifyOnAttention: config.get('notifyOnAttention', DEFAULTS.notifyOnAttention),
    notifyOnSubagentStop: config.get('notifyOnSubagentStop', DEFAULTS.notifyOnSubagentStop),
    suppressSubagentInteractions: config.get(
      'suppressSubagentInteractions',
      DEFAULTS.suppressSubagentInteractions
    ),
    minTaskDurationSeconds: clamp(
      config.get('minTaskDurationSeconds', DEFAULTS.minTaskDurationSeconds),
      0,
      3600
    ),
    sound: config.get('sound', DEFAULTS.sound),
    stopSound: config.get('stopSound', DEFAULTS.stopSound),
    permissionSound: config.get('permissionSound', DEFAULTS.permissionSound),
    questionSound: config.get('questionSound', DEFAULTS.questionSound),
    subagentStopSound: config.get('subagentStopSound', DEFAULTS.subagentStopSound),
    stopLevel: config.get('stopLevel', DEFAULTS.stopLevel),
    permissionLevel: config.get('permissionLevel', DEFAULTS.permissionLevel),
    questionLevel: config.get('questionLevel', DEFAULTS.questionLevel),
    subagentStopLevel: config.get('subagentStopLevel', DEFAULTS.subagentStopLevel),
    notificationStyle: config.get('notificationStyle', DEFAULTS.notificationStyle),
    titleTemplate: config.get('titleTemplate', DEFAULTS.titleTemplate),
    messageTemplate: config.get('messageTemplate', DEFAULTS.messageTemplate),
    includeBranch: config.get('includeBranch', DEFAULTS.includeBranch),
    allowedRepos: config.get('allowedRepos', []),
    customRepoNames: config.get('customRepoNames', {}),
    focusOnClick: config.get('focusOnClick', DEFAULTS.focusOnClick),
    notifierBinaryPath: notifierBinaryPath(),
    notifyCommand: config.get('notifyCommand', DEFAULTS.notifyCommand),
    claudeOpenSessionCommand: config.get('claudeOpenSessionCommand', DEFAULTS.claudeOpenSessionCommand),
    claudeFocusCommand: config.get('claudeFocusCommand', DEFAULTS.claudeFocusCommand),
    stopLabel: config.get('stopLabel', DEFAULTS.stopLabel),
    permissionLabel: config.get('permissionLabel', DEFAULTS.permissionLabel),
    idlePromptLabel: config.get('idlePromptLabel', DEFAULTS.idlePromptLabel),
    attentionLabel: config.get('attentionLabel', DEFAULTS.attentionLabel),
    questionLabel: config.get('questionLabel', DEFAULTS.questionLabel),
    subagentStopLabel: config.get('subagentStopLabel', DEFAULTS.subagentStopLabel),
    statusBarEnabled: config.get('statusBar.enabled', DEFAULTS.statusBarEnabled)
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
