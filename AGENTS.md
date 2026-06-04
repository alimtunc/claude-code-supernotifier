# Claude Code SuperNotifier — agent guide

A small VSCode extension that ships native macOS notifications for Claude Code sessions. Two TS bundles + a bundled Swift `.app`. Read this before editing.

## Stack

- TypeScript strict (`Node16` modules, `noUncheckedIndexedAccess`).
- **oxc tooling only**: `oxlint` (lint), `oxfmt` (format + import sort). No eslint, prettier, biome.
- `tsgo` (`@typescript/native-preview`) for typechecking.
- `esbuild` for bundling — two CJS entry points (`extension.js`, `hook.js`).
- `vitest` for unit tests; no `@vscode/test-electron`.
- `pnpm@10` (locked via `packageManager`); `lefthook` for git hooks.

## Layout

```
src/
  shared/        # Pure modules. NEVER import 'vscode' here.
  hook/          # CLI bundled by esbuild as dist/hook.js. Spawned by Claude Code.
                 # Runs OUTSIDE the extension host. NEVER import 'vscode' here.
  *.ts           # Extension-host modules. Free to import 'vscode'.
scripts/notifier-src/main.swift  # macOS UNUserNotificationCenter helper.
media/                            # icon.png + built ClaudeCodeSupernotifier.app.
```

The `shared/` and `hook/` boundary is the most important rule of this codebase: violate it and the helper crashes at runtime because `vscode` doesn't exist outside the extension host.

## Hard rules

- **MUST NOT** import `vscode` from anything inside `src/shared/` or `src/hook/`. Verify with `grep -rn "from 'vscode'" src/shared src/hook` — must return nothing.
- **MUST NOT** add `eslint`, `prettier`, `biome`, `tsc`, `webpack`, or `rollup`. The toolchain is oxc + tsgo + esbuild only. Replacing it is a separate decision, not a side-effect of a feature.
- **MUST NOT** use `--no-verify`, `--no-gpg-sign`, or `git commit --amend` to dodge a failing hook. Fix the cause.
- **MUST NOT** introduce `any`, non-null `!` on values that can actually be null, or `as Foo` outside a real type-guard. Prefer `unknown` + narrowing.
- **MUST NOT** swallow errors silently in TS code that runs inside the extension host — surface them via `vscode.window.showErrorMessage` or rethrow. Hook code (which Claude Code reads on stderr) MAY swallow non-fatal logging errors; everything written to disk must already wrap in `try`.
- **MUST** keep `package.json` `contributes.commands` and `contributes.configuration` in sync with `src/constants.ts` and `src/shared/constants.ts`. A command id declared in `package.json` without a matching `registerCommand` in `extension.ts` is a hard failure.
- **MUST** treat `src/shared/constants.ts` `DEFAULTS` as the single source of truth for default values. Don't hardcode the same default in two places.
- **MUST** centralise child-process invocations (`cp.spawn`, `cp.spawnSync`) — they all live in `notifier.ts`, `commands.ts` (`testNotification`), `notifierApp.ts` (priming), and `hook/git.ts`. Don't sprinkle new ones; extend an existing module.

## Definition of done

Before claiming a task is finished, in this order:

```sh
pnpm run lint        # oxlint
pnpm run format      # oxfmt (writes; sorts imports)
pnpm run typecheck   # tsgo --noEmit
pnpm test            # vitest run
node esbuild.js --production   # bundles both extension + hook
```

`pnpm run package` chains the first four. CI runs the same set.

## Testing rules

- Unit tests live next to the module: `foo.ts` ↔ `foo.test.ts`. Don't create `__tests__/` folders.
- Tests **MUST NOT** import `vscode`; they run in plain Node via vitest. If a module needs `vscode`, extract the pure logic into `shared/` and test that.
- Mock `node:child_process` with `vi.mock` when asserting CLI args (see `src/hook/notifier.test.ts`).
- New test files must show up in vitest's `include` glob (`src/**/*.test.ts`) — no extra config needed.

## Code style (only what oxlint/oxfmt can't enforce)

- Default to **no comments**. Add one when the _why_ is non-obvious — e.g. the macOS relaunch guard in `main.swift`, the `dispatchMain()` rationale, the `noUncheckedIndexedAccess` workaround. Don't restate what the code already says.
- DRY: when the third copy of a snippet appears, extract it. Two copies are fine.
- SOC: the extension entrypoint (`extension.ts`) does **registration only**. Logic lives in `commands.ts`, `clickSignals.ts`, `notifierApp.ts`, `runtimeFiles.ts`, etc. Keep `activate()` short.
- Prefer pure functions in `shared/`. Side effects (`fs`, `cp`, `vscode.*`) belong in their module.
- Public functions get explicit return types. Internal helpers may rely on inference.
- Imports are sorted by oxfmt: builtins → external → relative → types. Don't hand-edit the order.

## Adding a setting

1. Declare it in `package.json` under `contributes.configuration.properties`.
2. Add a default to `src/shared/constants.ts` `DEFAULTS`.
3. Add the field to `SupernotifierConfig` in `src/types.ts` and to `HookConfig` in `src/hook/types.ts` if the hook needs it.
4. Read it in `src/config.ts` `getRuntimeConfig()`.
5. Document it in `README.md` under "Settings" and (if it affects templating) under "Template variables".
6. Add a vitest case if it affects `normaliseEvent` or `shouldNotify`.

## Releasing

- Bump `version` in `package.json`, append a `[X.Y.Z]` block to `CHANGELOG.md` (Keep a Changelog format).
- Tag `vX.Y.Z` and push. The `release.yml` workflow lints/typechecks/tests, builds the VSIX, and publishes if `VSCE_PAT` is set.
- Never publish from a dev machine without first running `pnpm run vsce:package` and inspecting the `.vsix` contents (`unzip -l`).

## Build choice — esbuild over rolldown

esbuild bundles both entries in <100 ms; the codebase is ~13 source files and ~10 KB output. Rolldown is fine but offers no measurable benefit at this scale, has no VSCode-extension reference users yet, and `vsce package` has not been validated against its output. Stay on esbuild until upstream docs add a sample.
