export type NotificationLevel = 'sound+popup' | 'sound' | 'popup' | 'off';

export type SoundEvent = 'stop' | 'permission' | 'question' | 'subagentStop';

export interface SupernotifierConfig {
  notifyOnStop: boolean;
  notifyOnAttention: boolean;
  notifyOnSubagentStop: boolean;
  suppressSubagentInteractions: boolean;
  minTaskDurationSeconds: number;
  sound: string;
  stopSound: string;
  permissionSound: string;
  questionSound: string;
  subagentStopSound: string;
  stopLevel: NotificationLevel;
  permissionLevel: NotificationLevel;
  questionLevel: NotificationLevel;
  subagentStopLevel: NotificationLevel;
  notificationStyle: 'system' | 'banner';
  titleTemplate: string;
  messageTemplate: string;
  includeBranch: boolean;
  allowedRepos: string[];
  customRepoNames: Record<string, string>;
  focusOnClick: boolean;
  notifierBinaryPath: string;
  notifyCommand: string;
  claudeOpenSessionCommand: string;
  claudeFocusCommand: string;
  stopLabel: string;
  permissionLabel: string;
  idlePromptLabel: string;
  attentionLabel: string;
  questionLabel: string;
  subagentStopLabel: string;
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
    PreToolUse?: ClaudeHookGroup[];
    SubagentStop?: ClaudeHookGroup[];
    UserPromptSubmit?: ClaudeHookGroup[];
    [eventName: string]: ClaudeHookGroup[] | undefined;
  };
  [key: string]: unknown;
}
