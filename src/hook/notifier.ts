import { notify as notifyLinux } from './notifierLinux';
import { notify as notifyMacOS } from './notifierMac';
import { notify as notifyWindows } from './notifierWin';
import type { HookConfig, NormalisedEvent } from './types';

export function notify(event: NormalisedEvent, config: HookConfig): void {
  switch (process.platform) {
    case 'darwin':
      notifyMacOS(event, config);
      return;
    case 'linux':
      notifyLinux(event, config);
      return;
    case 'win32':
      notifyWindows(event, config);
      return;
    default:
      return;
  }
}
