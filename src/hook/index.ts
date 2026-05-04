import * as fs from 'node:fs';
import { tryReadJson } from '../shared/json';
import { appDir, configPath, errorLogPath, eventLogPath } from '../shared/paths';
import { normaliseEvent, shouldNotify } from './event';
import { notifyMacOS } from './notifier';
import type { HookConfig, HookInputEvent, NormalisedEvent } from './types';

main().catch((error: unknown) => {
  recordError(error);
  process.exit(0);
});

async function main(): Promise<void> {
  const input = await readStdinJson();
  const config = tryReadJson<HookConfig>(configPath, {});
  const normalised = normaliseEvent(input, config);

  appendEvent(normalised);

  if (!shouldNotify(normalised, config)) {
    return;
  }

  notifyMacOS(normalised, config);
}

function readStdinJson(): Promise<HookInputEvent> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data.trim() ? (JSON.parse(data) as HookInputEvent) : {});
    });
  });
}

// Cap the JSONL event log so it can't grow unbounded. When the file exceeds
// EVENT_LOG_MAX_BYTES we rotate it to <name>.1 (overwriting any previous
// rotation), so disk use stays bounded at ~2× the cap.
const EVENT_LOG_MAX_BYTES = 2 * 1024 * 1024;

function appendEvent(event: NormalisedEvent): void {
  try {
    fs.mkdirSync(appDir, { recursive: true });
    rotateEventLogIfNeeded();
    fs.appendFileSync(eventLogPath, `${JSON.stringify(event)}\n`, 'utf8');
  } catch {
    // Logging is best-effort; never block the notification path.
  }
}

function rotateEventLogIfNeeded(): void {
  try {
    if (fs.statSync(eventLogPath).size <= EVENT_LOG_MAX_BYTES) {
      return;
    }
    fs.renameSync(eventLogPath, `${eventLogPath}.1`);
  } catch {
    // statSync ENOENT before first write, or rename race with another hook
    // process — either way, just continue and append.
  }
}

function recordError(error: unknown): void {
  try {
    fs.mkdirSync(appDir, { recursive: true });
    const stack = error instanceof Error ? (error.stack ?? error.message) : String(error);
    fs.appendFileSync(errorLogPath, `[${new Date().toISOString()}] ${stack}\n`, 'utf8');
  } catch {
    // Nothing more we can do.
  }
}
