# Sound configuration UX: live-preview picker and per-event notification levels

- **Priority:** medium
- **Complexity:** L
- **Theme:** Sounds
- **Status:** To do
- **Depends on:** [Per-event sound delivery](02-per-event-sound-delivery.md)
- **Combines:** sound-picker QuickPick with live arrow-key preview · per-event notification level enum (`sound+popup` / `sound` / `popup` / `off`)

## Scope

Ticket 02 gives every event its own sound _string_, but two usability gaps remain.
First, the per-event sound settings (`stopSound`, `permissionSound`,
`questionSound`, `subagentStopSound`) are opaque free-text fields — a user has no
way to hear `Glass` vs `Funk` without saving settings and triggering a real
Claude turn. Second, our gating is still binary: an event either banners _with_
sound or does nothing at all, driven by the `notifyOnStop` / `notifyOnAttention`
booleans in [shouldNotify](../../src/hook/event.ts#L65) and the single
`config.sound` read in the notifiers. There is no "banner but stay silent" or
"play a sound, skip the banner" mode.

This epic delivers both as one pass because they touch the same settings surface,
the same notifier sound-emission sites, and the same `shared/` resolver layer:

- **Part 1** adds a `claudeCodeSupernotifier.pickEventSound` command that opens a
  platform-aware QuickPick of preset sound names and previews each one live as the
  user arrows through the list, then writes the choice to the matching per-event
  sound setting.
- **Part 2** adds a per-event **level** enum (`sound+popup` / `sound` / `popup` /
  `off`) that supersedes the legacy booleans (with back-compat) and lets a sound
  fire without a banner, or a banner without a sound, per event.

Both parts respect the `shared/` and `hook/` boundary: the preset lists
(`src/shared/soundPresets.ts`) and the level resolver (`src/shared/level.ts`) are
pure modules that **MUST NOT** import `vscode`; only the new extension-host
`src/soundPicker.ts` may. All new settings follow the CLAUDE.md "Adding a setting"
6-step checklist and keep [DEFAULTS](../../src/shared/constants.ts#L18-L35) as the
single source of truth.

> The `subagentStop` event referenced below is still a backlog item ("SubagentStop
> as an opt-in notifiable event"). This epic provisions its sound-preset entry,
> level setting, and resolver branch so that landing the SubagentStop ticket needs
> no rework here; until that ticket ships, `subagentStop` simply never fires.

## Part 1 — Sound-picker QuickPick with live arrow-key preview

### Problem

The per-event sound fields added in ticket 02 are plain strings. There is no
discoverability (which names are valid on this platform?) and no audition (what
does `Submarine` actually sound like?). Today every child-process sound emission
goes through the notifiers' single `config.sound` read
([notifierMac.ts:25-27](../../src/hook/notifierMac.ts#L25), Windows audio tag at
[notifierWin.ts:33-34](../../src/hook/notifierWin.ts#L33)), and there is no
sanctioned one-shot "just play this sound now" path in the extension host.

### Proposal

1. **New pure preset module.** Add `src/shared/soundPresets.ts` (no `vscode`)
   exporting platform preset name lists and a selector:
   - `MACOS_SOUNDS` — the macOS system sound names (e.g. `Glass`, `Ping`,
     `Submarine`, `Funk`, `Hero`, `Pop`, `Basso`, `Blow`, `Bottle`, `Frog`,
     `Morse`, `Purr`, `Sosumi`, `Tink`).
   - `WIN_SOUNDS` — Windows toast `ms-winsoundevent` names (e.g.
     `Notification.Default`, `Notification.IM`, `Notification.Mail`,
     `Notification.Reminder`, `Notification.SMS`).
   - `LINUX_SOUNDS` — a small freedesktop set (e.g. `message`,
     `message-new-instant`, `complete`, `bell`, `dialog-information`) shared with
     the backlog "Linux notification sound" ticket so both consume one list.
   - `listPresetsForPlatform(platform: NodeJS.Platform): readonly string[]` →
     returns the matching list, falling back to `MACOS_SOUNDS` semantics for
     `darwin`, `WIN_SOUNDS` for `win32`, `LINUX_SOUNDS` otherwise.
   - Include an explicit empty-string ("No sound") sentinel concept so the picker
     can offer "silence" without a magic literal in the UI module.

2. **New command id.** Add `pickEventSound: \`${CONFIG_SECTION}.pickEventSound\``
   to `COMMAND_IDS` in [constants.ts:3-8](../../src/constants.ts#L3), declare it in
   `package.json` `contributes.commands` (category `Claude Code SuperNotifier`,
   title e.g. `Pick Event Sound`), and register it in
   [extension.ts:11-23](../../src/extension.ts#L11) **registration-only** —
   `vscode.commands.registerCommand(COMMAND_IDS.pickEventSound, (event?) => commands.pickEventSound(event))`
   alongside the existing `installClaudeHooks` / `testNotification` registrations.
   No logic in `activate()`.

3. **New extension-host module.** Add `src/soundPicker.ts` (MAY import `vscode`).
   Export `pickEventSound(event?: SoundEvent): Promise<void>`:
   - If no `event` arg is passed, first show a QuickPick over the four events
     (`Finished` → `stop`, `Permission` → `permission`, `Question` → `question`,
     `Subagent` → `subagentStop`) to choose which per-event sound to edit.
   - Read the current value of the matching per-event sound setting from
     `vscode.workspace.getConfiguration(CONFIG_SECTION)` to mark the active item.
   - Build the item list from `listPresetsForPlatform(process.platform)` plus the
     "No sound" sentinel, using `vscode.window.createQuickPick()` (not the simple
     `showQuickPick`) so `onDidChangeActive` is available.
   - On `onDidChangeActive`, debounce-spawn a one-shot preview via the notifier —
     see step 4 — so arrowing through the list plays each sound.
   - On `onDidAccept`, write the chosen value to the matching per-event sound key
     (`<event>Sound`) at `vscode.ConfigurationTarget.Global` and dispose the
     QuickPick. On hide/escape, dispose without writing.
   - Keep the event↔setting-key mapping (`stop → stopSound`, etc.) as a single
     lookup table in this module; do not duplicate it inline. The `SoundEvent`
     union type lives in [types.ts](../../src/types.ts) next to
     `SupernotifierConfig` (shared domain type, not inlined in the component).

4. **Centralised preview spawn.** Add `previewSound(name: string): void` to
   [notifierApp.ts](../../src/notifierApp.ts) rather than opening a fresh
   `cp.spawn` site inside `soundPicker.ts`. This honours the CLAUDE.md rule that
   child-process invocations stay centralised (`notifierApp.ts` already owns
   `primeAuthorization`'s `cp.spawnSync` at
   [notifierApp.ts:99](../../src/notifierApp.ts#L99)). `previewSound` resolves the
   bundled binary via [notifierBinaryPath()](../../src/notifierApp.ts#L20) and
   spawns a single notification-free audio cue (macOS: a `--sound`-only invocation
   or `afplay` of the system sound; on non-macOS, no-op or the platform's own
   preview path). Empty/"No sound" selection plays nothing. Best-effort: swallow
   spawn errors (this mirrors the existing `child.on('error', …)` pattern in
   [notifierMac.ts:41-43](../../src/hook/notifierMac.ts#L41)); do not surface a
   modal on a failed preview.

### Acceptance criteria

- [ ] `src/shared/soundPresets.ts` exists, exports `MACOS_SOUNDS` / `WIN_SOUNDS` /
      `LINUX_SOUNDS` and `listPresetsForPlatform`, and is unit-tested in
      `src/shared/soundPresets.test.ts` without importing `vscode`.
- [ ] `pickEventSound` is in `COMMAND_IDS` ([constants.ts:3-8](../../src/constants.ts#L3)),
      declared in `package.json` `contributes.commands`, and registered in
      [extension.ts](../../src/extension.ts#L11) — no orphan command id (a declared
      command without a `registerCommand` is a hard failure).
- [ ] Invoking the command with no arg first prompts for the event, then for the
      sound; invoking with an `event` arg skips straight to the sound list.
- [ ] The QuickPick marks the currently configured value and lists the
      platform-appropriate presets plus a "No sound" entry.
- [ ] Arrowing through items previews the highlighted sound via
      `notifierApp.previewSound`; accepting writes `<event>Sound` at Global scope;
      escaping writes nothing.
- [ ] No new `cp.spawn` / `cp.spawnSync` site is introduced outside the sanctioned
      modules — the preview goes through `notifierApp.previewSound`.
- [ ] `grep -rn "from 'vscode'" src/shared src/hook` returns nothing.

## Part 2 — Per-event notification level: `sound+popup` / `sound` / `popup` / `off`

### Problem

Notification on/off is currently global-per-category and all-or-nothing. In
[shouldNotify](../../src/hook/event.ts#L65) a `Stop` event is gated only by
`config.notifyOnStop` ([event.ts:73-75](../../src/hook/event.ts#L73)) and a
`Notification` event only by `config.notifyOnAttention`
([event.ts:76-78](../../src/hook/event.ts#L76)), with a bare
`return false` for everything else at
[event.ts:79](../../src/hook/event.ts#L79). When an event does notify, the
notifiers always attach a sound (macOS `--sound` at
[notifierMac.ts:25-27](../../src/hook/notifierMac.ts#L25); Windows audio tag at
[notifierWin.ts:33-34](../../src/hook/notifierWin.ts#L33)). There is no way to say
"banner Finished events but keep them silent" or "play a sound for Permission but
don't pop a banner".

### Proposal

Introduce a per-event **level** enum that replaces the legacy boolean as the
gating mechanism, while keeping the booleans readable for back-compat until a
later cleanup ticket.

1. **Settings.** Add `claudeCodeSupernotifier.<event>Level` for the four events
   `stop`, `permission`, `question`, `subagentStop`, each a string enum with
   values `sound+popup` | `sound` | `popup` | `off`. Defaults preserve current
   behaviour: `stopLevel` and `permissionLevel` default to `sound+popup`,
   `questionLevel` defaults to `sound+popup`, and `subagentStopLevel` defaults to
   `off`. Declare each in `package.json` `contributes.configuration.properties`
   with `enum`, `markdownEnumDescriptions`, and a `markdownDescription`, then
   thread through [DEFAULTS](../../src/shared/constants.ts#L18-L35),
   [`SupernotifierConfig`](../../src/types.ts#L1-L21),
   [`HookConfig`](../../src/hook/types.ts#L15-L32), and `getRuntimeConfig` in
   [config.ts:7-31](../../src/config.ts#L7). Define the `NotificationLevel` union
   type in [types.ts](../../src/types.ts) and re-use it in
   [hook/types.ts](../../src/hook/types.ts) so the enum string is typed, not raw
   `string`.

2. **New pure resolver.** Add `src/shared/level.ts` (no `vscode`):
   - `resolveLevel(event: string, config: HookConfig): NotificationLevel` — maps
     the event name (`Stop`, `PermissionRequest`,
     `PreToolUse`/`AskUserQuestion`, `SubagentStop`) to its `<event>Level`
     setting. **Back-compat:** when the level setting is unset/undefined, derive
     it from the legacy booleans — `notifyOnStop === false` ⇒ `off` else
     `sound+popup` for `Stop`; `notifyOnAttention === false` ⇒ `off` else
     `sound+popup` for `PermissionRequest` and the question event. The legacy
     booleans remain the readable back-compat source; do not delete them here.
   - `effectiveShowBanner(level: NotificationLevel): boolean` → `false` only for
     `off` and `sound`.
   - `effectiveSound(level: NotificationLevel): boolean` → `false` only for `off`
     and `popup`.
   - All three are pure and total over the enum.

3. **Gate in `shouldNotify`.** In [shouldNotify](../../src/hook/event.ts#L65),
   replace the per-event boolean checks (and the bare
   [`return false`](../../src/hook/event.ts#L79)) with
   `return effectiveShowBanner(resolveLevel(event.event, config))` for the four
   handled events — a `popup`-or-`sound+popup` level shows the banner; `sound`
   and `off` suppress it. Preserve the existing early-out guards above (the
   `allowedRepos` filter at [event.ts:66-69](../../src/hook/event.ts#L66) and the
   focused-file suppression at [event.ts:70-72](../../src/hook/event.ts#L70)) —
   they still run first.

4. **Honour level in the notifiers.** In each notifier, compute
   `resolveLevel(event.event, config)` once and:
   - **macOS** ([notifierMac.ts](../../src/hook/notifierMac.ts)): only push
     `--sound` (currently the `if (config.sound)` block at
     [notifierMac.ts:25-27](../../src/hook/notifierMac.ts#L25)) when
     `effectiveSound(level)` is true. Combine with the ticket-02
     `resolveSound(event.event, config)` value so the resolved per-event sound is
     used only when the level permits sound.
   - **Windows** ([notifierWin.ts](../../src/hook/notifierWin.ts)): emit the
     silent audio tag (`<audio silent="true"/>`) when `effectiveSound(level)` is
     false, otherwise the resolved sound tag — extend the existing audio-tag
     branch at [notifierWin.ts:33-34](../../src/hook/notifierWin.ts#L33).
   - **Linux** ([notifierLinux.ts](../../src/hook/notifierLinux.ts)): no sound
     today, so the level only affects whether `notify()` runs at all; once the
     backlog Linux-sound ticket lands, gate its sound emission on
     `effectiveSound(level)` too.
   - In all three, when `resolveLevel(...) === 'off'`, skip `notify()` entirely
     as a defence-in-depth backstop even though `shouldNotify` already returns
     `false` for `off`.

5. **Mute interaction.** The level matrix composes with — and is subordinate to —
   the global mute from ticket 04 (file-based mute toggle): mute suppresses
   _everything_ regardless of level; level only differentiates the unmuted case.
   Document this ordering: global mute → `allowedRepos` filter → focus
   suppression → (threshold suppression, ticket 03) → per-event level. Document
   the full matrix in `README.md`:

   | Level         | Banner | Sound |
   | ------------- | :----: | :---: |
   | `sound+popup` |  yes   |  yes  |
   | `sound`       |   no   |  yes  |
   | `popup`       |  yes   |  no   |
   | `off`         |   no   |  no   |

### Acceptance criteria

- [ ] `stopLevel` / `permissionLevel` / `questionLevel` / `subagentStopLevel`
      declared in `package.json` with `enum` + `markdownEnumDescriptions`, with
      matching `DEFAULTS` entries (`stop`/`permission`/`question` →
      `sound+popup`, `subagentStop` → `off`), kept in sync and wired through
      [`SupernotifierConfig`](../../src/types.ts#L1), [`HookConfig`](../../src/hook/types.ts#L15),
      and [config.ts](../../src/config.ts#L7).
- [ ] `src/shared/level.ts` exports `resolveLevel`, `effectiveShowBanner`,
      `effectiveSound`; all pure; unit-tested in `src/shared/level.test.ts`
      including the legacy-boolean back-compat mapping for unset level settings.
- [ ] [shouldNotify](../../src/hook/event.ts#L65) returns `false` when the
      resolved level is `off` or `sound`, and `true` for `popup` / `sound+popup`,
      for all four events (covered in `event.test.ts`), with the existing
      `allowedRepos` and focused-file guards still applying first.
- [ ] macOS omits `--sound` when level is `popup`; Windows emits the silent audio
      tag when level is `popup`; both attach the resolved per-event sound when
      level permits sound.
- [ ] No notifier calls `notify()` for an `off` event (regression test asserting
      the spawn is not invoked).
- [ ] Legacy `notifyOnStop` / `notifyOnAttention` still drive behaviour when the
      new level settings are unset (back-compat regression test).
- [ ] README documents the level matrix and its ordering relative to global mute.
- [ ] `grep -rn "from 'vscode'" src/shared src/hook` returns nothing.

## Reference implementation

Mined from `ashmitb95/claude-notifier` (v3.3.0); paths below are in that repo, not
this workspace.

- **Picker UI:** `src/ui/sound-picker.ts` — uses `createQuickPick`, a
  `playLocalSound` per-platform preview spawn, and `listPresetsForPlatform`. Their
  preview is a direct local spawn; we route it through
  [notifierApp.previewSound](../../src/notifierApp.ts) instead to keep
  child-process invocations centralised.
- **Preset source:** `src/notifications/sound.ts` exporting `MACOS_SOUNDS`,
  `WIN_SOUNDS`, `LINUX_SOUNDS`. We mirror these into the pure
  `src/shared/soundPresets.ts` so they are unit-testable without `vscode` and
  shared with the backlog Linux-sound ticket.
- **Per-event level enum:** the `.level` enum + `enumDescriptions` per event in
  their `package.json`, resolved by `getEventLevel` in `src/settings/sync.ts` and
  honoured across the hook output paths (their README/CHANGELOG v2.0.0). Our
  equivalent is the pure `resolveLevel` in `src/shared/level.ts`, consumed by
  [shouldNotify](../../src/hook/event.ts#L65) and the three notifier modules.

What we deliberately do **not** copy: their settings live in a `sync.ts` resolver
backed by their own file format; ours stay VS Code settings threaded through
[DEFAULTS](../../src/shared/constants.ts#L18) as the single source of truth and
read in [config.ts](../../src/config.ts#L7).

## Definition of done

In order, per the repo guide:

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

- [ ] New settings declared in `package.json` `contributes.configuration` each
      have a matching `DEFAULTS` entry and are read in `getRuntimeConfig`
      (no default hardcoded twice).
- [ ] The `pickEventSound` command id in `package.json` has a `registerCommand` in
      [extension.ts](../../src/extension.ts) (no orphan command).
- [ ] `src/shared/soundPresets.ts` and `src/shared/level.ts` import no `vscode`;
      `src/soundPicker.ts` is the only new module that does.
- [ ] Sound previews and notifications spawn only through `notifierApp.ts` /
      `notifier*.ts` — no new ad-hoc `cp.spawn` sites.
- [ ] README updated: sound-picker command and the level matrix + mute ordering.
