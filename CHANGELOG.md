# Changelog

All notable changes to **Claude Code SuperNotifier** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-05-04

First Marketplace release.

### Added

- Bundled native macOS helper (`ClaudeCodeSupernotifier.app`, Swift / `UNUserNotificationCenter`). Notifications appear under the extension's own bundle identity, no `terminal-notifier` or Homebrew dependency.
- Multi-session aware click-to-focus: each notification carries a per-workspace signal file; a `vscode.workspace.createFileSystemWatcher` brings the right window forward on click.
- Repo-aware title/message templates with `${repo}`, `${branch}`, `${eventLabel}`, `${lastAssistantMessage}`, etc.
- Commands: `Install Claude Hooks`, `Uninstall Claude Hooks`, `Test macOS Notification`, `Open Settings`.
- `oxlint` (lint), `oxfmt` (format + import sort), `tsgo` (typecheck), `vitest` (unit tests), `lefthook` (pre-commit) pipeline.
- GitHub Actions CI (lint / format-check / typecheck / test / package) and tag-driven Release workflow.
- `CLAUDE.md` agent guide describing module boundaries and the verification gate.

### Changed

- Renamed from the prototype `supernotify` to `claude-code-supernotifier`. Runtime directory moved from `~/.supernotify/` to `~/.claude-code-supernotifier/`. Helper script renamed `supernotify-hook.js` → `hook.js`.
- Click-to-focus now flows through a `clicked` sentinel + FileSystemWatcher rather than a 500 ms polling loop.
- All child-process invocations centralised; binary discovery removed where unused.

### Removed

- `node-notifier` dependency.
- `senderBundleId` setting (the bundled helper provides the sender identity).
- `editorCliPath` setting and the `code` CLI auto-detection — the FileSystemWatcher handles focus directly inside VS Code.
- VSCode URI handler and `focusUri` template field — superseded by the watcher path.
- `Configure macOS terminal-notifier` command.

## [0.0.1] - 2026-04-01

### Added

- Initial prototype: install/uninstall Claude Code hooks, click-to-focus notifications, repo-aware templating.
