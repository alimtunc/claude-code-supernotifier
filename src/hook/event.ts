import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEFAULTS } from '../shared/constants';
import { getClickedPath, getFocusedPath, getSignalPath } from '../shared/paths';
import { renderTemplate, truncate } from '../shared/template';
import { getGitBranch } from './git';
import { findWorkspaceRoot } from './workspace';
import type { HookConfig, HookInputEvent, NormalisedEvent } from './types';

const ASSISTANT_MESSAGE_MAX_LENGTH = 180;

export function normaliseEvent(input: HookInputEvent, config: HookConfig): NormalisedEvent {
  const cwd = input.cwd ?? process.cwd();
  const folderName = path.basename(cwd);
  const customRepoNames = config.customRepoNames ?? {};
  const repo = customRepoNames[folderName] ?? folderName;
  const branch = getGitBranch(cwd);
  const event = input.hook_event_name ?? 'Unknown';
  const notificationType = input.notification_type ?? input.type ?? '';
  const notificationMessage = input.message ?? input.notification_message ?? '';
  const lastAssistantMessage = truncate(input.last_assistant_message ?? '', ASSISTANT_MESSAGE_MAX_LENGTH);
  const eventLabel = getEventLabel(event, notificationType, notificationMessage, config);
  const branchSuffix = config.includeBranch && branch ? ` · ${branch}` : '';
  const sessionId = input.session_id ?? '';
  const transcriptPath = input.transcript_path ?? '';

  const variables: Record<string, string> = {
    repo,
    branch,
    branchSuffix,
    cwd,
    event,
    eventLabel,
    notificationType,
    notificationMessage,
    lastAssistantMessage,
    sessionId,
    transcriptPath
  };

  const workspaceRoot = findWorkspaceRoot(cwd);
  const title = renderTemplate(config.titleTemplate ?? DEFAULTS.titleTemplate, variables);
  const message = renderTemplate(config.messageTemplate ?? DEFAULTS.messageTemplate, variables);

  return {
    cwd,
    repo,
    branch,
    event,
    eventLabel,
    notificationType,
    notificationMessage,
    sessionId,
    transcriptPath,
    workspaceRoot,
    clickedPath: getClickedPath(workspaceRoot),
    signalPath: getSignalPath(workspaceRoot),
    title,
    message,
    createdAt: new Date().toISOString(),
    raw: input
  };
}

export function shouldNotify(event: NormalisedEvent, config: HookConfig): boolean {
  const allowedRepos = config.allowedRepos ?? [];
  if (allowedRepos.length > 0 && !allowedRepos.includes(path.basename(event.cwd))) {
    return false;
  }
  if (fs.existsSync(getFocusedPath(event.workspaceRoot))) {
    return false;
  }

  const isInteraction =
    event.event === 'PermissionRequest' ||
    (event.event === 'PreToolUse' && event.raw.tool_name === 'AskUserQuestion');
  const agentId = event.raw.agent_id;
  if (
    isInteraction &&
    config.suppressSubagentInteractions !== false &&
    typeof agentId === 'string' &&
    agentId.length > 0
  ) {
    return false;
  }

  if (event.event === 'Stop') {
    return config.notifyOnStop !== false;
  }
  if (event.event === 'Notification') {
    return config.notifyOnAttention !== false;
  }
  if (event.event === 'PermissionRequest') {
    if (event.raw.tool_name === 'AskUserQuestion') {
      return false;
    }
    return config.notifyOnAttention !== false;
  }
  if (event.event === 'PreToolUse' && event.raw.tool_name === 'AskUserQuestion') {
    return config.notifyOnAttention !== false;
  }
  if (event.event === 'SubagentStop') {
    return config.notifyOnSubagentStop === true;
  }
  return false;
}

function getEventLabel(
  event: string,
  notificationType: string,
  notificationMessage: string,
  config: HookConfig
): string {
  if (event === 'Stop') {
    return config.stopLabel ?? DEFAULTS.stopLabel;
  }
  if (event === 'SubagentStop') {
    return config.subagentStopLabel ?? DEFAULTS.subagentStopLabel;
  }
  if (event === 'PermissionRequest') {
    return config.permissionLabel ?? DEFAULTS.permissionLabel;
  }
  if (event === 'PreToolUse') {
    return config.questionLabel ?? DEFAULTS.questionLabel;
  }
  if (event === 'Notification') {
    if (notificationType === 'permission_prompt') {
      return config.permissionLabel ?? DEFAULTS.permissionLabel;
    }
    if (notificationType === 'idle_prompt') {
      return config.idlePromptLabel ?? DEFAULTS.idlePromptLabel;
    }
    return notificationMessage || (config.attentionLabel ?? DEFAULTS.attentionLabel);
  }
  return event;
}
