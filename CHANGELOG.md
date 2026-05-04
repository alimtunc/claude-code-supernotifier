# Changelog

All notable changes to **Claude Code SuperNotifier** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
