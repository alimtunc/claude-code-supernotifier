import type { HookConfig } from '../hook/types';
import type { NotificationLevel } from '../types';

export function resolveLevel(event: string, config: HookConfig): NotificationLevel {
  switch (event) {
    case 'Stop':
      return config.stopLevel ?? defaultOnLevel(config.notifyOnStop);
    case 'Notification':
      return defaultOnLevel(config.notifyOnAttention);
    case 'PermissionRequest':
      return config.permissionLevel ?? defaultOnLevel(config.notifyOnAttention);
    case 'PreToolUse':
    case 'AskUserQuestion':
      return config.questionLevel ?? defaultOnLevel(config.notifyOnAttention);
    case 'SubagentStop':
      return config.subagentStopLevel ?? defaultOffLevel(config.notifyOnSubagentStop);
    default:
      return 'off';
  }
}

export function effectiveShowBanner(level: NotificationLevel): boolean {
  return level === 'sound+popup' || level === 'popup';
}

export function effectiveSound(level: NotificationLevel): boolean {
  return level === 'sound+popup' || level === 'sound';
}

export function withForcedLevel(config: HookConfig, event: string): HookConfig {
  switch (event) {
    case 'Stop':
      return { ...config, stopLevel: 'sound+popup' };
    case 'PermissionRequest':
      return { ...config, permissionLevel: 'sound+popup' };
    case 'PreToolUse':
    case 'AskUserQuestion':
      return { ...config, questionLevel: 'sound+popup' };
    case 'SubagentStop':
      return { ...config, subagentStopLevel: 'sound+popup' };
    case 'Notification':
      return { ...config, notifyOnAttention: true };
    default:
      return config;
  }
}

function defaultOnLevel(legacy: boolean | undefined): NotificationLevel {
  return legacy === false ? 'off' : 'sound+popup';
}

function defaultOffLevel(legacy: boolean | undefined): NotificationLevel {
  return legacy === true ? 'sound+popup' : 'off';
}
