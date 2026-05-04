import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { HookConfig, NormalisedEvent } from './types';

const NOTIFIER_TIMEOUT_MS = 5000;

export function notifyMacOS(event: NormalisedEvent, config: HookConfig): void {
  if (process.platform !== 'darwin') {
    return;
  }

  if (
    config.focusOnClick !== false &&
    config.terminalNotifierPath &&
    fs.existsSync(config.terminalNotifierPath)
  ) {
    notifyWithTerminalNotifier(event, config);
    return;
  }

  notifyWithOsascript(event.title, event.message, config.sound);
}

function notifyWithTerminalNotifier(event: NormalisedEvent, config: HookConfig): void {
  writeSignal(event);

  const args = ['-title', event.title, '-message', event.message, '-group', event.sessionId || event.cwd];

  if (config.sound) {
    args.push('-sound', config.sound);
  }

  if (config.senderBundleId) {
    args.push('-sender', config.senderBundleId);
  }

  const executeCommand = createClickCommand(event, config);
  if (executeCommand) {
    args.push('-execute', executeCommand);
  } else if (event.focusUri) {
    args.push('-open', event.focusUri);
  }

  const result = cp.spawnSync(config.terminalNotifierPath ?? '', args, {
    encoding: 'utf8',
    timeout: NOTIFIER_TIMEOUT_MS
  });

  if (result.error || result.status !== 0) {
    notifyWithOsascript(event.title, event.message, config.sound);
  }
}

function notifyWithOsascript(title: string, message: string, sound: string | undefined): void {
  const parts = [
    `display notification ${appleScriptString(message)}`,
    `with title ${appleScriptString(title)}`
  ];

  if (sound) {
    parts.push(`sound name ${appleScriptString(sound)}`);
  }

  cp.spawnSync('/usr/bin/osascript', ['-e', parts.join(' ')], {
    encoding: 'utf8',
    timeout: NOTIFIER_TIMEOUT_MS
  });
}

function writeSignal(event: NormalisedEvent): void {
  try {
    fs.mkdirSync(path.dirname(event.signalPath), { recursive: true });
    fs.writeFileSync(
      event.signalPath,
      JSON.stringify(
        {
          cwd: event.cwd,
          workspaceRoot: event.workspaceRoot,
          sessionId: event.sessionId,
          transcriptPath: event.transcriptPath,
          title: event.title,
          message: event.message,
          createdAt: event.createdAt
        },
        null,
        2
      ),
      'utf8'
    );
  } catch {
    // The notification will still fire; the click signal is best-effort.
  }
}

function createClickCommand(event: NormalisedEvent, config: HookConfig): string {
  if (!event.clickedPath || !event.workspaceRoot) {
    return '';
  }

  const editorCliPath = config.editorCliPath || 'code';
  return `/usr/bin/touch ${shellQuote(event.clickedPath)} && ${shellQuote(editorCliPath)} ${shellQuote(event.workspaceRoot)}`;
}

function appleScriptString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
