import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import { NOTIFIER_DISPLAY_NAME } from '../shared/constants';
import { iconPath } from '../shared/paths';
import type { HookConfig, NormalisedEvent } from './types';

const DEFAULT_COMMAND = 'notify-send';

export function notify(event: NormalisedEvent, config: HookConfig): void {
  const command = config.notifyCommand?.trim() || DEFAULT_COMMAND;

  const args = ['--app-name', NOTIFIER_DISPLAY_NAME, '--urgency', 'normal'];

  if (fs.existsSync(iconPath)) {
    args.push('--icon', iconPath);
  }

  args.push(event.title, event.message);

  const child = cp.spawn(command, args, {
    detached: true,
    stdio: 'ignore'
  });
  child.on('error', () => {
    // notify-send (or the user-provided notifyCommand) is missing from PATH.
    // Silent failure — recorded by the hook's stderr/errors.log if it crashes.
  });
  child.unref();
}
