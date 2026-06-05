import type { HookConfig } from '../hook/types';

export function resolveSound(event: string, config: HookConfig): string {
  const override = perEventOverride(event, config);
  return override || (config.sound ?? '');
}

function perEventOverride(event: string, config: HookConfig): string {
  switch (event) {
    case 'Stop':
      return config.stopSound ?? '';
    case 'PermissionRequest':
      return config.permissionSound ?? '';
    case 'PreToolUse':
      return config.questionSound ?? '';
    case 'SubagentStop':
      return config.subagentStopSound ?? '';
    default:
      return '';
  }
}
