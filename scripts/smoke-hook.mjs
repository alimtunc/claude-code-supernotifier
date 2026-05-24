#!/usr/bin/env node
// Smoke test: pipe a Stop event into the bundled dist/hook.js and verify the
// process exits cleanly, the JSONL event log gets appended, and no entry
// lands in errors.log. Runs unchanged on macOS, Linux and Windows.
//
// We override `notifyCommand` to a sentinel that exists on every OS so the
// detached child process can spawn without ENOENT — that way the smoke test
// stays green even on headless runners where `notify-send` / `powershell`
// would crash, while still exercising the dispatcher + every disk write.

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const HOOK_TIMEOUT_MS = 10_000;
const POST_HOOK_DRAIN_MS = 400;

const appDir = path.join(os.homedir(), '.claude-code-supernotifier');
const configPath = path.join(appDir, 'config.json');
const eventLogPath = path.join(appDir, 'events.jsonl');
const errorLogPath = path.join(appDir, 'errors.log');
const hookPath = path.resolve('dist/hook.js');

if (!fs.existsSync(hookPath)) {
  console.error(`smoke: dist/hook.js missing — run \`node esbuild.js --production\` first.`);
  process.exit(2);
}

fs.mkdirSync(appDir, { recursive: true });
fs.rmSync(eventLogPath, { force: true });
fs.rmSync(errorLogPath, { force: true });

const notifyCommand = process.platform === 'win32' ? 'cmd' : 'true';

fs.writeFileSync(
  configPath,
  JSON.stringify(
    {
      notifyOnStop: true,
      notifyOnAttention: true,
      sound: '',
      titleTemplate: '${repo}',
      messageTemplate: '${eventLabel}',
      includeBranch: false,
      focusOnClick: false,
      stopLabel: 'Smoke',
      notifyCommand,
      notifierBinaryPath: notifyCommand
    },
    null,
    2
  )
);

const sample = {
  cwd: process.cwd(),
  session_id: 'smoke-' + Date.now(),
  transcript_path: path.join(appDir, 'smoke-transcript.jsonl'),
  hook_event_name: 'Stop'
};

console.log(`smoke: running ${hookPath} on ${process.platform}`);

const child = spawn(process.execPath, [hookPath], {
  stdio: ['pipe', 'inherit', 'inherit']
});

const timer = setTimeout(() => {
  console.error(`smoke: hook timed out after ${HOOK_TIMEOUT_MS} ms — killing.`);
  child.kill('SIGKILL');
  process.exit(3);
}, HOOK_TIMEOUT_MS);

child.stdin.end(JSON.stringify(sample));

child.on('exit', (code, signal) => {
  clearTimeout(timer);

  if (signal) {
    console.error(`smoke: hook killed by signal ${signal}`);
    process.exit(4);
  }
  if (code !== 0) {
    console.error(`smoke: hook exited with code ${code}`);
    process.exit(code ?? 5);
  }

  // Give the detached notifier child a moment to settle so any synchronous
  // error from cp.spawn lands in errors.log before we read it.
  setTimeout(verifyArtifacts, POST_HOOK_DRAIN_MS);
});

function verifyArtifacts() {
  if (!fs.existsSync(eventLogPath)) {
    console.error(`smoke: events.jsonl was not written at ${eventLogPath}`);
    process.exit(6);
  }

  const lines = fs.readFileSync(eventLogPath, 'utf8').trim().split('\n').filter(Boolean);
  if (lines.length === 0) {
    console.error('smoke: events.jsonl is empty');
    process.exit(7);
  }

  let last;
  try {
    last = JSON.parse(lines[lines.length - 1]);
  } catch {
    console.error('smoke: last events.jsonl line is not valid JSON');
    console.error(lines[lines.length - 1]);
    process.exit(8);
  }

  if (last.event !== 'Stop') {
    console.error(`smoke: expected event "Stop", got "${last.event}"`);
    process.exit(9);
  }

  if (fs.existsSync(errorLogPath)) {
    const errors = fs.readFileSync(errorLogPath, 'utf8').trim();
    if (errors) {
      console.error('smoke: errors.log is non-empty:');
      console.error(errors);
      process.exit(10);
    }
  }

  console.log(`smoke: passed — ${lines.length} event(s), no errors.`);
}
