# Claude Code SuperNotifier

Native macOS notifications for [Claude Code](https://docs.claude.com/en/docs/claude-code) sessions, built for people who run several VS Code windows and Claude Code sessions in parallel.

When Claude finishes a turn or needs your attention, you get a real macOS banner with an optional sound and repository-aware text. Click the notification to open the matching Claude Code session.

> Status: macOS only. Linux and Windows support is on the roadmap.

## Why

The marketplace already has plenty of "Claude notifier" extensions. SuperNotifier focuses on the multi-window workflow:

- **Multi-session aware** &mdash; each notification is grouped per session id and routes back to the right window when clicked.
- **Click-to-focus** &mdash; uses `terminal-notifier` to open the right workspace and trigger the Claude Code editor command.
- **Repo-aware** &mdash; titles and messages know about the current repo and Git branch.
- **Native** &mdash; real macOS banners, not webview/toast hacks.

## Install

1. Install [`terminal-notifier`](https://github.com/julienXX/terminal-notifier) so notifications can be made clickable:
   ```sh
   brew install terminal-notifier
   ```
2. Install **Claude Code SuperNotifier** from the VS Code Marketplace.
3. Run `Claude Code SuperNotifier: Install Claude Hooks` from the Command Palette to register the helper with Claude Code.
4. Run `Claude Code SuperNotifier: Test macOS Notification` to verify everything works.

## Commands

| Command                                                        | Description                                          |
| -------------------------------------------------------------- | ---------------------------------------------------- |
| `Claude Code SuperNotifier: Install Claude Hooks`              | Registers the helper with `~/.claude/settings.json`. |
| `Claude Code SuperNotifier: Uninstall Claude Hooks`            | Removes the hook entries managed by this extension.  |
| `Claude Code SuperNotifier: Test macOS Notification`           | Sends a sample notification through the helper.      |
| `Claude Code SuperNotifier: Configure macOS terminal-notifier` | Detects or installs `terminal-notifier`.             |
| `Claude Code SuperNotifier: Open Settings`                     | Opens the SuperNotifier settings section.            |

## How it works

The extension writes a self-contained helper to:

```
~/.supernotify/supernotify-hook.js
```

It then registers the helper as a [Claude Code hook](https://docs.claude.com/en/docs/claude-code/hooks) in `~/.claude/settings.json`. Whenever Claude Code emits a `Stop`, `Notification` or `PermissionRequest` event, the helper:

1. Reads the JSON payload from `stdin`.
2. Enriches it with repository and Git branch information.
3. Logs the event to `~/.supernotify/events.jsonl` for debugging.
4. Displays a clickable macOS banner via `terminal-notifier` (falling back to `osascript` when needed).
5. Drops a tiny `clicked` file when the notification is acted on, which the extension watches with `vscode.workspace.createFileSystemWatcher` to focus the right session.

## Settings

All settings live under the `claudeCodeSupernotifier.*` namespace.

| Setting                    | Default                        | Purpose                                                                |
| -------------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| `notifyOnStop`             | `true`                         | Notify when Claude finishes a turn.                                    |
| `notifyOnAttention`        | `true`                         | Notify on permission/idle prompts.                                     |
| `sound`                    | `Glass`                        | macOS sound (`Glass`, `Ping`, `Submarine`, ...). Empty disables sound. |
| `titleTemplate`            | `Claude: ${repo}`              | Notification title template.                                           |
| `messageTemplate`          | `${eventLabel}${branchSuffix}` | Notification body template.                                            |
| `includeBranch`            | `true`                         | Append the current Git branch to messages.                             |
| `allowedRepos`             | `[]`                           | Optional allow-list of folder names. Empty means all repos.            |
| `customRepoNames`          | `{}`                           | Map folder name &rarr; display name.                                   |
| `focusOnClick`             | `true`                         | Open the matching Claude Code session on click.                        |
| `claudeOpenSessionCommand` | `claude-vscode.editor.open`    | Command used to open a session by id.                                  |
| `claudeFocusCommand`       | `claude-vscode.focus`          | Command run after opening to bring the editor forward.                 |
| `editorCliPath`            | _auto_                         | Editor CLI used to focus a workspace. Empty auto-detects `code`.       |
| `senderBundleId`           | _empty_                        | Optional bundle id shown as the notification sender.                   |

### Template variables

```text
${repo}                 # repository folder name (or customRepoNames mapping)
${branch}               # current Git branch ("" outside a repo)
${branchSuffix}         # " · ${branch}" when includeBranch is true, else ""
${cwd}                  # working directory of the Claude Code session
${event}                # raw hook event name ("Stop", "Notification", ...)
${eventLabel}           # localised label ("Réponse terminée", "Permission requise", ...)
${notificationType}     # "permission_prompt" | "idle_prompt" | ""
${notificationMessage}  # raw message Claude provided
${lastAssistantMessage} # last assistant message, truncated to 180 chars
${sessionId}            # Claude Code session id
${transcriptPath}       # path to the JSONL transcript
```

## Privacy

The helper writes everything Claude Code sends it to `~/.supernotify/events.jsonl` and crash details to `~/.supernotify/errors.log`. Both files stay on your machine; nothing is uploaded.

## Troubleshooting

- **No notification appears:** check System Settings &rarr; Notifications &rarr; `terminal-notifier` (or your custom `senderBundleId`). macOS keys notification permissions to the bundle id.
- **Click does nothing:** make sure the `code` CLI is on your `PATH` (or set `claudeCodeSupernotifier.editorCliPath`).
- **Hooks not firing:** run `Claude Code SuperNotifier: Install Claude Hooks` again, then check `~/.claude/settings.json` for an entry that points to `~/.supernotify/supernotify-hook.js`.

## Development

```sh
pnpm install
pnpm run watch        # esbuild + tsgo --noEmit watchers in parallel
pnpm run lint         # oxlint
pnpm run typecheck    # tsgo (TypeScript Native preview)
pnpm test             # vitest
pnpm run package      # production bundle (lint + typecheck + test + esbuild)
pnpm run vsce:package # build .vsix
```

The repo uses:

- **oxc** (`oxlint` for linting, `oxfmt` for formatting).
- **lefthook** for pre-commit hooks (`pnpm exec lefthook install` once after cloning).
- **tsgo** (`@typescript/native-preview`) for fast type-checking.
- **vitest** for unit tests.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contributor flow.

## License

[MIT](LICENSE)
