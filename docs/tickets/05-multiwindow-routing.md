# Precise multi-window routing: cwd ownership and ancestor-PID terminal reveal

- **Priority:** medium
- **Complexity:** XL
- **Theme:** Routing
- **Status:** To do
- **Depends on:** —
- **Combines:** cwd-ownership handoff · ancestor-PID terminal reveal on click

## Scope

Multi-window VSCode breaks two routing assumptions in this codebase.

First, focus-suppression is decided per workspace root, not per *owning window*. Every live window mirrors its focus into a per-root flag file ([src/focusState.ts:26](../../src/focusState.ts#L26) `syncFocusFiles`), and the hook suppresses when the flag for the **event's normalised** `workspaceRoot` exists ([src/hook/event.ts:70](../../src/hook/event.ts#L70)). But the normalised root comes from `findWorkspaceRoot(cwd)` walking up for a `.vscode` dir ([src/hook/workspace.ts:5](../../src/hook/workspace.ts#L5)) — it does not know which open window actually *contains* that cwd. When a session's cwd sits inside one window's folder but normalises to a different path (nested `.vscode`, multi-root workspaces, monorepo subfolders), the wrong window's focus flag is consulted and there is no story for the case where **no** window owns the cwd at all.

Second, a click focuses the right *window* but never the right *terminal*. On macOS `focusClaudeSession` reuses the window via `code --reuse-window <cwd>` ([src/focus.ts:39](../../src/focus.ts#L39)), but the integrated terminal that actually launched Claude is left wherever it was.

This epic introduces per-PID ownership markers and an ancestor-PID chain so exactly one window decides per session, and so the originating terminal is revealed on click. Both parts add new files but reuse the existing marker-file plumbing under `appDir` ([src/shared/paths.ts:19](../../src/shared/paths.ts#L19)) and the sanctioned child-process sites.

## Part 1 — cwd-ownership handoff (exactly one live window decides per session)

### Problem

`shouldNotify` ([src/hook/event.ts:65](../../src/hook/event.ts#L65)) makes the suppression decision from `event.workspaceRoot`, which is the output of `findWorkspaceRoot(cwd)` ([src/hook/workspace.ts:5](../../src/hook/workspace.ts#L5)) — a pure walk-up heuristic with no knowledge of which windows are open. The focused check at [src/hook/event.ts:70-72](../../src/hook/event.ts#L70-L72) therefore reads the flag for a root that may belong to *no* open window, or to a *different* window than the one whose folder physically contains the cwd. Symptoms:

- Session cwd `/proj/packages/api` is open in window A (folder `/proj`), but `findWorkspaceRoot` stops at `/proj/packages/api` because it has its own `.vscode`. The hook checks the flag for `/proj/packages/api`, which no window writes, so it always notifies even when window A is focused.
- Two windows write a `focused` flag for overlapping roots; there is no tie-breaker for "who owns this cwd".
- When literally no window has the folder open, there is no defined behaviour to hang a future terminal-only fallback on.

### Proposal

Have each live extension window publish a per-PID **ownership marker** listing the workspace folders it currently holds, and have the hook resolve the owning window from those markers instead of trusting the normalised root alone.

1. **New constants** in [src/shared/constants.ts](../../src/shared/constants.ts) alongside `FOCUS_STATE_DIR_NAME` ([line 7](../../src/shared/constants.ts#L7)): `ACTIVE_DIR_NAME = 'active'`. Derive the directory in [src/shared/paths.ts](../../src/shared/paths.ts) next to `focusStateRoot` ([src/shared/paths.ts:25](../../src/shared/paths.ts#L25)): `export const activeRoot = path.join(appDir, ACTIVE_DIR_NAME)` plus `getOwnershipMarkerPath(pid: number): string` returning `path.join(activeRoot, String(pid))`. This keeps every path derivation in `paths.ts` (no ad-hoc joins).

2. **New PURE module `src/shared/ownership.ts`** (vscode-free; mirrors the `shared/` boundary):
   - `cwdInsideFolder(cwd: string, folder: string): boolean` — true when `cwd === folder` **or** `cwd.startsWith(folder + path.sep)`. The trailing-separator guard is the whole point: `/proj` must NOT match `/proj-other`. This is the same shape already used informally by `belongsToWorkspace` at [src/shared/sessionState.ts:77](../../src/shared/sessionState.ts#L77) — extract it here and have `belongsToWorkspace` call it (kills the third copy of the `startsWith(root + sep)` snippet).
   - `interface OwnershipMarker { pid: number; folders: string[] }`.
   - `ownerOf(cwd: string, markers: readonly OwnershipMarker[]): OwnershipMarker | null` — returns the marker whose folder list contains the *longest* folder for which `cwdInsideFolder(cwd, folder)` holds (longest-prefix wins so a nested-folder window beats its parent). `null` when no marker owns the cwd.
   - `parseMarker(pid: number, content: string): OwnershipMarker` — split on `\n`, trim, drop empties. No `fs` here; reading is the caller's job.

3. **New extension-side writer `src/ownershipMarker.ts`** (imports `vscode`; registration only, in `activate`):
   - `startOwnershipMarker(context: vscode.ExtensionContext): void`, wired into [src/extension.ts:28](../../src/extension.ts#L28) right after `startFocusStateTracker(context)`.
   - On activation, `fs.mkdirSync(activeRoot, { recursive: true })` then write `getOwnershipMarkerPath(process.pid)` with the current `vscode.workspace.workspaceFolders` fsPaths, newline-separated.
   - Refresh on `vscode.workspace.onDidChangeWorkspaceFolders` (same event the trackers already subscribe to — see [src/focusState.ts:17](../../src/focusState.ts#L17) and [src/clickSignals.ts:40](../../src/clickSignals.ts#L40)).
   - Delete the marker on `deactivate` via a `new vscode.Disposable(() => fs.rmSync(markerPath, { force: true }))` pushed to `context.subscriptions`, mirroring the teardown disposable at [src/focusState.ts:20-22](../../src/focusState.ts#L20-L22). Note `deactivate()` ([src/extension.ts:32](../../src/extension.ts#L32)) is currently empty — disposal runs through `context.subscriptions`, so no change is needed there.
   - All `fs` writes wrapped in `try`/best-effort, consistent with `syncFocusFiles` ([src/focusState.ts:29-38](../../src/focusState.ts#L29-L38)).

4. **New hook-side reader `src/hook/ownership.ts`** (vscode-free; the only place that lists `activeRoot`):
   - `readMarkers(): OwnershipMarker[]` — `fs.readdirSync(activeRoot)`, parse each filename as a PID, read its content via `parseMarker`. Wrapped in `try`; returns `[]` on any error.
   - **Prune dead PIDs**: for each marker, liveness-probe with `process.kill(pid, 0)` (throws `ESRCH` when the PID is gone, `EPERM` when alive-but-foreign — treat `EPERM` as alive). Stale markers are `fs.rmSync(..., { force: true })` and excluded from the result. This is best-effort cleanup, identical in spirit to the focus-flag cleanup.

5. **Refine `shouldNotify`** ([src/hook/event.ts:65-80](../../src/hook/event.ts#L65-L80)): replace the single focused-flag check at [src/hook/event.ts:70-72](../../src/hook/event.ts#L70-L72) with owner-aware logic:
   - `const owner = ownerOf(event.cwd, readMarkers());`
   - If `owner` exists, the suppression root is the owning marker's matched folder (longest match), not `event.workspaceRoot`. Consult `getFocusedPath(ownerFolder)` instead. So a focused owner window suppresses; an unfocused owner window still notifies.
   - If `owner` is `null` (no live window owns the cwd), keep today's behaviour: fall back to `getFocusedPath(event.workspaceRoot)`. **This is the documented seam for a future terminal-only fallback** (notify directly only when no window owns the cwd) — call it out in a one-line `// why` comment; do not build the fallback here.
   - Leave the `allowedRepos` gate ([src/hook/event.ts:66-69](../../src/hook/event.ts#L66-L69)) and the per-event branches ([src/hook/event.ts:73-79](../../src/hook/event.ts#L73-L79)) untouched.

6. **No new user setting** is required for Part 1 — ownership is automatic. (If a kill-switch is later wanted, follow the 6-step "Adding a setting" checklist and add the default to `DEFAULTS` ([src/shared/constants.ts:18](../../src/shared/constants.ts#L18)) as the single source of truth.)

### Acceptance criteria

- [ ] `src/shared/ownership.ts` exports `cwdInsideFolder`, `ownerOf`, `parseMarker`, `OwnershipMarker`; `grep -rn "from 'vscode'" src/shared` still returns nothing.
- [ ] `cwdInsideFolder('/proj-other', '/proj')` is `false`; `cwdInsideFolder('/proj/a', '/proj')` and `cwdInsideFolder('/proj', '/proj')` are `true` (trailing-separator guard covered in `ownership.test.ts`).
- [ ] `ownerOf` returns the longest-prefix match: given markers for `/proj` and `/proj/packages/api`, a cwd of `/proj/packages/api/src` resolves to the `/proj/packages/api` marker.
- [ ] `belongsToWorkspace` in [src/shared/sessionState.ts:73-78](../../src/shared/sessionState.ts#L73-L78) is refactored to call `cwdInsideFolder` (no duplicated `startsWith(root + sep)` literal remains).
- [ ] Activating a window writes `appDir/active/<pid>` containing its workspace folder paths; changing folders rewrites it; the marker is removed on deactivate.
- [ ] `readMarkers` prunes a marker whose PID fails `process.kill(pid, 0)` with `ESRCH` and keeps one that returns `EPERM`.
- [ ] `shouldNotify` consults the **owning** window's focus flag: a `Stop`/`Notification` event suppresses when the owner window is focused and notifies when the owner is unfocused, regardless of what `findWorkspaceRoot` returns; with no owner it falls back to `event.workspaceRoot` (covered in `event.test.ts` with `node:child_process` / `node:fs` mocked, per the testing rules).
- [ ] `package.json` `contributes.configuration` unchanged (no new setting introduced).

## Part 2 — ancestor-PID chain to reveal the originating terminal on click

### Problem

After a click, `focusClaudeSession` ([src/focus.ts:39](../../src/focus.ts#L39)) brings the host window forward (`bringHostWindowToFront` at [src/focus.ts:21](../../src/focus.ts#L21)) and runs the configured open/focus commands ([src/focus.ts:46-62](../../src/focus.ts#L46-L62)), but nothing reveals the specific integrated terminal whose process launched Claude. With several terminals in one window the user still has to hunt for the right tab. The signal payload written by `writeSignal` ([src/hook/notifierMac.ts:49-72](../../src/hook/notifierMac.ts#L49-L72)) carries no process identity beyond `sessionId`/`cwd`, so the extension has nothing to match terminals against.

### Proposal

Capture the hook's ancestor-PID chain at notify time, persist it in the signal, and on click reveal the terminal whose process is in that chain.

1. **New hook module `src/hook/pid.ts`** (a sanctioned child-process site — the spawn rules name `notifier.ts`, `commands.ts`, `notifierApp.ts`, and `hook/git.ts`; this extends the hook-side family and the chain-parsing logic is the testable surface):
   - `getAncestorPids(startPid: number = process.ppid, maxDepth = 10): number[]` — on `process.platform === 'win32'` return `[]` (empty on Windows; PR comment the why). Otherwise walk up: repeatedly `cp.spawnSync('/bin/ps', ['-o', 'ppid=', '-p', String(pid)])`, parse the single PPID, append, stop at depth 10, at PID 0/1, or on parse failure. Best-effort: any spawn error yields the chain collected so far.
   - Keep the **pure parser** separate and tested: `parsePpidOutput(stdout: string): number | null` (trim, `Number.parseInt`, reject `NaN`/non-positive). The `ps` invocation itself is integration-level; `pid.test.ts` covers `parsePpidOutput` and the Windows short-circuit.

2. **Persist the chain in the signal.** In `writeSignal` ([src/hook/notifierMac.ts:49](../../src/hook/notifierMac.ts#L49)) add `pidChain: number[]` to the JSON object written at [src/hook/notifierMac.ts:52-68](../../src/hook/notifierMac.ts#L52-L68). Source it from `NormalisedEvent` — add `pidChain: number[]` to `NormalisedEvent` in [src/hook/types.ts:34-51](../../src/hook/types.ts#L34) and populate it in `normaliseEvent` ([src/hook/event.ts:45-62](../../src/hook/event.ts#L45-L62)) via `getAncestorPids()`. Capture it for the events that drive clickable banners — `Stop`, `PermissionRequest`, and (once ticket 01 lands) the question event; for other events an empty array is fine.

3. **Consume the chain on click.** Extend the click → focus flow:
   - In [src/clickSignals.ts](../../src/clickSignals.ts), widen `SignalPayload` ([src/clickSignals.ts:9-13](../../src/clickSignals.ts#L9-L13)) with `pidChain?: number[]` and pass it through the `focusClaudeSession` call at [src/clickSignals.ts:87-90](../../src/clickSignals.ts#L87-L90).
   - Add `pidChain?: number[]` to `FocusRequest` ([src/focus.ts:7-10](../../src/focus.ts#L7-L10)).
   - In `focusClaudeSession`, after the window is focused and the open/focus commands have run ([src/focus.ts:53-55](../../src/focus.ts#L53-L55)), add a `revealClaudeTerminal(request.pidChain)` step: iterate `vscode.window.terminals`, `await term.processId` for each, and `term.show()` the first terminal whose resolved PID is in the chain. If none match (or `pidChain` is empty/Windows), do nothing extra — current window focus is the fallback. Keep this as a small helper in `focus.ts`; the chain-membership check (`isPidInChain(pid, chain)`) is pure and lives in `shared/` so it can be unit-tested without `vscode`.

4. **No new user setting.** Terminal reveal piggybacks on the existing `focusOnClick` ([src/shared/constants.ts:26](../../src/shared/constants.ts#L26)) behaviour — when `focusOnClick` is off, the click-touch arg is never written ([src/hook/notifierMac.ts:33-35](../../src/hook/notifierMac.ts#L33-L35)) so the flow never runs.

### Acceptance criteria

- [ ] `src/hook/pid.ts` exports `getAncestorPids` and `parsePpidOutput`; `grep -rn "from 'vscode'" src/hook` returns nothing.
- [ ] `parsePpidOutput(' 4321\n')` returns `4321`; `parsePpidOutput('')` and `parsePpidOutput('abc')` return `null` (covered in `pid.test.ts`).
- [ ] `getAncestorPids` returns `[]` on `win32` without spawning anything (asserted by mocking `node:child_process` per the testing rules and stubbing `process.platform`).
- [ ] The `ps` walk stops at depth 10 and at PID ≤ 1, and returns the partial chain on the first spawn error (no throw escapes).
- [ ] `writeSignal` output JSON includes a `pidChain` array; `normaliseEvent` populates it for `Stop`/`PermissionRequest`.
- [ ] `isPidInChain` is a pure `shared/` helper with its own test; `focus.ts` calls it.
- [ ] On click, with a terminal whose `processId` resolves to a PID in the chain, `term.show()` is invoked on that terminal; with no match the existing window-focus path is unchanged.
- [ ] `package.json` `contributes.configuration` unchanged (reuses `focusOnClick`).

## Reference implementation

Paths below are from the mined reference project (`/tmp/claude-notifier-ref`) and are **not** in this workspace; cited verbatim from the upstream design notes.

- **Part 1 — per-PID active markers.** `src/routing/cwd.ts` writes one marker per live window (`writeOwnPidFile`) and prunes dead ones (`cleanStalePidFiles`, via `process.kill(pid, 0)`). The hook reads them in `hook/_lib/active.js` (`extensionOwnsCwd`), and the `cwdInsideFolder` trailing-separator semantics match ours exactly. The extension-side mirror used for in-process checks is `cwdMatchesFolder` in `src/signals/dispatch.ts`. Unit coverage: `test/unit/routing.cwd.test.ts`.
- **Part 2 — ancestor-PID chain.** `hook/_lib/pid.js` (`getAncestorPids`) walks `/bin/ps` up to 10 levels and embeds the chain in the v2 signal payload. On click, `src/routing/focus.ts` (`revealClaudeTab`) matches that chain against `term.processId` to surface the right integrated terminal. Unit coverage: `test/unit/routing.focus.test.ts`.

Adapt, don't copy: our marker dir is `appDir/active/<pid>` derived in [src/shared/paths.ts](../../src/shared/paths.ts), our pure helpers live in `src/shared/`, and our spawns stay confined to the sanctioned hook/extension modules.

## Definition of done

In order (per CLAUDE.md):

```sh
pnpm run lint        # oxlint
pnpm run format      # oxfmt (writes; sorts imports)
pnpm run typecheck   # tsgo --noEmit
pnpm test            # vitest run
node esbuild.js --production   # bundles both extension + hook
```

Plus:

- [ ] `grep -rn "from 'vscode'" src/shared src/hook` returns nothing (new `ownership.ts`, hook `ownership.ts`, and `pid.ts` are all vscode-free).
- [ ] No new `cp.spawn`/`cp.spawnSync` outside the sanctioned modules — the `ps` walk lives in `src/hook/pid.ts` (hook-side family); no new spawn is added to `event.ts`, `focusState.ts`, or `clickSignals.ts`.
- [ ] `DEFAULTS` ([src/shared/constants.ts:18](../../src/shared/constants.ts#L18)) remains the single source of truth; this epic adds path/dir constants only, no duplicated default values.
- [ ] Unit tests colocated (`ownership.test.ts`, `pid.test.ts`, updated `event.test.ts`, `sessionState.test.ts`) — no `__tests__/` folder; all match the `src/**/*.test.ts` include glob.
- [ ] Best-effort `fs`/`cp` failures are swallowed only in hook/marker code; extension-host errors still surface per the error-handling rule.
