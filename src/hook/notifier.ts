import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { HookConfig, NormalisedEvent } from './types';

export function notifyMacOS(event: NormalisedEvent, config: HookConfig): void {
  if (process.platform !== 'darwin') {
    return;
  }
  const binary = config.notifierBinaryPath;
  if (!binary) {
    return;
  }

  writeSignal(event);

  const args = [
    '--title',
    event.title,
    '--message',
    event.message,
    '--group',
    event.sessionId || event.cwd,
    '--signal-path',
    event.signalPath
  ];

  if (config.sound) {
    args.push('--sound', config.sound);
  }

  if (config.focusOnClick !== false && event.clickedPath) {
    args.push('--click-touch', event.clickedPath);
  }

  const child = cp.spawn(binary, args, {
    detached: true,
    stdio: 'ignore'
  });
  child.on('error', () => {
    // Best-effort: never let a misconfigured notifier crash the hook.
  });
  child.unref();
  // spawn (not spawnSync): the hook returns immediately while the notifier
  // waits up to its --timeout for a click.
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
    // Best-effort.
  }
}
