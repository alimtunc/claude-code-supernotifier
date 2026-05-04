import * as path from 'node:path';
import { readJson, writeJson } from './shared/json';
import { claudeSettingsPath, helperPath } from './shared/paths';
import type { ClaudeHookCommand, ClaudeHookGroup, ClaudeSettings } from './types';

const CLAUDE_HOOK_EVENTS = ['Stop', 'Notification', 'PermissionRequest', 'UserPromptSubmit'] as const;
const MANAGED_EVENTS = ['Stop', 'Notification', 'PermissionRequest'] as const;
const NOTIFICATION_MATCHER = 'permission_prompt|idle_prompt';

const KNOWN_THIRD_PARTY_HOOK_FRAGMENTS = [
  'dimokol.claude-notifications',
  'claude-notifications',
  '/notify-input-needed.sh',
  '/notify-stop.sh'
];

export function installClaudeHooks(): void {
  const settings = readJson<ClaudeSettings>(claudeSettingsPath, {});
  writeJson(claudeSettingsPath, applyInstallToSettings(settings, quoteForShell(helperPath)));
}

export function uninstallClaudeHooks(): void {
  const settings = readJson<ClaudeSettings | null>(claudeSettingsPath, null);
  if (!settings?.hooks) {
    return;
  }
  writeJson(claudeSettingsPath, applyUninstallFromSettings(settings, quoteForShell(helperPath)));
}

export function isClaudeHooksInstalled(): boolean {
  const settings = readJson<ClaudeSettings | null>(claudeSettingsPath, null);
  return settings ? settingsContainsHook(settings, quoteForShell(helperPath)) : false;
}

export function applyInstallToSettings(settings: ClaudeSettings, command: string): ClaudeSettings {
  const next = cloneSettings(settings);
  next.hooks = next.hooks ?? {};

  removeKnownNotificationHooks(next);

  ensureHook(next, 'Stop', undefined, command);
  ensureHook(next, 'Notification', NOTIFICATION_MATCHER, command);
  ensureHook(next, 'PermissionRequest', undefined, command);

  return next;
}

export function applyUninstallFromSettings(settings: ClaudeSettings, command: string): ClaudeSettings {
  const next = cloneSettings(settings);
  if (!next.hooks) {
    return next;
  }

  for (const eventName of MANAGED_EVENTS) {
    const groups = next.hooks[eventName];
    if (!groups) continue;

    const filtered = removeHook(groups, command);
    if (filtered.length === 0) {
      delete next.hooks[eventName];
    } else {
      next.hooks[eventName] = filtered;
    }
  }

  if (Object.keys(next.hooks).length === 0) {
    delete next.hooks;
  }
  return next;
}

export function settingsContainsHook(settings: ClaudeSettings, command: string): boolean {
  if (!settings.hooks) return false;
  return MANAGED_EVENTS.some((eventName) =>
    settings.hooks?.[eventName]?.some((group) => hasHook(group, command))
  );
}

export function quoteForShell(value: string): string {
  return `'${path.normalize(value).replace(/'/g, `'\\''`)}'`;
}

function cloneSettings(settings: ClaudeSettings): ClaudeSettings {
  return JSON.parse(JSON.stringify(settings)) as ClaudeSettings;
}

function ensureHook(
  settings: ClaudeSettings,
  eventName: (typeof MANAGED_EVENTS)[number],
  matcher: string | undefined,
  command: string
): void {
  settings.hooks = settings.hooks ?? {};
  const groups = (settings.hooks[eventName] = settings.hooks[eventName] ?? []);

  const existing = groups.find((group) => group.matcher === matcher || (!group.matcher && !matcher));
  const group = existing ?? { hooks: [] };

  if (matcher) {
    group.matcher = matcher;
  }
  group.hooks = Array.isArray(group.hooks) ? group.hooks : [];

  if (!hasHook(group, command)) {
    group.hooks.push({ type: 'command', command });
  }

  if (!existing) {
    groups.push(group);
  }
}

function removeHook(groups: ClaudeHookGroup[], command: string): ClaudeHookGroup[] {
  return groups
    .map((group) => withFilteredHooks(group, (hook) => hook.type !== 'command' || hook.command !== command))
    .filter((group) => Array.isArray(group.hooks) && group.hooks.length > 0);
}

function hasHook(group: ClaudeHookGroup, command: string): boolean {
  return Boolean(group.hooks?.some((hook) => hook.type === 'command' && hook.command === command));
}

function removeKnownNotificationHooks(settings: ClaudeSettings): void {
  for (const eventName of CLAUDE_HOOK_EVENTS) {
    const groups = settings.hooks?.[eventName];
    if (!groups) continue;

    const filtered = groups
      .map((group) => withFilteredHooks(group, (hook) => !isKnownNotificationHook(hook.command)))
      .filter((group) => Array.isArray(group.hooks) && group.hooks.length > 0);

    if (filtered.length > 0) {
      settings.hooks![eventName] = filtered;
    } else {
      delete settings.hooks![eventName];
    }
  }
}

function isKnownNotificationHook(command: string): boolean {
  if (command.includes(helperPath)) {
    return true;
  }
  return KNOWN_THIRD_PARTY_HOOK_FRAGMENTS.some((fragment) => command.includes(fragment));
}

function withFilteredHooks(
  group: ClaudeHookGroup,
  predicate: (hook: ClaudeHookCommand) => boolean
): ClaudeHookGroup {
  const next: ClaudeHookGroup = { hooks: group.hooks?.filter(predicate) };
  if (group.matcher !== undefined) {
    next.matcher = group.matcher;
  }
  return next;
}
