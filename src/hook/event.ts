import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEFAULTS } from '../shared/constants';
import { effectiveShowBanner, resolveLevel } from '../shared/level';
import { isMuted } from '../shared/mute';
import { ownedFolder, ownerOf } from '../shared/ownership';
import { getClickedPath, getFocusedPath, getSignalPath } from '../shared/paths';
import { readStageState, reasonForEvent, shouldFire } from '../shared/stage';
import { shouldSuppressForThreshold } from '../shared/taskTimer';
import { renderTemplate, truncate } from '../shared/template';
import { getGitBranch } from './git';
import { readMarkers } from './ownership';
import { getAncestorPids } from './pid';
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
  const pidChain = isClickableBannerEvent(event, input.tool_name) ? getAncestorPids() : [];

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
    pidChain,
    createdAt: new Date().toISOString(),
    raw: input
  };
}

function isClickableBannerEvent(event: string, toolName: string | undefined): boolean {
  return (
    event === 'Stop' ||
    event === 'PermissionRequest' ||
    (event === 'PreToolUse' && toolName === 'AskUserQuestion')
  );
}

export function shouldNotify(event: NormalisedEvent, config: HookConfig): boolean {
  if (isMuted()) {
    return false;
  }
  const allowedRepos = config.allowedRepos ?? [];
  if (allowedRepos.length > 0 && !allowedRepos.includes(path.basename(event.cwd))) {
    return false;
  }
  // The owning window (the live window whose folder physically contains the cwd)
  // decides focus suppression. With no owner, no live window holds the cwd — the
  // seam for a future terminal-only fallback — so we fall back to the normalised root.
  const owner = ownerOf(event.cwd, readMarkers());
  const focusRoot = owner ? (ownedFolder(event.cwd, owner) ?? event.workspaceRoot) : event.workspaceRoot;
  if (fs.existsSync(getFocusedPath(focusRoot))) {
    return false;
  }

  if (
    isThresholdEligible(event) &&
    shouldSuppressForThreshold(event.sessionId, config.minTaskDurationSeconds ?? 0, Date.now())
  ) {
    return false;
  }

  const reason = reasonForEvent(event.event, event.raw.tool_name);
  if (reason !== null && !shouldFire(readStageState(event.sessionId), reason).fire) {
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

  if (event.event === 'PermissionRequest' && event.raw.tool_name === 'AskUserQuestion') {
    return false;
  }
  if (isLevelGated(event)) {
    return effectiveShowBanner(resolveLevel(event.event, config));
  }
  return false;
}

function isLevelGated(event: NormalisedEvent): boolean {
  return (
    event.event === 'Stop' ||
    event.event === 'Notification' ||
    event.event === 'PermissionRequest' ||
    event.event === 'SubagentStop' ||
    (event.event === 'PreToolUse' && event.raw.tool_name === 'AskUserQuestion')
  );
}

function isThresholdEligible(event: NormalisedEvent): boolean {
  return (
    event.event === 'Stop' ||
    event.event === 'PermissionRequest' ||
    (event.event === 'PreToolUse' && event.raw.tool_name === 'AskUserQuestion')
  );
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
