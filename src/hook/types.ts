export interface HookInputEvent {
  cwd?: string;
  hook_event_name?: string;
  notification_type?: string;
  type?: string;
  message?: string;
  notification_message?: string;
  last_assistant_message?: string;
  session_id?: string;
  transcript_path?: string;
  permission_mode?: string;
  [key: string]: unknown;
}

export interface HookConfig {
  notifyOnStop?: boolean;
  notifyOnAttention?: boolean;
  sound?: string;
  notificationStyle?: 'system' | 'banner';
  titleTemplate?: string;
  messageTemplate?: string;
  includeBranch?: boolean;
  allowedRepos?: string[];
  customRepoNames?: Record<string, string>;
  focusOnClick?: boolean;
  notifierBinaryPath?: string;
  stopLabel?: string;
  permissionLabel?: string;
  idlePromptLabel?: string;
  attentionLabel?: string;
}

export interface NormalisedEvent {
  cwd: string;
  repo: string;
  branch: string;
  event: string;
  eventLabel: string;
  notificationType: string;
  notificationMessage: string;
  sessionId: string;
  transcriptPath: string;
  workspaceRoot: string;
  clickedPath: string;
  signalPath: string;
  title: string;
  message: string;
  createdAt: string;
  raw: HookInputEvent;
}
