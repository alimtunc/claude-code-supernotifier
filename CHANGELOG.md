# Changelog

All notable changes to **Claude Code SuperNotifier** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.0] - 2026-07-16

### Added

- `clickAction` setting — `session` (default) opens the matching Claude Code session on click; `window` only brings the VSCode window to the front, with no session, chat, or folder lookup. Useful with `.code-workspace` setups and VSCode forks.

### Fixed

- Clicking a notification for a repo opened via a `.code-workspace` no longer opens the bare repo folder: window focus now targets the workspace file with `--reuse-window`, and the `vscode.openFolder` fallback is skipped when the folder is already open in the handling window (a warning surfaces the underlying error instead).

## [0.9.0] - 2026-06-10

### Added

- clear notifications on window focus
- per-PID cwd ownership and ancestor-PID terminal reveal
- reactive enable/disable and interactive control panel
- live-preview event-sound picker and per-event notification levels
- task-duration threshold, per-session stage dedup, cmux awareness
- per-event sounds, Linux paplay/aplay, bundled fallbacks
- add Toggle Mute command with file-based gate and status bar indicator
- add Permission, Question & SubagentStop events with subagent suppression

## [0.8.0] - 2026-06-06

### Added

- Three new notification events — Permission requests, interactive Questions (`AskUserQuestion`), and SubagentStop — with `claudeCodeSupernotifier.notifyOnSubagentStop` and `claudeCodeSupernotifier.suppressSubagentInteractions` to keep subagent activity quiet.
- `Toggle Mute` command backed by a file-based mute gate, surfaced as a status bar indicator.
- Per-event sounds (`stopSound`, `permissionSound`, `questionSound`, `subagentStopSound`) with Linux playback via `paplay`/`aplay` and bundled fallback sounds.
- `Pick Event Sound` command — a platform-aware QuickPick that live-previews each sound before you commit to it.
- Per-event notification levels (`stopLevel`, `permissionLevel`, `questionLevel`, `subagentStopLevel`).
- `Set Minimum Task Duration` command and `minTaskDurationSeconds` setting (clamped 0–3600 s) to suppress notifications for short tasks.
- Interactive trusted-Markdown control panel on the status bar item: mute/unmute, per-event sounds, threshold, and Open Settings, all without leaving the editor.
- Custom event labels `subagentStopLabel` and `questionLabel`.
- `clearOnFocus` setting (default on, macOS only): focusing a VSCode window removes that window's delivered notifications from Notification Center.

### Changed

- Status bar enable/disable is now reactive — flipping `claudeCodeSupernotifier.statusBar.enabled` applies live, no window reload required.
- Per-PID cwd ownership: each live window publishes a per-PID marker listing its workspace folders; the hook resolves the owning window by longest-prefix cwd match so exactly one window decides suppression per session.
- Clicking a banner now reveals the integrated terminal whose process is in the notifying hook's ancestor chain (piggybacks on `focusOnClick`; no new setting).
- Per-session stage dedup and cmux awareness to cut duplicate notifications.

## [0.7.0] - 2026-05-24

### Added

- Linux notifications via `notify-send` (libnotify) and Windows 10+ notifications via the WinRT toast API (`Windows.UI.Notifications.ToastNotificationManager`). Click-to-focus remains macOS-only for now.
- `claudeCodeSupernotifier.notifyCommand` setting to override the auto-detected notifier binary (e.g. `dunstify` on Linux, `pwsh` on Windows).
- Staged `icon.png` in `~/.claude-code-supernotifier/` so Linux/Windows notifications can render the SuperNotifier mascot.

### Changed

- Hook notifier is now a thin platform dispatcher (`notifierMac.ts` / `notifierLinux.ts` / `notifierWin.ts`); the macOS Swift-binary path is unchanged.
- Test command renamed from "Test macOS Notification" to "Test Notification".
- `Test Notification` command now invokes the hook via `node` so it works on Windows too.

## [0.6.0] - 2026-05-24

### Added

- live Claude Code status bar item with `working` / `waiting` / `idle` states, click to focus the matching session (`claudeCodeSupernotifier.statusBar.enabled`, default on)
- managed hook for `UserPromptSubmit` so the status bar can show the `working` state — existing users should re-run `Install Claude Hooks`

## [0.5.2] - 2026-05-24

### Fixed

- use code --reuse-window to switch native tabs

## [0.5.1] - 2026-05-10

### Fixed

- register helper bundle with LaunchServices
- drop path arg from `open -a` to stop spawning a new window
- exclude .claude/ and AGENTS.md from package

## [0.5.0] - 2026-05-05

### Added

- add notificationStyle setting (system|banner)
- push by default so pnpm release ships end-to-end

## [0.4.0] - 2026-05-05

### Added

- configurable English event labels + demo gif

## [0.3.0] - 2026-05-04

### Added

- rewrite as a gum-driven bash script
- add --dry-run, --yes, --push and a preview before bumping

### Fixed

- sync titleTemplate default with shared/constants

## [0.2.0] - 2026-05-04

### Added

- release: add pnpm release for auto-version bump and tag
- focus: suppress notifications when the matching VSCode window is focused
- hook: spawn the swift notifier binary instead of terminal-notifier
- notifier: build universal swift binary + ad-hoc signed .app bundle
- notifier: handle clicks (signal file + editor launch) with timeout
- notifier: parse CLI args (--title/--message/--sound/--group/--prime/--dry-run)
- notifier: swift skeleton that fires a single notification
- notifier-app: bundle a helper .app and default senderBundleId to it
- branding: swap bell icon for octopus mascot (128x128)
- bootstrap Claude Code SuperNotifier extension

### Changed

- clean-install: also force-copy dist/hook.js
- defaults: drop "Claude:" prefix from default title template
- marketplace prep — drop dead code, add CLAUDE.md, sort imports
- drop configureMacNotifier command and senderBundleId setting
- notifier-app: chmod the swift binary and prime authorization on install
- config: replace terminal-notifier wiring with notifierBinaryPath
- drop the last "supernotify" identifiers and runtime paths
- drop SVG icon source and build:icon script (PNG-only workflow)
- swap prettier for oxfmt

### Fixed

- hook: cap events.jsonl with rename-based rotation
- focus: drop the in-window tab-reveal experiment
- focus: bring VSCode forward and raise the right native tab on click
- notifier: exit early when relaunched by macOS without --message
- hook: drop --click-open/--editor-cli; clickSignals watcher already focuses VSCode
- notifier: drain main queue with dispatchMain so click delegate can fire
- post-review polish (oxfmt, spawn error listener, vscodeignore comment)
- restore activationEvents, add vsce:install/uninstall scripts
- e2e: use Array#toSorted to satisfy oxlint

## [0.1.0] - 2026-05-05

First Marketplace release.

### Added

- Bundled native macOS helper (`ClaudeCodeSupernotifier.app`, Swift / `UNUserNotificationCenter`). Notifications appear under the extension's own bundle identity, no `terminal-notifier` or Homebrew dependency.
- Multi-session aware click-to-focus: each notification carries a per-workspace signal file; a `vscode.workspace.createFileSystemWatcher` brings the right window forward on click.
- Notifications are suppressed automatically while the matching VS Code window has focus — per-workspace `focus-state/<hash>/focused` flag mirrored from `vscode.window.state.focused` and read by the hook in `shouldNotify`.
- Repo-aware title/message templates with `${repo}`, `${branch}`, `${eventLabel}`, `${lastAssistantMessage}`, etc.
- Commands: `Install Claude Hooks`, `Uninstall Claude Hooks`, `Test macOS Notification`, `Open Settings`.
- `oxlint` (lint), `oxfmt` (format + import sort), `tsgo` (typecheck), `vitest` (unit tests), `lefthook` (pre-commit) pipeline.
- GitHub Actions CI (lint / format-check / typecheck / test / package) and tag-driven Release workflow.
- `CLAUDE.md` agent guide describing module boundaries and the verification gate.

### Changed

- Default `titleTemplate` is now `${repo}` (was `Claude: ${repo}`) — the `Claude:` prefix was redundant with the macOS app name shown above the banner.
- Renamed from the prototype `supernotify` to `claude-code-supernotifier`. Runtime directory moved from `~/.supernotify/` to `~/.claude-code-supernotifier/`. Helper script renamed `supernotify-hook.js` → `hook.js`.
- Click-to-focus now flows through a `clicked` sentinel + FileSystemWatcher rather than a 500 ms polling loop, and brings VS Code forward at OS level (`open -a <App> <workspace>`) so macOS native tabs land on the right window.
- All child-process invocations centralised; binary discovery removed where unused.

### Fixed

- Notifier helper drains the main dispatch queue with `dispatchMain()` so the click delegate can fire reliably.
- Notifier exits early when relaunched by macOS without `--message`, instead of posting an empty notification.

### Removed

- `node-notifier` dependency.
- `senderBundleId` setting (the bundled helper provides the sender identity).
- `editorCliPath` setting and the `code` CLI auto-detection — the FileSystemWatcher handles focus directly inside VS Code.
- VSCode URI handler and `focusUri` template field — superseded by the watcher path.
- `Configure macOS terminal-notifier` command.
- `--click-open` / `--editor-cli` notifier flags — the click signal is consumed by the FileSystemWatcher.

## [0.0.1] - 2026-04-01

### Added

- Initial prototype: install/uninstall Claude Code hooks, click-to-focus notifications, repo-aware templating.
