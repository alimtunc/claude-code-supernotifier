export const CONFIG_SECTION = 'claudeCodeSupernotifier';

export const COMMAND_IDS = {
  installClaudeHooks: `${CONFIG_SECTION}.installClaudeHooks`,
  uninstallClaudeHooks: `${CONFIG_SECTION}.uninstallClaudeHooks`,
  testNotification: `${CONFIG_SECTION}.testNotification`,
  openSettings: `${CONFIG_SECTION}.openSettings`,
  toggleMute: `${CONFIG_SECTION}.toggleMute`,
  pickEventSound: `${CONFIG_SECTION}.pickEventSound`
} as const;
