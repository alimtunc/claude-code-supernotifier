import type { NotificationLevel } from '../types';

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
  tool_name?: string;
  agent_id?: string;
  [key: string]: unknown;
}

export interface HookConfig {
  notifyOnStop?: boolean;
  notifyOnAttention?: boolean;
  notifyOnSubagentStop?: boolean;
  suppressSubagentInteractions?: boolean;
  minTaskDurationSeconds?: number;
  sound?: string;
  stopSound?: string;
  permissionSound?: string;
  questionSound?: string;
  subagentStopSound?: string;
  stopLevel?: NotificationLevel;
  permissionLevel?: NotificationLevel;
  questionLevel?: NotificationLevel;
  subagentStopLevel?: NotificationLevel;
  notificationStyle?: 'system' | 'banner';
  titleTemplate?: string;
  messageTemplate?: string;
  includeBranch?: boolean;
  allowedRepos?: string[];
  customRepoNames?: Record<string, string>;
  focusOnClick?: boolean;
  notifierBinaryPath?: string;
  notifyCommand?: string;
  stopLabel?: string;
  permissionLabel?: string;
  idlePromptLabel?: string;
  attentionLabel?: string;
  questionLabel?: string;
  subagentStopLabel?: string;
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
  pidChain: number[];
  createdAt: string;
  raw: HookInputEvent;
}
