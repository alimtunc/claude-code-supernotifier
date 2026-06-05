import * as fs from 'node:fs';
import { isInsideCmux } from '../shared/env';
import { tryReadJson } from '../shared/json';
import { appDir, configPath, errorLogPath, eventLogPath } from '../shared/paths';
import { advanceStage, reasonForEvent, readStageState, shouldFire, writeStageState } from '../shared/stage';
import { recordTaskStart } from '../shared/taskTimer';
import { normaliseEvent, shouldNotify } from './event';
import { notify } from './notifier';
import type { HookConfig, HookInputEvent, NormalisedEvent } from './types';

if (require.main === module) {
  main().catch((error: unknown) => {
    recordError(error);
    process.exit(0);
  });
}

async function main(): Promise<void> {
  const input = await readStdinJson();
  runHook(input, process.argv, process.env);
}

export function runHook(input: HookInputEvent, argv: string[], env: NodeJS.ProcessEnv): void {
  const config = tryReadJson<HookConfig>(configPath, {});
  const normalised = normaliseEvent(input, config);

  appendEvent(normalised);

  if (normalised.event === 'UserPromptSubmit') {
    recordTaskStart(normalised.sessionId, Date.now());
    writeStageState(normalised.sessionId, advanceStage(readStageState(normalised.sessionId)));
  }

  // --test is an explicit diagnostic: fire regardless of mute/focus/settings/threshold/dedup/cmux.
  const isTestRun = argv.includes('--test');
  if (!isTestRun) {
    if (!shouldNotify(normalised, config)) {
      return;
    }
    markReasonFired(normalised);
    // cmux posts its own native banner; suppress ours at the output layer only —
    // the event log above already recorded everything the status bar needs.
    if (isInsideCmux(env)) {
      return;
    }
  }

  notify(normalised, config);
}

function markReasonFired(event: NormalisedEvent): void {
  const reason = reasonForEvent(event.event, event.raw.tool_name);
  if (reason === null) {
    return;
  }
  writeStageState(event.sessionId, shouldFire(readStageState(event.sessionId), reason).next);
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
