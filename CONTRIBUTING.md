# Contributing

## Prerequisites

- macOS (the extension is macOS-only).
- Node.js 20+, pnpm 10+ (the repo pins `packageManager` to `pnpm@10.33.0`).
- Xcode command-line tools — only needed if you rebuild the bundled Swift helper (`pnpm run build:notifier-app`).

## First-time setup

```sh
pnpm install
pnpm exec lefthook install   # registers the pre-commit hooks
```

Open the project in VS Code and press **F5** to launch an Extension Development Host with the watcher running.

## Layout

```
src/
  shared/        # Pure modules. NO 'vscode' import allowed.
  hook/          # CLI bundled separately as dist/hook.js. NO 'vscode' import allowed.
  *.ts           # Extension-host modules. Free to import 'vscode'.
scripts/notifier-src/main.swift  # macOS notifier — Swift / UNUserNotificationCenter.
media/                            # icon.png + the built ClaudeCodeSupernotifier.app.
```

Read [CLAUDE.md](CLAUDE.md) for the rules that apply to all changes.

## Daily workflow

```sh
pnpm run watch     # parallel esbuild + tsgo --noEmit watchers
pnpm test:watch    # rerun vitest on save
```

## Quality gates

The same checks run locally and in CI:

| Tool      | Command                 | Purpose                                            |
| --------- | ----------------------- | -------------------------------------------------- |
| `oxlint`  | `pnpm run lint`         | Lint TypeScript / JavaScript / JSON.               |
| `oxfmt`   | `pnpm run format:check` | Formatting + import-sort check.                    |
| `tsgo`    | `pnpm run typecheck`    | TypeScript native typecheck.                       |
| `vitest`  | `pnpm test`             | Unit tests for pure modules.                       |
| `esbuild` | `pnpm run package`      | Production bundle of `extension.js` and `hook.js`. |

`pnpm run package` chains lint → typecheck → tests → bundle. Run it before opening a PR.

## Git hooks (lefthook)

- **pre-commit**: `oxlint` + `oxfmt` on staged files (auto-fixes), then `tsgo --noEmit`.
- **pre-push**: full vitest suite.

Use the imperative mood for commit messages (`add foo`, `fix bar`). Keep the subject under 72 chars; body for context.

## Rebuilding the Swift helper

The `.app` ships pre-built in `media/`. Rebuild only when you change `scripts/notifier-src/main.swift`:

```sh
pnpm run build:notifier-app
```

This requires `swiftc`, `sips`, `iconutil`, `lipo`, and `codesign` (Xcode command-line tools).

## Releasing

1. Bump `version` in `package.json` and add an entry to `CHANGELOG.md`.
2. Open a PR; merge after CI is green.
3. Tag `vX.Y.Z` on the merge commit and push the tag — the **Release** workflow runs the full quality gate, builds the VSIX, publishes to the Marketplace (if `VSCE_PAT` is configured) and attaches the VSIX to the GitHub release.

The marketplace `publisher` is `alimtunc`. Publishing requires a Personal Access Token stored as `VSCE_PAT` in the repo secrets.

## Reporting bugs

Open an issue with:

- macOS version
- VS Code version
- Output of `Claude Code SuperNotifier: Test macOS Notification`
- Last lines of `~/.claude-code-supernotifier/errors.log` and the most recent entries in `~/.claude-code-supernotifier/events.jsonl`
