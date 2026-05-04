# Changelog

All notable changes to **Claude Code SuperNotifier** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Project bootstrap with `oxlint` (lint + format), `lefthook` (pre-commit) and `tsgo` (`@typescript/native-preview`) typecheck.
- Vitest unit tests for pure logic (hook merge, JSON I/O, URI handler, template rendering).
- GitHub Actions CI: lint, typecheck, test, package.

### Changed

- Renamed extension to **Claude Code SuperNotifier** (`alimtunc.claude-code-supernotifier`).
- Migrated all command IDs and configuration keys from `supernotify.*` to `claudeCodeSupernotifier.*`.
- Replaced 500 ms polling with `vscode.workspace.createFileSystemWatcher` for click signals.
- Centralised binary discovery, command IDs and runtime paths to remove duplication.

### Removed

- Unused `node-notifier` dependency.

### Fixed

- Restored explicit `activationEvents: ["onStartupFinished", "onUri"]`. Without it, the extension only activated on the first command invocation, so the runtime helper and FileSystemWatcher were not initialised on startup.

## [0.0.1] - 2026-04-01

### Added

- Initial prototype: install/uninstall Claude Code hooks, click-to-focus notifications, repo-aware templating.
