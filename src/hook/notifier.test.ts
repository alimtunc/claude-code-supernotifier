import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notify } from './notifier';
import * as linux from './notifierLinux';
import * as mac from './notifierMac';
import * as win from './notifierWin';
import type { HookConfig, NormalisedEvent } from './types';

vi.mock('./notifierMac', () => ({ notify: vi.fn() }));
vi.mock('./notifierLinux', () => ({ notify: vi.fn() }));
vi.mock('./notifierWin', () => ({ notify: vi.fn() }));

const event = { title: 't', message: 'm' } as unknown as NormalisedEvent;
const config: HookConfig = {};

describe('notifier dispatcher', () => {
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    vi.mocked(mac.notify).mockReset();
    vi.mocked(linux.notify).mockReset();
    vi.mocked(win.notify).mockReset();
  });

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  it('routes darwin to notifierMac', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    notify(event, config);
    expect(mac.notify).toHaveBeenCalledWith(event, config);
    expect(linux.notify).not.toHaveBeenCalled();
    expect(win.notify).not.toHaveBeenCalled();
  });

  it('routes linux to notifierLinux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    notify(event, config);
    expect(linux.notify).toHaveBeenCalledWith(event, config);
    expect(mac.notify).not.toHaveBeenCalled();
    expect(win.notify).not.toHaveBeenCalled();
  });

  it('routes win32 to notifierWin', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    notify(event, config);
    expect(win.notify).toHaveBeenCalledWith(event, config);
    expect(mac.notify).not.toHaveBeenCalled();
    expect(linux.notify).not.toHaveBeenCalled();
  });

  it('is a no-op on other platforms', () => {
    Object.defineProperty(process, 'platform', { value: 'freebsd' });
    notify(event, config);
    expect(mac.notify).not.toHaveBeenCalled();
    expect(linux.notify).not.toHaveBeenCalled();
    expect(win.notify).not.toHaveBeenCalled();
  });
});
