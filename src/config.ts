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
    sound: config.get('sound', DEFAULTS.sound),
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
