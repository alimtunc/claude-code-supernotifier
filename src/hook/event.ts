import * as path from 'node:path';
import { DEFAULTS } from '../shared/constants';
import { getClickedPath, getSignalPath } from '../shared/paths';
import { renderTemplate, truncate } from '../shared/template';
import type { HookConfig, HookInputEvent, NormalisedEvent } from './types';
import { getGitBranch } from './git';
import { findWorkspaceRoot } from './workspace';

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
  const eventLabel = getEventLabel(event, notificationType, notificationMessage);
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

  const focusUri = createFocusUri(variables, config);
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
    focusUri,
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
  if (event.event === 'Stop') {
    return config.notifyOnStop !== false;
  }
  if (event.event === 'Notification') {
    return config.notifyOnAttention !== false;
  }
  return false;
}

function getEventLabel(event: string, notificationType: string, notificationMessage: string): string {
  if (event === 'Stop') {
    return 'Réponse terminée';
  }
  if (event === 'Notification') {
    if (notificationType === 'permission_prompt') {
      return 'Permission requise';
    }
    if (notificationType === 'idle_prompt') {
      return 'Claude attend ton input';
    }
    return notificationMessage || 'Claude a besoin de toi';
  }
  return event;
}

function createFocusUri(variables: Record<string, string>, config: HookConfig): string {
  if (config.focusOnClick === false || !config.editorUriScheme || !config.extensionUriAuthority) {
    return '';
  }

  const params = new URLSearchParams();
  params.set('cwd', variables.cwd ?? '');
  if (variables.sessionId) {
    params.set('sessionId', variables.sessionId);
  }
  if (variables.transcriptPath) {
    params.set('transcriptPath', variables.transcriptPath);
  }

  return `${config.editorUriScheme}://${config.extensionUriAuthority}/focus?${params.toString()}`;
}
