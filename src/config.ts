import * as vscode from 'vscode';
import { CONFIG_SECTION } from './constants';
import { notifierBinaryPath } from './notifierApp';
import { findMacBinary } from './shared/binaries';
import { DEFAULTS, EXTENSION_URI_AUTHORITY } from './shared/constants';
import type { SupernotifierConfig } from './types';

export function getRuntimeConfig(): SupernotifierConfig {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

  return {
    notifyOnStop: config.get('notifyOnStop', DEFAULTS.notifyOnStop),
    notifyOnAttention: config.get('notifyOnAttention', DEFAULTS.notifyOnAttention),
    sound: config.get('sound', DEFAULTS.sound),
    titleTemplate: config.get('titleTemplate', DEFAULTS.titleTemplate),
    messageTemplate: config.get('messageTemplate', DEFAULTS.messageTemplate),
    includeBranch: config.get('includeBranch', DEFAULTS.includeBranch),
    allowedRepos: config.get('allowedRepos', []),
    customRepoNames: config.get('customRepoNames', {}),
    focusOnClick: config.get('focusOnClick', DEFAULTS.focusOnClick),
    editorUriScheme: vscode.env.uriScheme,
    extensionUriAuthority: EXTENSION_URI_AUTHORITY,
    notifierBinaryPath: notifierBinaryPath(),
    claudeOpenSessionCommand: config.get('claudeOpenSessionCommand', DEFAULTS.claudeOpenSessionCommand),
    claudeFocusCommand: config.get('claudeFocusCommand', DEFAULTS.claudeFocusCommand),
    editorCliPath: config.get('editorCliPath', '') || findMacBinary('code')
  };
}
