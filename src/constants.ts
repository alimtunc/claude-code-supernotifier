export const CONFIG_SECTION = 'claudeCodeSupernotifier';

export const COMMAND_IDS = {
  installClaudeHooks: `${CONFIG_SECTION}.installClaudeHooks`,
  uninstallClaudeHooks: `${CONFIG_SECTION}.uninstallClaudeHooks`,
  testNotification: `${CONFIG_SECTION}.testNotification`,
  openSettings: `${CONFIG_SECTION}.openSettings`
} as const;

export const FOCUS_URI_PATH = '/focus';
