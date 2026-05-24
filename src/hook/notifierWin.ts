import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import { NOTIFIER_TOAST_APP_ID } from '../shared/constants';
import { iconPath } from '../shared/paths';
import type { HookConfig, NormalisedEvent } from './types';

const DEFAULT_COMMAND = 'powershell';

export function notify(event: NormalisedEvent, config: HookConfig): void {
  const command = config.notifyCommand?.trim() || DEFAULT_COMMAND;
  const script = buildToastScript(event, config);

  const child = cp.spawn(command, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.on('error', () => {
    // Best-effort.
  });
  child.unref();
}

export function buildToastScript(event: NormalisedEvent, config: HookConfig): string {
  const title = xmlEscape(event.title);
  const message = xmlEscape(event.message);

  const imageTag =
    iconPath && fs.existsSync(iconPath)
      ? `<image placement="appLogoOverride" src="${pathToFileUri(iconPath)}"/>`
      : '';

  const audioTag =
    config.sound === '' ? '<audio silent="true"/>' : '<audio src="ms-winsoundevent:Notification.Default"/>';

  const toastXml = `<toast><visual><binding template="ToastGeneric"><text>${title}</text><text>${message}</text>${imageTag}</binding></visual>${audioTag}</toast>`;

  const psXml = toastXml.replace(/'/g, "''");
  const psAppId = NOTIFIER_TOAST_APP_ID.replace(/'/g, "''");

  return [
    '[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime]',
    '[void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType=WindowsRuntime]',
    '$xml = New-Object Windows.Data.Xml.Dom.XmlDocument',
    `$xml.LoadXml('${psXml}')`,
    '$toast = New-Object Windows.UI.Notifications.ToastNotification $xml',
    `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${psAppId}').Show($toast)`
  ].join('; ');
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function pathToFileUri(localPath: string): string {
  const normalised = localPath.replace(/\\/g, '/');
  const withSlash = normalised.startsWith('/') ? normalised : `/${normalised}`;
  return `file://${withSlash}`;
}
