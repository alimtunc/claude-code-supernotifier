# Noise control: duration threshold, per-session stage dedup, cmux awareness

- **Priority:** high
- **Complexity:** XL
- **Theme:** Thresholds
- **Status:** To do
- **Depends on:** [Expand the event model](01-event-model.md)
- **Combines:** former ticket 03 (min task-duration threshold), per-session stage dedup, cmux awareness

## Scope

Three independent noise sources share the same two seams — the per-event hook
entry [`main()`](../../src/hook/index.ts#L13-L25) and the gate
[`shouldNotify`](../../src/hook/event.ts#L65-L80) — so they are cheaper to land
in one pass than three. All three reduce _redundant_ banners without changing
which events are notifiable (that is ticket 01's job):

- **Part 1** suppresses sub-second turns via a per-session task-start marker.
- **Part 2** coalesces repeat banners within one prompt to at most one per
  `(sessionId, reason)`, file-backed because our hook is a fresh short-lived
  process per event.
- **Part 3** stops double-notifying when Claude runs inside cmux, which posts
  its own native banner.

Shared building blocks land once and are reused across the parts:

- A single `sanitiseSessionId` helper (Part 1) is the path-traversal guard for
  **both** the `task-start/` and `stage/` per-session files.
- A single 24h marker sweep on activation cleans **both** directories.
- Every new on-disk read/write stays inside `src/shared/` (pure logic) with the
  only `fs` I/O performed by [`index.ts`](../../src/hook/index.ts); nothing
  under `src/shared/` or `src/hook/` imports `vscode`.

Order of gating inside `shouldNotify` after this epic:

1. `allowedRepos` filter ([event.ts:66-69](../../src/hook/event.ts#L66-L69))
2. focus suppression ([event.ts:70-72](../../src/hook/event.ts#L70-L72))
3. **Part 1** duration-threshold suppression
4. **Part 2** stage dedup
5. per-event notify branches ([event.ts:73-79](../../src/hook/event.ts#L73-L79))

cmux suppression (**Part 3**) deliberately lives one layer _out_, at the
[`notify(...)` call](../../src/hook/index.ts#L24) in `main()`, so the event log
still records everything the status bar needs.

## Part 1 — Minimum task-duration threshold

### Problem

When you are actively watching the IDE, sub-second Claude turns still fire a
banner + sound — pure noise. We have no way to say "only ping me if the task ran
longer than N seconds". This is the single most-requested noise control in the
reference project (their issue #1). We already install a `UserPromptSubmit` hook
([claudeHooks.ts:47](../../src/claudeHooks.ts#L47)) but currently only log it for
status-bar state ([appendEvent](../../src/hook/index.ts#L45-L53)), so the
plumbing to time a task is half-there.

### Proposal

Record a per-session task-start timestamp on `UserPromptSubmit`, then suppress
`Stop` / `PermissionRequest` / question notifications for tasks shorter than the
threshold.

1. **Setting (`minTaskDurationSeconds`).** Follow the CLAUDE.md "Adding a
   setting" checklist: declare it in `package.json`
   `contributes.configuration.properties` (number, default `0` = off, clamp
   `0..3600`), add the default to
   [DEFAULTS](../../src/shared/constants.ts#L18-L35), add the field to
   [`SupernotifierConfig`](../../src/types.ts#L1-L21) and
   [`HookConfig`](../../src/hook/types.ts#L15-L32), and read+clamp it in
   [`getRuntimeConfig`](../../src/config.ts#L7-L31). Document it in `README.md`
   "Settings".

2. **Constants + path helper.** Add a `TASK_START_DIR_NAME` (e.g.
   `'task-start'`) constant to
   [shared/constants.ts](../../src/shared/constants.ts#L1-L10) (alongside
   `FOCUS_STATE_DIR_NAME`) and a `getTaskStartPath(sessionId)` to
   [shared/paths.ts](../../src/shared/paths.ts#L36-L46) returning
   `appDir/<TASK_START_DIR_NAME>/<safeSessionId>.json`. Mirror the existing
   `getSignalPath`/`getFocusedPath` shape and add a `getTaskStartPath` case to
   [paths.test.ts](../../src/shared/paths.test.ts#L46-L52).

3. **Pure timer module — `src/shared/taskTimer.ts` (no `vscode`).**
   - `sanitiseSessionId(id: string): string` → keep `[A-Za-z0-9._-]`, strip
     `..`, fall back to a sentinel (e.g. `'_'`) for empty/missing ids. This is
     the shared path-traversal guard reused by Part 2.
   - `recordTaskStart(sessionId: string, now: number): void` → write
     `{ startedAt: now, sessionId }` to `getTaskStartPath(...)`, wrapped in
     `try` (best-effort, like [appendEvent](../../src/hook/index.ts#L45-L53)).
   - `isUnderThreshold(startedAt: number, now: number, thresholdSec: number): boolean`
     → **pure**, returns `true` only when `thresholdSec > 0` and
     `now - startedAt < thresholdSec * 1000`.
   - `shouldSuppressForThreshold(sessionId: string, thresholdSec: number, now: number): boolean`
     → reads the marker and delegates to `isUnderThreshold`. **Fail open**:
     missing/corrupt marker or `thresholdSec <= 0` ⇒ `false` (notify).

4. **Wire the recorder.** In [index.ts `main()`](../../src/hook/index.ts#L13-L25),
   after [`appendEvent(normalised)`](../../src/hook/index.ts#L18) and when
   `normalised.event === 'UserPromptSubmit'`, call
   `recordTaskStart(normalised.sessionId, Date.now())` (best-effort, wrapped in
   `try`). `index.ts` performs the file write; `taskTimer.ts` stays pure-ish
   (only `fs` it owns, no `vscode`).

5. **Wire the suppressor.** In [`shouldNotify`](../../src/hook/event.ts#L65-L80),
   immediately after the focus check
   ([event.ts:70-72](../../src/hook/event.ts#L70-L72)) and before the per-event
   branches, return `false` when the event is `Stop` / `PermissionRequest` /
   question (the `PreToolUse`+`AskUserQuestion` shape from ticket 01) and
   `shouldSuppressForThreshold(event.sessionId, config.minTaskDurationSeconds, Date.now())`.

6. **Cleanup.** Sweep `task-start` markers older than 24h on extension
   activation; see the consolidated sweep in
   [Reference implementation](#reference-implementation). The sweep used by the
   extension host may live in [runtimeFiles.ts](../../src/runtimeFiles.ts) (it
   may import `vscode`); the pure age predicate stays in `taskTimer.ts`.

### Acceptance criteria

- [ ] `UserPromptSubmit` writes a per-session task-start marker under
      `appDir/task-start/` (`recordTaskStart`).
- [ ] `isUnderThreshold` is pure and unit-tested; returns `true` only when
      `now - startedAt < threshold * 1000` and `threshold > 0`.
- [ ] `shouldSuppressForThreshold` fails open on missing/corrupt marker or
      `threshold <= 0` (`taskTimer.test.ts`).
- [ ] `shouldNotify` suppresses `Stop` / `PermissionRequest` / question when
      under threshold and the marker exists; the new
      [event.test.ts](../../src/hook/event.test.ts) case mocks `fs` like the
      existing focus test ([event.test.ts:5-11](../../src/hook/event.test.ts#L5-L11)).
- [ ] A crafted `session_id` (e.g. `../../escape`) cannot escape the
      `task-start` directory (`taskTimer.test.ts` path-traversal case).
- [ ] `minTaskDurationSeconds` declared in `package.json`, clamp `0..3600`
      applied in `getRuntimeConfig`, single default in `DEFAULTS`.
- [ ] Stale markers (>24h) cleaned on activation; `taskTimer.ts` imports no
      `vscode`; `grep -rn "from 'vscode'" src/shared src/hook` returns nothing.

## Part 2 — Per-session, per-reason stage dedup

### Problem

If Claude stops-and-continues several times within one prompt (e.g. a Stop
followed by a permission prompt followed by another Stop), our **stateless**
per-event hook fires a banner each time. The reference project solves this with
a long-lived extension-host state machine that holds per-session `Set`s in
memory; our hook is the opposite — a fresh short-lived process per event
([`main()`](../../src/hook/index.ts#L13-L25) runs once and exits), so it has no
process memory to dedup against.

### Proposal

Coalesce to at most one notification per `(sessionId, reason)` per **stage**,
where a stage spans one `UserPromptSubmit` to the next. Because we cannot hold
in-process state, **adapt the reference's in-memory machine to a file-backed
one**: a tiny JSON state file per session.

1. **Pure module — `src/shared/stage.ts` (no `vscode`).** State shape per
   session: `{ stageId: number, firedReasons: string[] }`, persisted at
   `appDir/stage/<safeSessionId>.json`. Reuse `sanitiseSessionId` from
   `taskTimer.ts` (Part 1) — do not re-implement the guard. Add a
   `STAGE_DIR_NAME` constant to
   [shared/constants.ts](../../src/shared/constants.ts#L1-L10) and a
   `getStagePath(sessionId)` to
   [shared/paths.ts](../../src/shared/paths.ts#L36-L46) (+ a
   [paths.test.ts](../../src/shared/paths.test.ts) case).
   - `advanceStage(state): StageState` → **pure**: increment `stageId`, clear
     `firedReasons`. Called on `UserPromptSubmit`.
   - `shouldFire(state, reason): { fire: boolean; next: StageState }` →
     **pure**: `fire` is `false` if `reason` is already in `firedReasons`,
     otherwise `true` and `next` adds it.
   - A thin reader/writer (`readStageState`/`writeStageState`) that owns the
     `fs` access for the file; both **fail open** on missing/corrupt file
     (treat as a fresh stage with empty `firedReasons` ⇒ notify).

2. **Reasons.** Map our events to a small `reason` string set: `Stop` → `done`,
   `Notification(idle_prompt)`/permission → `input`, question (`PreToolUse` +
   `AskUserQuestion`) → `question`. `SubagentStop` deliberately **bypasses**
   dedup (a subagent finishing is always worth surfacing) — short-circuit before
   the `shouldFire` check.

3. **Wire into the hook.** Stage transitions and the dedup check are decided in
   [`shouldNotify`](../../src/hook/event.ts#L65-L80) **after** the Part 1
   threshold check; the actual file write is performed by
   [`index.ts`](../../src/hook/index.ts) so all `fs` I/O stays centralised
   there. On `UserPromptSubmit`, `main()` calls `advanceStage`-then-persist
   (this is also where Part 1 records the task start, so both writes happen in
   the same `UserPromptSubmit` branch). On a notifiable event, `main()` reads
   state, asks `shouldFire`, and only persists `next` + proceeds to `notify`
   when `fire` is `true`.

4. **Cleanup.** Reuse the same 24h sweep as Part 1 against the `stage/`
   directory.

### Acceptance criteria

- [ ] `stage.ts` is pure (no `fs`, no `vscode` in `advanceStage`/`shouldFire`);
      the reader/writer is the only `fs` boundary and both fail open.
- [ ] Two consecutive notifiable events with the same `reason` within one stage
      produce exactly one notification (`stage.test.ts`).
- [ ] A `UserPromptSubmit` between them resets `firedReasons` so the next event
      with the same `reason` fires again.
- [ ] Different reasons in the same stage each fire once
      (`done` + `input` ⇒ two banners).
- [ ] `SubagentStop` bypasses dedup and always fires.
- [ ] Missing/corrupt stage file fails open (notify).
- [ ] State files live under `appDir/stage/<safeSessionId>.json`, reuse
      `sanitiseSessionId`, and a crafted `session_id` cannot escape the
      directory.
- [ ] `grep -rn "from 'vscode'" src/shared src/hook` returns nothing.

> **Adaptation note.** The reference keeps a `Map<sessionId, { stageId, fired:
Set, idleTimer }>` alive in the extension host and resets a stage on a 30-min
> idle timer. We have no long-lived process at the hook layer, so we persist the
> equivalent record to disk per session and rely on the shared 24h marker sweep
> instead of an in-process idle timer. The `firedReasons: string[]` array is the
> on-disk analogue of the in-memory `Set`.

## Part 3 — cmux awareness

### Problem

When Claude runs inside the cmux terminal, cmux posts its own native banner.
Our hook also fires, so the user gets **two** notifications for one event.

### Proposal

Detect cmux and suppress only the _output_ (the banner), keeping the event log
intact so the status bar stays consistent.

1. **Pure detector — `src/shared/env.ts` (no `vscode`).**
   `isInsideCmux(env: NodeJS.ProcessEnv): boolean` → returns `true` iff
   `env.CMUX_CLAUDE_HOOK_CMUX_BIN` is set. This is the exact signal cmux exports
   **only when it will post its own banner**; do **not** gate on the generic
   `$TMUX` variable (that would suppress in plain tmux where no native banner
   exists).

2. **Wire at the output layer.** In
   [index.ts `main()`](../../src/hook/index.ts#L13-L25): keep
   [`appendEvent(normalised)`](../../src/hook/index.ts#L18) unconditional, then
   skip the [`notify(normalised, config)` call](../../src/hook/index.ts#L24)
   when `isInsideCmux(process.env)`. This is strictly output-layer: no change to
   `shouldNotify`, no change to the event log, no new setting.

### Acceptance criteria

- [ ] `isInsideCmux` is pure and unit-tested: `true` only when
      `CMUX_CLAUDE_HOOK_CMUX_BIN` is present; `false` for `$TMUX`-only and for an
      empty env (`env.test.ts`).
- [ ] Inside cmux, `main()` still appends the event to the log but does not call
      `notify` (covered by a `hook/index` test that mocks `notify` and asserts
      it is not invoked while `appendEvent` is).
- [ ] No new user-facing setting; `env.ts` imports no `vscode`; boundary grep
      passes.

## Reference implementation

> The reference project is a long-lived VSCode extension with an in-memory state
> machine. Our hook is a short-lived per-event process, so Parts 1 and 2 are
> re-implemented file-backed. Reference paths are cited as inline code (the
> reference repo is not in this workspace).

- **Part 1 (threshold).** Marker write: `hook/_lib/task-timer.js`
  `recordTaskStart`, called from `hook/claude-notifier-on-prompt.js`.
  Suppression check `shouldSuppressForThreshold` (fail-open, sessionId
  sanitised) in `src/signals/task-timer.ts`, consumed by
  `hook/claude-notifier-on-stop.js`. Clamp `0..3600` in
  `src/settings/sync.ts`. Tests: `test/unit/signals.task-timer.test.ts`.
- **Part 2 (stage dedup).** In-memory state machine
  `src/signals/stage.ts` — `Map<sessionId, { stageId, fired: Set, idleTimer }>`
  with `shouldFire`/`advance`, a 30-min idle reset, and a subagent bypass —
  wired in `src/signals/dispatch.ts`. Tests:
  `test/unit/signals.stage.test.ts`. **Our adaptation:** swap the in-memory
  `Map`/`Set`/idle-timer for a per-session JSON file
  (`appDir/stage/<safeSessionId>.json` with `{ stageId, firedReasons[] }`) plus
  the shared 24h sweep; keep the subagent bypass.
- **Part 3 (cmux).** `hook/_lib/cmux.js` gates on
  `CMUX_CLAUDE_HOOK_CMUX_BIN`; suppression at the output layer in
  `hook/_lib/play.js` and `hook/_lib/notify.js` while still writing the signal.
  Documented in their CHANGELOG `v3.3.0`.
- **Shared sweep (Parts 1 + 2).** One activation-time sweep removes files older
  than 24h from **both** `appDir/task-start/` and `appDir/stage/`. The pure age
  predicate lives next to the timer logic in `taskTimer.ts`; the
  `fs`/`vscode`-touching driver lives in
  [runtimeFiles.ts](../../src/runtimeFiles.ts#L9-L22) and is invoked from the
  existing [`writeRuntimeFiles(context)`](../../src/runtimeFiles.ts#L9) call on
  `activate()` (extension.ts:20).

## Definition of done

Run in order (CLAUDE.md "Definition of done"):

```sh
pnpm run lint        # oxlint
pnpm run format      # oxfmt (writes; sorts imports)
pnpm run typecheck   # tsgo --noEmit
pnpm test            # vitest run
node esbuild.js --production   # bundles both extension + hook
```

Plus:

- [ ] `grep -rn "from 'vscode'" src/shared src/hook` returns nothing
      (`taskTimer.ts`, `stage.ts`, `env.ts` are all pure).
- [ ] `minTaskDurationSeconds` is the only new setting and is wired through all
      six CLAUDE.md "Adding a setting" steps; Parts 2 and 3 add **no** settings.
- [ ] `DEFAULTS` in [shared/constants.ts](../../src/shared/constants.ts#L18-L35)
      remains the single source of truth for `minTaskDurationSeconds`.
- [ ] All new `fs` writes/reads are performed only by
      [src/hook/index.ts](../../src/hook/index.ts) (hook side) and
      [src/runtimeFiles.ts](../../src/runtimeFiles.ts) (extension side); no new
      `cp.spawn`/`cp.spawnSync` introduced.
- [ ] New tests colocated: `taskTimer.test.ts`, `stage.test.ts`, `env.test.ts`,
      plus new cases in
      [event.test.ts](../../src/hook/event.test.ts) and
      [paths.test.ts](../../src/shared/paths.test.ts); all match the
      `src/**/*.test.ts` glob.
- [ ] `package.json` `contributes.configuration` stays in sync with
      `DEFAULTS`/`getRuntimeConfig`; `README.md` documents
      `minTaskDurationSeconds` and notes cmux double-notify suppression.
