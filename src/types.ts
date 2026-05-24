export interface SupernotifierConfig {
  notifyOnStop: boolean;
  notifyOnAttention: boolean;
  sound: string;
  notificationStyle: 'system' | 'banner';
  titleTemplate: string;
  messageTemplate: string;
  includeBranch: boolean;
  allowedRepos: string[];
  customRepoNames: Record<string, string>;
  focusOnClick: boolean;
  notifierBinaryPath: string;
  claudeOpenSessionCommand: string;
  claudeFocusCommand: string;
  stopLabel: string;
  permissionLabel: string;
  idlePromptLabel: string;
  attentionLabel: string;
  statusBarEnabled: boolean;
}

export interface ClaudeHookCommand {
  type: 'command';
  command: string;
}

export interface ClaudeHookGroup {
  matcher?: string;
  hooks?: ClaudeHookCommand[];
}

export interface ClaudeSettings {
  hooks?: {
    Stop?: ClaudeHookGroup[];
    Notification?: ClaudeHookGroup[];
    PermissionRequest?: ClaudeHookGroup[];
    UserPromptSubmit?: ClaudeHookGroup[];
    [eventName: string]: ClaudeHookGroup[] | undefined;
  };
  [key: string]: unknown;
}
