# Changelog

All notable changes to **Claude Code SuperNotifier** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
