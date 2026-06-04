# Status-bar UX: file-based mute, reactive enable/disable, interactive control panel

- **Priority:** high
- **Complexity:** L
- **Theme:** UI
- **Status:** To do
- **Depends on:** [Sound configuration UX](03-sound-config-ux-and-levels.md) and [Noise control](04-noise-control.md) (for the panel's per-event sound preview links and the threshold control)
- **Combines:** file-based mute toggle (Part 1), status-bar enable/disable without a window reload (Part 2), and an interactive status-bar control panel — trusted Markdown tooltip (Part 3)

## Scope

The status bar is our richest live surface but it is read-only: the tooltip is
prose, the item only focuses the session on click, and there is no quick mute.
Three related changes all live in
[src/statusBar.ts](../../src/statusBar.ts),
[src/extension.ts](../../src/extension.ts),
[src/commands.ts](../../src/commands.ts) and
[src/constants.ts](../../src/constants.ts), so we ship them together:

1. **File-based mute** — a one-click "silence everything" that the hook honours
   without `vscode`, surfaced as a `$(mute)` segment.
2. **Reactive enable/disable** — toggling `statusBar.enabled` starts/stops the
   tracker in place, no window reload.
3. **Interactive control panel** — replace the prose tooltip with a trusted
   `MarkdownString` of `command:` links (mute, per-event sound, threshold,
   settings), built by a pure `shared/` function and wrapped in
   [src/statusBar.ts](../../src/statusBar.ts), while preserving the existing
   working/waiting/idle headline + age so the panel doubles as status surface.

Architecture invariants hold throughout: nothing under `src/shared/` or
`src/hook/` imports `vscode`; `DEFAULTS` in
[src/shared/constants.ts](../../src/shared/constants.ts#L18-L35) stays the single
source of truth; every new child-process / file mutation flows through a
sanctioned module ([src/commands.ts](../../src/commands.ts) for the toggle,
[src/statusBar.ts](../../src/statusBar.ts) for rendering); and the
`grep -rn "from 'vscode'" src/shared src/hook` boundary check must return
nothing.

## Part 1 — File-based mute toggle

### Problem

There is no quick global mute. To stop notifications a user must edit settings
(`notifyOnStop` / `notifyOnAttention`) and possibly reload the window. The
status-bar item's click only focuses the session
([src/statusBar.ts:38-46](../../src/statusBar.ts#L38-L46)); it offers no mute. A
one-click "silence everything" is a core convenience.

### Proposal

A **file-based** mute (presence of a file = muted), so
[`shouldNotify`](../../src/hook/event.ts#L65-L80) — which runs in the hook
outside the extension host and cannot read `vscode` settings — can honour it
directly.

1. **Path.** Add `MUTED_FILE_NAME = 'muted'` to
   [src/shared/constants.ts](../../src/shared/constants.ts), import it in
   [src/shared/paths.ts](../../src/shared/paths.ts) alongside the other
   `*_FILE_NAME` imports ([paths.ts:4-17](../../src/shared/paths.ts#L4-L17)), and
   export `export const mutedPath = path.join(appDir, MUTED_FILE_NAME);` next to
   the other `appDir` children ([paths.ts:19-26](../../src/shared/paths.ts#L19-L26)).

2. **Honour it in the hook.** In
   [`shouldNotify`](../../src/hook/event.ts#L65-L80) add, as the **first** check
   — before the allow-list ([event.ts:66-69](../../src/hook/event.ts#L66-L69))
   and the focus guard ([event.ts:70-72](../../src/hook/event.ts#L70-L72)):
   `if (fs.existsSync(mutedPath)) return false;`. Mute overrides every event
   type. ([event.ts](../../src/hook/event.ts#L1) already imports `node:fs` and
   from `../shared/paths`, so only the import list grows.)

3. **Command.** Add `toggleMute: \`${CONFIG_SECTION}.toggleMute\`` to
   `COMMAND_IDS` in [src/constants.ts:3-8](../../src/constants.ts#L3-L8), declare
   it in `package.json` `contributes.commands`
   (`category: "Claude Code SuperNotifier"`, `title: "Toggle Mute"`) next to the
   existing four ([package.json commands array, lines 85-106]), and register it
   in [src/extension.ts:11-23](../../src/extension.ts#L11-L23) (registration
   only — logic in [src/commands.ts](../../src/commands.ts)).

4. **Toggle logic.** Add `export function toggleMute(): void` to
   [src/commands.ts](../../src/commands.ts) that removes `mutedPath` when it
   exists and creates it (empty file via `fs.writeFileSync`) when absent, then
   triggers a status-bar refresh (see Part 3 for the shared refresh hook).
   Wrap fs calls in `try`/`catch` and surface failures via
   `vscode.window.showErrorMessage` — extension-host code must not swallow
   errors. This adds the first `node:fs` usage to
   [src/commands.ts](../../src/commands.ts#L1-L3); import it there.

5. **Status-bar reflection.** In `render`
   ([src/statusBar.ts:117-127](../../src/statusBar.ts#L117-L127)), when
   `mutedPath` exists append a `$(mute)` segment to `item.text` (after
   `iconFor`/`labelFor`) and reflect the muted state in the tooltip. Keep
   click-to-focus as the primary item action. The mute toggle is reachable from
   the command palette and from the panel (Part 3).

Because mute is file-based it also works for hook-only invocations, and a power
user can `touch`/`rm` the file from a shell.

### Acceptance criteria

- [ ] `toggleMute` is in `COMMAND_IDS`, declared in `package.json`
      `contributes.commands`, and registered in
      [src/extension.ts](../../src/extension.ts) (no command id declared without
      a matching `registerCommand`).
- [ ] Toggling creates/removes `mutedPath`; the status bar shows a `$(mute)`
      segment while muted and removes it when unmuted.
- [ ] `shouldNotify` returns `false` whenever `mutedPath` exists, regardless of
      event type, as the first check (covered in `src/hook/event.test.ts` via a
      mocked fs path).
- [ ] `MUTED_FILE_NAME` and `mutedPath` are added to `src/shared/` and covered
      in [src/shared/paths.test.ts](../../src/shared/paths.test.ts) (asserts
      `mutedPath` sits inside `appDir` and basename is `muted`).
- [ ] No `vscode` import added to `src/shared/paths.ts` or anything under
      `src/hook`; boundary grep passes.

## Part 2 — Status-bar enable/disable without a window reload

### Problem

`startStatusBarTracker` bails immediately when the setting is off
([src/statusBar.ts:26-29](../../src/statusBar.ts#L26-L29)) and only creates the
`StatusBarItem`, watcher and interval at activation
([src/statusBar.ts:31-85](../../src/statusBar.ts#L31-L85)). So flipping
`claudeCodeSupernotifier.statusBar.enabled` does nothing until the window is
reloaded — which the setting description currently admits
("Reload the window after changing this setting",
[package.json:209](../../package.json#L209)). The extension already listens for
config changes for runtime files
([src/extension.ts:18-22](../../src/extension.ts#L18-L22)) but the tracker is not
wired to it.

### Proposal

Make the tracker lifecycle reactive — always register, build/tear down the live
resources based on the current setting:

1. **Restartable disposables holder.** Refactor
   [`startStatusBarTracker`](../../src/statusBar.ts#L26-L86) so the
   `StatusBarItem`, the click `registerCommand`, the event-log watcher
   ([src/statusBar.ts:71](../../src/statusBar.ts#L71),
   [watchEventLog:94-115](../../src/statusBar.ts#L94-L115)), the staleness
   interval ([src/statusBar.ts:72](../../src/statusBar.ts#L72)) and the
   `onDidChangeWorkspaceFolders` listener
   ([src/statusBar.ts:82](../../src/statusBar.ts#L82)) are created inside a
   `start()` helper that collects them into a single owned
   `vscode.Disposable[]` (or one composite `Disposable`), and a `stop()` helper
   that disposes and clears that holder. The early `return` at
   [src/statusBar.ts:27-29](../../src/statusBar.ts#L27-L29) is removed; the
   tracker function itself always registers.

2. **Config listener.** Add a `vscode.workspace.onDidChangeConfiguration`
   listener — pushed to `context.subscriptions` so it always lives — scoped to
   our section + key: when
   `event.affectsConfiguration(\`${CONFIG_SECTION}.statusBar.enabled\`)`
   (use `CONFIG_SECTION` from [src/constants.ts:1](../../src/constants.ts#L1)),
   read `getRuntimeConfig().statusBarEnabled`
   ([config.ts:29](../../src/config.ts#L29)) and call `start()` when newly
   enabled / `stop()` when newly disabled, guarding against redundant
   start/stop (idempotent: `start()` is a no-op if already running, `stop()` if
   already stopped). Do the initial `start()` only when the setting is on.

3. **Reuse, don't duplicate the config read.** `statusBarEnabled` is already
   derived in [`getRuntimeConfig`](../../src/config.ts#L7-L31) from
   [`DEFAULTS.statusBarEnabled`](../../src/shared/constants.ts#L33); keep that as
   the single read path — do not call `vscode.workspace.getConfiguration`
   directly in the tracker.

4. **Update the setting description.** Remove
   "Reload the window after changing this setting." from
   [package.json:209](../../package.json#L209); the change now applies live.

### Acceptance criteria

- [ ] Turning `statusBar.enabled` from `false` → `true` shows the item without a
      reload; `true` → `false` hides and disposes it (item, click command,
      watcher, interval, workspace-folder listener) immediately.
- [ ] Repeated toggles do not leak: no duplicate `StatusBarItem`s, no orphaned
      `setInterval`/`fs.watch` handles (start/stop are idempotent).
- [ ] The config listener is scoped to `statusBar.enabled` and does not fire
      `start`/`stop` on unrelated section changes.
- [ ] `statusBarEnabled` is still read solely via `getRuntimeConfig`; no second
      direct `getConfiguration` read is introduced.
- [ ] The "Reload the window…" sentence is gone from the
      `statusBar.enabled` description in `package.json`.

## Part 3 — Interactive status-bar control panel

### Problem

The hover tooltip is read-only prose built by `buildTooltip`
([src/statusBar.ts:162-178](../../src/statusBar.ts#L162-L178)) — a headline, an
age line, and "Click to focus the Claude Code session." There is no way to mute,
change a sound, or adjust the threshold from the status bar; the user has to dig
into settings.

### Proposal

Replace the prose tooltip with a **trusted** `MarkdownString` of `command:`
links, keeping the existing status headline so the panel is both a status view
and a control surface.

1. **Pure builder in `shared/`.** Add `src/shared/panelMarkdown.ts` exporting
   `export function buildPanelMarkdown(state: PanelState): string` that returns
   a Markdown **string** (no `vscode` import — `shared/` boundary). `PanelState`
   carries the data the panel needs:
   - the current `SessionState`, repo display name and `ageMs` (so it can
     reproduce the headline `headlineFor`
     ([src/statusBar.ts:180-191](../../src/statusBar.ts#L180-L191)) and the age
     line `formatAge` ([src/statusBar.ts:193-200](../../src/statusBar.ts#L193-L200))
     — extract those two helpers into `panelMarkdown.ts` so both the tooltip and
     the panel share them, rather than duplicating);
   - `muted: boolean`;
   - the per-event sound names (from epic
     [Per-event sound delivery](02-per-event-sound-delivery.md));
   - the current `minTaskDurationSeconds` threshold (from epic
     [Noise control](04-noise-control.md)).

   It emits, **below** the preserved headline + age, a list of
   `command:` links (theme-icon syntax, e.g.
   `$(mute) [Mute](command:claudeCodeSupernotifier.toggleMute)`):
   - **Mute / Unmute** → `command:claudeCodeSupernotifier.toggleMute`
     (Part 1), label toggling on `state.muted`.
   - **Per-event sound** → one "Change" link per event firing
     `command:claudeCodeSupernotifier.pickEventSound` with an args payload
     (the event key) — `pickEventSound` is delivered by epic 02. Show the
     current sound name next to each.
   - **Threshold** → `command:claudeCodeSupernotifier.setThreshold` showing the
     current `minTaskDurationSeconds` (epic 03 owns the setting; **this ticket
     adds the command** — see point 3).
   - **Open Settings** → `command:claudeCodeSupernotifier.openSettings`
     (already exists, [src/commands.ts:83-85](../../src/commands.ts#L83-L85)).

   Command argument payloads must be JSON-encoded and URI-component-escaped in
   the `command:` href per VS Code's trusted-command contract.

2. **Wrap it in `statusBar.ts`.** Replace `buildTooltip`
   ([src/statusBar.ts:162-178](../../src/statusBar.ts#L162-L178)) so `render`
   builds `const md = new vscode.MarkdownString(buildPanelMarkdown(state), true);`
   then sets `md.isTrusted = true;` and `md.supportThemeIcons = true;`, and
   assigns it to `item.tooltip`
   ([src/statusBar.ts:124](../../src/statusBar.ts#L124)). The `MarkdownString`
   wrapper (the only `vscode` touch) stays in
   [src/statusBar.ts](../../src/statusBar.ts); the string assembly stays pure in
   `shared/`. `item.command` is already set
   ([src/statusBar.ts:32](../../src/statusBar.ts#L32)), which is required for the
   hover tooltip to fire at all (VS Code constraint, microsoft/vscode#75909) —
   keep it.

3. **`setThreshold` command.** Add `setThreshold` to
   `COMMAND_IDS` ([src/constants.ts:3-8](../../src/constants.ts#L3-L8)), declare
   it in `package.json` `contributes.commands`
   (`title: "Set Minimum Task Duration"`), register it in
   [src/extension.ts:11-23](../../src/extension.ts#L11-L23), and implement
   `export async function setThreshold(): Promise<void>` in
   [src/commands.ts](../../src/commands.ts): a `vscode.window.showInputBox`
   (numeric, validated to the same `0..3600` clamp as epic 03), then write the
   value back via `vscode.workspace.getConfiguration(CONFIG_SECTION).update(
   'minTaskDurationSeconds', value, ConfigurationTarget.Global)`. Surface
   failures via `vscode.window.showErrorMessage`. (The setting itself is owned
   by epic 03 and lives in
   [DEFAULTS](../../src/shared/constants.ts#L18-L35) /
   [config.ts](../../src/config.ts) — this ticket only adds the command that
   edits it.)

4. **Refresh on toggle.** Both `toggleMute` (Part 1) and `setThreshold` change
   data the panel renders. Expose a single refresh entry point from the tracker
   (e.g. a module-level `requestStatusBarRefresh()` that calls the live
   `refresh` closure, [src/statusBar.ts:48-63](../../src/statusBar.ts#L48-L63),
   or a tiny event emitter) so the commands can re-render without reaching into
   tracker internals. Do not duplicate the `refresh` debounce logic
   ([src/statusBar.ts:65-69](../../src/statusBar.ts#L65-L69)).

### Acceptance criteria

- [ ] Hovering the status-bar item shows a trusted Markdown panel
      (`isTrusted`, `supportThemeIcons`) that still leads with the
      working/waiting/idle headline and the "Last update … ago" age line.
- [ ] The panel renders working `command:` links: Mute/Unmute, a per-event
      sound "Change" link per event, a threshold link, and Open Settings.
- [ ] `buildPanelMarkdown` lives in `src/shared/panelMarkdown.ts`, imports no
      `vscode`, and is unit-tested (`src/shared/panelMarkdown.test.ts`) for: the
      headline/age reproduction, Mute vs Unmute label flip on `muted`, correct
      `command:` URIs, and JSON/URI-escaped argument payloads. Boundary grep
      passes.
- [ ] `setThreshold` is in `COMMAND_IDS`, declared in `package.json`, registered
      in `extension.ts`, validates/clamps `0..3600`, and writes
      `minTaskDurationSeconds` via the configuration API.
- [ ] Invoking `toggleMute` or `setThreshold` re-renders the panel without a
      reload (shared refresh path; no duplicated debounce logic).
- [ ] `headlineFor`/`formatAge` are shared between the tooltip and the panel
      (not copy-pasted).

## Reference implementation

The reference project (`ashmitb95/claude-notifier`, v3.3.0) implements all three
ideas in its status-bar UI. These paths are from that external repo, cited for
provenance only (not present in this workspace):

- **File-based mute (Part 1):** a `MUTE_FLAG` file at
  `~/.claude/hooks/claude-notifier-muted`, toggled by `claudeNotifier.toggleSound`
  in `src/ui/status-bar.ts`, and honoured by the hooks _before_ they signal (see
  `scripts/smoke.sh` and their README). Deliberately a file, not a setting, so it
  works without the extension host — which is exactly why our hook can read it.
- **Reactive enable/disable (Part 2):** the reference refreshes its status bar
  via `workspace.onDidChangeConfiguration` scoped to its configuration section in
  `src/ui/status-bar.ts`. We go further: rather than just refresh the text, we
  fully **start/stop** our derived tracker (item + watcher + interval + folder
  listener) in place.
- **Interactive panel (Part 3):** their pure builder `src/ui/panel-markdown.ts`
  (`buildPanelMarkdown`) returns a trusted `MarkdownString` with `command:` URIs
  for volume/threshold and per-event Preview + Change links, wired into
  `src/ui/status-bar.ts`. Our adaptation keeps the builder pure in `shared/`
  (returning a string, with the `MarkdownString` wrapper in `statusBar.ts`),
  preserves our derived headline/age, and reuses our existing `toggleMute`,
  `pickEventSound` (epic 02), `setThreshold`, and `openSettings` commands.

## Definition of done

Per the repo guide, in order:

```sh
pnpm run lint
pnpm run format
pnpm run typecheck
pnpm test
node esbuild.js --production
```

And the boundary invariant must hold:

```sh
grep -rn "from 'vscode'" src/shared src/hook   # must return nothing
```

Plus, specific to this epic:

- [ ] `package.json` `contributes.commands` lists `toggleMute` and
      `setThreshold`, each with a matching `registerCommand` in
      [src/extension.ts](../../src/extension.ts), and both ids exist in
      `COMMAND_IDS` ([src/constants.ts](../../src/constants.ts)).
- [ ] No default value is hardcoded twice: `minTaskDurationSeconds` stays sourced
      from [DEFAULTS](../../src/shared/constants.ts#L18-L35) (epic 03);
      `statusBar.enabled` stays read via
      [getRuntimeConfig](../../src/config.ts#L7-L31).
- [ ] New fs mutations (mute file) flow through
      [src/commands.ts](../../src/commands.ts); no new child-process/file spawns
      are sprinkled outside the sanctioned modules.
- [ ] `src/shared/paths.test.ts` and `src/shared/panelMarkdown.test.ts` cover the
      new pure surfaces; `src/hook/event.test.ts` covers the mute short-circuit.
