# Contributing

Thanks for your interest in **Claude Code SuperNotifier**. This document covers the day-to-day workflow.

## Prerequisites

- **macOS** (the extension is macOS-only for now).
- **Node.js 20+** &mdash; matches the `engines.node` field.
- **pnpm 10+** &mdash; the repository pins `packageManager` to `pnpm@10.33.0`.
- **`terminal-notifier`** for end-to-end testing of click-to-focus banners (`brew install terminal-notifier`).

## Repository layout

```
src/
  shared/        # Pure modules used by BOTH the extension and the helper hook.
                 # No vscode imports allowed here.
  hook/          # Helper script bundled separately by esbuild as a Node CLI.
                 # Runs outside VS Code, spawned by Claude Code as a hook.
  commands.ts    # VS Code command implementations.
  extension.ts   # activate/deactivate; only registration logic lives here.
  ...            # Other extension-only modules (config, watcher, URI handler).

dist/            # Build output (gitignored).
media/           # Icon source (svg) and generated 128x128 png.
scripts/         # Repo utilities (icon generation, ...).
```

The `shared/` boundary is enforced by convention: anything imported from `vscode` belongs outside it.

## First-time setup

```sh
pnpm install
pnpm exec lefthook install   # registers the pre-commit hooks
pnpm run build:icon          # regenerates media/icon.png from media/icon.svg
```

## Daily workflow

```sh
pnpm run watch     # parallel esbuild + tsgo watchers
pnpm test:watch    # rerun vitest on save
```

Open the project in VS Code and press `F5` to launch an Extension Development Host with the watcher already running.

## Quality gates

The same checks run locally and in CI:

| Tool      | Command                 | Purpose                                                             |
| --------- | ----------------------- | ------------------------------------------------------------------- |
| `oxlint`  | `pnpm run lint`         | Lint TypeScript / JavaScript / JSON.                                |
| `oxfmt`   | `pnpm run format:check` | Formatting check.                                                   |
| `tsgo`    | `pnpm run typecheck`    | TypeScript native typecheck (`@typescript/native-preview`).         |
| `vitest`  | `pnpm test`             | Unit tests for pure modules.                                        |
| `esbuild` | `pnpm run package`      | Production bundle of both `extension.js` and `supernotify-hook.js`. |

`pnpm run package` chains lint, typecheck, tests and the bundler &mdash; mirror it locally before opening a PR.

## Commits

The project uses [lefthook](https://lefthook.dev/). Pre-commit will:

1. Run `oxlint` on staged TS/JS files.
2. Run `oxfmt` on staged TS/JS/JSON files (auto-fixes).
3. Run `tsgo --noEmit` on the whole project.

Pre-push runs the test suite.

Use the imperative mood for commit messages (e.g. `add foo`, `fix bar`). Keep them under 72 characters; details go in the body.

## Releasing

1. Bump `version` in `package.json` and add an entry to `CHANGELOG.md`.
2. Open a PR; merge after CI is green.
3. Tag the merge commit `vX.Y.Z` and push the tag &mdash; the **Release** workflow builds the VSIX, publishes it to the marketplace (if `VSCE_PAT` is configured) and attaches the VSIX to the GitHub release.

The marketplace `publisher` is `alimtunc`. Publishing requires a Personal Access Token stored as `VSCE_PAT` in the repository secrets.

## Reporting bugs

Open an issue with:

- macOS version
- VS Code version
- Output of `Claude Code SuperNotifier: Test macOS Notification`
- Last few lines of `~/.supernotify/errors.log`
