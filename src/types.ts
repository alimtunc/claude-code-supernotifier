export interface SupernotifierConfig {
  notifyOnStop: boolean;
  notifyOnAttention: boolean;
  sound: string;
  titleTemplate: string;
  messageTemplate: string;
  includeBranch: boolean;
  allowedRepos: string[];
  customRepoNames: Record<string, string>;
  focusOnClick: boolean;
  editorUriScheme: string;
  extensionUriAuthority: string;
  notifierBinaryPath: string;
  claudeOpenSessionCommand: string;
  claudeFocusCommand: string;
  editorCliPath: string;
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
    [eventName: string]: ClaudeHookGroup[] | undefined;
  };
  [key: string]: unknown;
}
