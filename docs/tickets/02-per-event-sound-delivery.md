# Per-event sound delivery: resolver, Linux sound, bundled fallbacks

- **Priority:** high
- **Complexity:** L
- **Theme:** Sounds
- **Status:** To do
- **Depends on:** [Expand the event model](01-event-model.md) (events must exist before we can sound-differentiate them)
- **Combines:** former ticket 02 (per-event sound), backlog "Linux notification sound via `paplay` + freedesktop mapping", backlog "Bundled fallback sounds when the configured system sound is missing"

## Scope

Today there is a single global sound name ([`DEFAULTS.sound = 'Glass'`](../../src/shared/constants.ts#L21)) and only macOS and Windows actually emit it. Once permission and question events banner (ticket 01), users still cannot tell **by ear** what happened, Linux is silent, and any unresolvable sound name leaves the user with no audio at all.

This epic delivers the full audio path in one pass, because all three work items touch the same files (`src/hook/notifier*.ts`, `src/shared/constants.ts`, `src/types.ts`, `src/hook/types.ts`, [config.ts](../../src/config.ts), `package.json`, [runtimeFiles.ts](../../src/runtimeFiles.ts)) and share two new pure modules:

- **`src/shared/sound.ts`** — a `resolveSound(event, config)` resolver (Part 1) that every notifier and every later part calls.
- **`src/shared/soundPresets.ts`** — pure name→file mappings for the freedesktop theme (Part 2) and for the bundled fallback WAVs (Part 3).

Both new modules live under `src/shared/` and **must not** import `vscode`. All child-process spawns stay inside the already-sanctioned notifier modules. New settings follow the CLAUDE.md "Adding a setting" 6-step checklist with [`DEFAULTS`](../../src/shared/constants.ts#L18-L35) as the single source of truth.

## Part 1 — Per-event sound configuration

### Problem

A single global `sound` string is read directly in both notifiers — [notifierMac.ts:25-27](../../src/hook/notifierMac.ts#L25-L27) (`if (config.sound) args.push('--sound', config.sound)`) and [notifierWin.ts:33-34](../../src/hook/notifierWin.ts#L33-L34) (`config.sound === '' ? '<audio silent="true"/>' : ...`). There is no way to give `Stop`, `PermissionRequest`, and `AskUserQuestion` distinct sounds, which is precisely the differentiation that makes audio useful when away from the screen.

### Proposal

Add optional per-event overrides that layer over the global `sound` (which stays the fallback).

1. **Settings.** Add `stopSound`, `permissionSound`, `questionSound`, and `subagentStopSound`, each defaulting to `''` meaning "use the global `sound`". Following the 6-step checklist:
   - Declare all four in `package.json` `contributes.configuration.properties` with `markdownDescription` (mirroring the wording of [`claudeCodeSupernotifier.sound`](../../package.json#L120-L124)), each `"default": ""`.
   - Add them to [`DEFAULTS`](../../src/shared/constants.ts#L18-L35) (single source of truth) as `''`.
   - Add `stopSound: string` etc. to [`SupernotifierConfig`](../../src/types.ts#L1-L21) and `stopSound?: string` etc. to [`HookConfig`](../../src/hook/types.ts#L15-L32).
   - Read them in [`getRuntimeConfig`](../../src/config.ts#L7-L31) alongside the existing `sound: config.get('sound', DEFAULTS.sound)` at [config.ts:13](../../src/config.ts#L13).

2. **Pure resolver.** New `src/shared/sound.ts` exporting `resolveSound(event: string, config: HookConfig): string`. It maps the event name to the matching override field and returns the override when non-empty, else `config.sound ?? ''`:
   - `Stop` → `stopSound`
   - `PermissionRequest` → `permissionSound`
   - `PreToolUse` (the `AskUserQuestion` matcher from ticket 01) → `questionSound`
   - `SubagentStop` → `subagentStopSound`
   - anything else → `config.sound`

   It imports only the `HookConfig` type, so the boundary holds.

3. **Use it in the notifiers.** Replace the direct `config.sound` read at [notifierMac.ts:25](../../src/hook/notifierMac.ts#L25) and the `config.sound === ''` test at [notifierWin.ts:34](../../src/hook/notifierWin.ts#L34) with the result of `resolveSound(event.event, config)`. Keep the existing semantics on the *resolved* value: macOS still passes the name to `--sound` (UNNotificationSound name lookup) and skips the flag when empty; Windows still treats empty as `<audio silent="true"/>`.

### Acceptance criteria

- [ ] `resolveSound` returns the per-event override when set and falls back to the global `sound` when the override is `''` (unit-tested in `src/shared/sound.test.ts`).
- [ ] `PreToolUse` resolves to `questionSound` and `SubagentStop` to `subagentStopSound`; an unknown event resolves to `config.sound`.
- [ ] macOS notifier passes the resolved per-event sound to `--sound` and still omits `--sound` when the resolved value is empty.
- [ ] Windows toast honours empty-as-silent on the *resolved* value; existing [notifierMac.test.ts](../../src/hook/notifierMac.test.ts) `--sound`/`Glass` assertions (lines [62-63](../../src/hook/notifierMac.test.ts#L62-L63)) still pass with no overrides set.
- [ ] All four new settings exist in `package.json` with `markdownDescription`, in `DEFAULTS`, in both config interfaces, and in `getRuntimeConfig` — kept in sync.
- [ ] `src/shared/sound.ts` imports no `vscode`.

## Part 2 — Linux notification sound via paplay / freedesktop

### Problem

The Linux notifier ([notifierLinux.ts](../../src/hook/notifierLinux.ts)) only spawns `notify-send` at [notifierLinux.ts:20](../../src/hook/notifierLinux.ts#L20); `notify-send` has no portable sound, so Linux users get a silent banner. The existing [`sound`](../../package.json#L123) setting even documents "On Linux the value is ignored". With per-event sounds landing in Part 1, that gap becomes more glaring.

### Proposal

After firing `notify-send`, additionally play a best-effort sound on Linux.

1. **Name → freedesktop mapping.** Add a pure helper to a new `src/shared/soundPresets.ts`, e.g. `freedesktopSoundFile(name: string): string | undefined`, mapping our sound names to freedesktop `.oga` themes under `/usr/share/sounds/freedesktop/stereo/` (for example `Glass`/`Pop` → `message`, `Hero` → `complete`, `Funk` → `bell`). Returns `undefined` for an empty/unknown name. No `vscode`, no `fs` — pure mapping only.

2. **Resolve through Part 1.** In [`notify`](../../src/hook/notifierLinux.ts#L9-L29), compute `const sound = resolveSound(event.event, config)` so per-event overrides drive the Linux sound too. An empty resolved sound disables audio entirely.

3. **Play it.** After the `notify-send` spawn at [notifierLinux.ts:20-28](../../src/hook/notifierLinux.ts#L20-L28), if the mapped file exists (`fs.existsSync`), spawn `paplay <file>` (fall back to `aplay <file>` on a spawn `error`). Keep this **inside** `notifierLinux.ts` — it is already a sanctioned `cp.spawn` site — using the same `detached: true, stdio: 'ignore'`, `child.on('error', () => {})`, `child.unref()` shape as the existing call. Skip silently when the file is absent or the player is missing from PATH; never let it crash the hook.

The `notifyCommand` override (lines [10](../../src/hook/notifierLinux.ts#L10)) still controls only `notify-send`; the audio player is independent.

### Acceptance criteria

- [ ] With a non-empty resolved sound and an existing mapped file, the Linux notifier spawns `paplay` with the mapped path after `notify-send`.
- [ ] When `paplay` errors, the notifier retries with `aplay` once.
- [ ] When the resolved sound is empty, no audio process is spawned (banner only).
- [ ] When the mapped file does not exist, no audio process is spawned (deferred to Part 3 fallback).
- [ ] Existing [notifierLinux.test.ts](../../src/hook/notifierLinux.test.ts) cases (which assert exactly one `spawn` for `notify-send`, e.g. [line 52](../../src/hook/notifierLinux.test.ts#L52)) are updated to account for the optional second spawn, with the `existsSync` mock ([line 14](../../src/hook/notifierLinux.test.ts#L14), [46](../../src/hook/notifierLinux.test.ts#L46)) driving both branches.
- [ ] `src/shared/soundPresets.ts` imports no `vscode` and no `fs`.

## Part 3 — Bundled fallback sounds when the configured system sound is missing

### Problem

If a configured sound does not resolve — a renamed macOS sound, or a Linux box without the freedesktop theme installed (the Part 2 `fs.existsSync` returns false) — the user gets silence with no indication why.

### Proposal

Ship three small WAVs and play one as a last resort.

1. **Bundle the assets.** Add `media/sounds/done.wav`, `media/sounds/needs-input.wav`, `media/sounds/question.wav` (small, public-domain/CC0). `media/**` already ships in the VSIX (`.vscodeignore` only excludes `media/demo.gif`), so they are included by default — but the release check below must confirm it.

2. **Stage them into the app dir on activation.** Extend [`writeRuntimeFiles`](../../src/runtimeFiles.ts#L9-L22), which already copies the icon at [runtimeFiles.ts:16-19](../../src/runtimeFiles.ts#L16-L19), to also copy each WAV from `path.join(context.extensionPath, 'media', 'sounds', ...)` into a `sounds/` folder under [`appDir`](../../src/shared/paths.ts#L19). Add the new path constants to [src/shared/constants.ts](../../src/shared/constants.ts) and the resolved paths to [src/shared/paths.ts](../../src/shared/paths.ts) next to [`iconPath`](../../src/shared/paths.ts#L22) — keep the actual `fs.copyFileSync` calls in `runtimeFiles.ts`.

3. **Event → fallback file.** Add a pure helper to `src/shared/soundPresets.ts`, e.g. `fallbackSoundFile(event: string): string` mapping `Stop`/`SubagentStop` → `done.wav`, `PermissionRequest` → `needs-input.wav`, `PreToolUse`(AskUserQuestion) → `question.wav`.

4. **Use it as a Linux last resort.** In `notifierLinux.ts`, when the Part 2 freedesktop file is **absent** (and the resolved sound is non-empty), play the staged fallback WAV via the same `paplay`→`aplay` path. Scope the fallback to Linux: macOS `UNNotificationSound` degrades gracefully on an unknown name, so no fallback is needed there (optionally extend to the Windows toast later — out of scope for this ticket).

### Acceptance criteria

- [ ] `writeRuntimeFiles` stages the three WAVs into `appDir/sounds/` on activation, mirroring the icon copy and guarding each source with `fs.existsSync`.
- [ ] New path/constant entries live in `src/shared/constants.ts` and `src/shared/paths.ts`; no new spawn is introduced (Part 2's `paplay`/`aplay` call is reused).
- [ ] When the freedesktop file is missing but the resolved sound is non-empty, the Linux notifier plays the event-mapped staged WAV; when the resolved sound is empty, it stays silent.
- [ ] `fallbackSoundFile` is pure and unit-tested in `src/shared/soundPresets.test.ts`; `src/shared/soundPresets.ts` imports no `vscode`.
- [ ] Release check confirms the WAVs are present in the packaged VSIX (`pnpm run vsce:package` then `unzip -l *.vsix | grep media/sounds`).

## Reference implementation

Cited from the mined reference project (`ashmitb95/claude-notifier`); not in this workspace.

- **Per-event sound enums (Part 1):** `package.json` exposes a `.sound` per event — `taskCompleted.sound` default `Hero`, `needsPermission.sound` default `Glass`, `asksQuestion.sound` default `Funk`, `subagentCompleted.sound` default `Pop`. The resolver `hook/_lib/sounds.js` (`resolveSound`) reads the per-entry `defaultSound` declared in `src/hooks/registry.ts`. Our resolver is the same idea, but driven by `DEFAULTS` as the single source of truth and a flat per-event-field config rather than a registry.
- **Linux playback (Part 2):** `hook/_lib/play.js` shells out to `paplay --volume ...` and falls back to `aplay`; `hook/_lib/sounds.js` holds the name→freedesktop mapping. We mirror the `paplay`→`aplay` fallback and the mapping (our mapping is a pure module in `shared/`), centralised in `notifierLinux.ts`. See their CHANGELOG `v2.4.0`.
- **Bundled fallbacks (Part 3):** the reference bundles `media/sounds/*.wav`, stages them into `_lib/sounds`, and plays them only when `fs.existsSync(primary)` is false (`hook/_lib/sounds.js` `BUNDLED_FALLBACK`). See their CHANGELOG `v3.0.0`. We stage via the existing `writeRuntimeFiles` icon path instead of a hook-side copy.

## Definition of done

Per the repo guide, in order:

```sh
pnpm run lint        # oxlint
pnpm run format      # oxfmt (writes; sorts imports)
pnpm run typecheck   # tsgo --noEmit
pnpm test            # vitest run
node esbuild.js --production   # bundles both extension + hook
```

And the boundary and packaging invariants:

```sh
grep -rn "from 'vscode'" src/shared src/hook   # must return nothing (covers sound.ts + soundPresets.ts)
pnpm run vsce:package && unzip -l *.vsix | grep media/sounds   # WAVs must be in the VSIX
```

- [ ] `package.json` `contributes.configuration` (four new sound settings) stays in sync with `DEFAULTS`, both config interfaces, and `getRuntimeConfig`.
- [ ] `README.md` "Settings" section documents `stopSound` / `permissionSound` / `questionSound` / `subagentStopSound`, the Linux `paplay`/`aplay` behaviour, and the bundled fallbacks (and corrects the "On Linux the value is ignored" note on the global `sound`).
