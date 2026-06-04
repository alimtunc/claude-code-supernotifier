# Claude Code SuperNotifier

Native desktop notifications for [Claude Code](https://docs.claude.com/en/docs/claude-code), built for people who run several VS Code windows and Claude Code sessions in parallel.

When Claude finishes a turn or asks for permission, you get a real desktop banner with optional sound and repository-aware text. On macOS, clicking the banner brings the matching VS Code window forward.

![SuperNotifier demo](https://raw.githubusercontent.com/alimtunc/claude-code-supernotifier/main/media/demo.gif)

## Platform support

| Platform    | Banner                                                | Sound                           | Click-to-focus | Status bar |
| ----------- | ----------------------------------------------------- | ------------------------------- | -------------- | ---------- |
| macOS 12+   | bundled Swift helper (`UNUserNotificationCenter`)     | configurable                    | yes            | yes        |
| Linux       | `notify-send` (libnotify)                             | not portable — ignored          | not yet        | yes        |
| Windows 10+ | PowerShell + WinRT toast (`ToastNotificationManager`) | default toast sound (or silent) | not yet        | yes        |

> Linux and Windows support is fire-and-forget for v1: the notification fires, but clicking it doesn't refocus VS Code. Use the live status bar item (or the **Open Settings** command) to jump back to the right session.

## Why this one

There are already plenty of "Claude notifier" extensions. SuperNotifier focuses on the multi-window workflow:

- **Multi-session aware** — each banner is grouped per session id (and routes back to the right window when clicked, on macOS).
- **Live status bar** — a Claude indicator in the VS Code status bar tells you at a glance whether the session is working, waiting on you, or idle. Click it to jump back into the session.
- **Cross-platform** — bundled Swift helper on macOS, `notify-send` on Linux, WinRT toast on Windows. No Homebrew, no npm-side dependency.
- **Quiet when you're already there** — notifications are suppressed automatically when the matching VS Code window has focus.
- **Repo-aware** — title and message templates know about the repo and current Git branch.
- **Native** — real OS-level banners under our own identity, not webview/toast hacks.

## Install

1. Install **Claude Code SuperNotifier** from the VS Code Marketplace.
2. Run `Claude Code SuperNotifier: Install Claude Hooks` from the Command Palette.
3. Run `Claude Code SuperNotifier: Test Notification`. On macOS the first banner triggers the OS permission prompt under "Claude Code SuperNotifier" — accept once. On Linux make sure `notify-send` is on `PATH` (`sudo apt install libnotify-bin` on Debian/Ubuntu). On Windows 10+ no setup is required — PowerShell ships with the OS.

The bundled helper (`ClaudeCodeSupernotifier.app`) ships with the VSIX for macOS. Linux and Windows rely on system-provided notifiers — no additional binaries are bundled.

> Upgrading from 0.5.x? Re-run `Install Claude Hooks` once so the status bar can see when Claude starts working — the `working` state relies on the new `UserPromptSubmit` hook.

## Commands

| Command                                             | Effect                                             |
| --------------------------------------------------- | -------------------------------------------------- |
| `Claude Code SuperNotifier: Install Claude Hooks`   | Registers the helper in `~/.claude/settings.json`. |
| `Claude Code SuperNotifier: Uninstall Claude Hooks` | Removes the entries managed by this extension.     |
| `Claude Code SuperNotifier: Test Notification`      | Sends a sample notification through the helper.    |
| `Claude Code SuperNotifier: Open Settings`          | Opens the SuperNotifier settings section.          |

## How it works

```
Claude Code  ──Stop/Notification─▶  ~/.claude-code-supernotifier/hook.js
                                          │
                                          ▼
                              ClaudeCodeSupernotifier.app
                              (UNUserNotificationCenter)
                                          │
                                  user clicks banner
                                          │
                                          ▼
                          ~/.claude-code-supernotifier/focus-state/<hash>/clicked
                                          │
                              FileSystemWatcher (extension)
                                          │
                                          ▼
                              focuses the right VS Code window
```

State files live in `~/.claude-code-supernotifier/`:

- `hook.js` — the helper script (installed/refreshed on every activation).
- `events.jsonl` — append-only log of every event the helper saw.
- `errors.log` — crash details from the helper.
- `focus-state/<sha1>/{signal.json, clicked}` — per-workspace click state.

Nothing leaves your machine.

## Settings

All settings live under `claudeCodeSupernotifier.*`.

| Setting                        | Default                        | Purpose                                                                                                                              |
| ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `notifyOnStop`                 | `true`                         | Notify when Claude finishes a turn.                                                                                                  |
| `notifyOnAttention`            | `true`                         | Notify on permission/idle prompts and questions (`AskUserQuestion`).                                                                 |
| `notifyOnSubagentStop`         | `false`                        | Notify when a `Task` subagent finishes. Off by default to avoid noise during multi-step turns.                                       |
| `suppressSubagentInteractions` | `true`                         | Drop permission/question prompts that originate inside a subagent (events carrying an `agent_id`). Top-level prompts are unaffected. |
| `sound`                        | `Glass`                        | macOS sound name. Windows uses its default toast sound when non-empty, silent when empty. Linux ignores this (no portable sound).    |
| `notifyCommand`                | `""`                           | Optional override of the notifier binary. Auto-detected when empty (`notify-send` / `powershell` / bundled `.app`).                  |
| `notificationStyle`            | `system`                       | macOS only. `system` honors Banners/Alerts pref + keeps the notif in Notification Center. `banner` forces the legacy auto-dismiss.   |
| `titleTemplate`                | `${repo}`                      | Notification title template.                                                                                                         |
| `messageTemplate`              | `${eventLabel}${branchSuffix}` | Notification body template.                                                                                                          |
| `includeBranch`                | `true`                         | Append the current Git branch to messages.                                                                                           |
| `allowedRepos`                 | `[]`                           | Allow-list of folder names. Empty means all repos.                                                                                   |
| `customRepoNames`              | `{}`                           | Map folder name → display name.                                                                                                      |
| `focusOnClick`                 | `true`                         | Open the matching session on click. macOS only — Linux/Windows banners are fire-and-forget for now.                                  |
| `claudeOpenSessionCommand`     | `claude-vscode.editor.open`    | VS Code command used to open a session by id.                                                                                        |
| `claudeFocusCommand`           | `claude-vscode.focus`          | Command run after opening to bring the editor forward.                                                                               |
| `stopLabel`                    | `Finished`                     | `${eventLabel}` text when Claude finishes a turn.                                                                                    |
| `subagentStopLabel`            | `Subagent finished`            | `${eventLabel}` text when a `Task` subagent finishes (needs `notifyOnSubagentStop`).                                                 |
| `permissionLabel`              | `Permission required`          | `${eventLabel}` text for permission prompts.                                                                                         |
| `questionLabel`                | `Claude is asking a question`  | `${eventLabel}` text for `AskUserQuestion` prompts.                                                                                  |
| `idlePromptLabel`              | `Claude is waiting for input`  | `${eventLabel}` text for idle prompts.                                                                                               |
| `attentionLabel`               | `Claude needs you`             | Fallback `${eventLabel}` for other Notification events.                                                                              |
| `statusBar.enabled`            | `true`                         | Show the live Claude status bar item (`working` / `waiting` / `idle`). Reload the window after toggling.                             |

### Template variables

```text
${repo}                 # repo folder name (or customRepoNames mapping)
${branch}               # current Git branch ("" outside a repo)
${branchSuffix}         # " · ${branch}" when includeBranch is true, else ""
${cwd}                  # working directory of the Claude Code session
${event}                # raw hook event name ("Stop", "Notification", ...)
${eventLabel}           # configurable label ("Finished", "Permission required", ...) — see *Label settings*
${notificationType}     # "permission_prompt" | "idle_prompt" | ""
${notificationMessage}  # raw message Claude provided
${lastAssistantMessage} # last assistant message, truncated to 180 chars
${sessionId}            # Claude Code session id
${transcriptPath}       # path to the JSONL transcript
```

### Customisation examples

Open `settings.json` and paste any of these.

**Quieter, prefix-style title with branch in the title:**

```json
{
  "claudeCodeSupernotifier.titleTemplate": "🐙 ${repo} · ${branch}",
  "claudeCodeSupernotifier.messageTemplate": "${eventLabel}",
  "claudeCodeSupernotifier.includeBranch": false,
  "claudeCodeSupernotifier.sound": ""
}
```

**Show the last assistant line in the body:**

```json
{
  "claudeCodeSupernotifier.messageTemplate": "${eventLabel}: ${lastAssistantMessage}"
}
```

**Restrict notifications to two repos and rename one for display:**

```json
{
  "claudeCodeSupernotifier.allowedRepos": ["acme-app", "acme-api-internal"],
  "claudeCodeSupernotifier.customRepoNames": {
    "acme-api-internal": "API"
  }
}
```

**Different sound for permission prompts vs. completion:** SuperNotifier uses a single `sound` setting, but you can lean on macOS Focus rules instead — group critical alerts under "permission_prompt" via `${notificationType}`:

```json
{
  "claudeCodeSupernotifier.titleTemplate": "${notificationType:-Claude}: ${repo}",
  "claudeCodeSupernotifier.sound": "Submarine"
}
```

**Disable click-to-focus** (useful if you handle window switching yourself, e.g. via Raycast):

```json
{
  "claudeCodeSupernotifier.focusOnClick": false
}
```

**Make notifications stay until clicked:** keep `notificationStyle` at `system` (the default) and set the macOS style to **Alerts** in _System Settings → Notifications → Claude Code SuperNotifier_. With `system` the notif also lands in Notification Center, so even auto-dismissed banners can still be reviewed. Pick `banner` if you specifically want the legacy ephemeral behavior with no Notification Center entry.

## Troubleshooting

- **No notification appears (macOS).** Open _System Settings → Notifications → Claude Code SuperNotifier_ and ensure notifications are allowed. Then run `Claude Code SuperNotifier: Test Notification`.
- **No notification appears (Linux).** Check that `notify-send` is on `PATH` (`which notify-send`). On Debian/Ubuntu: `sudo apt install libnotify-bin`. If you use a custom daemon (`dunst`, etc.), point `claudeCodeSupernotifier.notifyCommand` at `dunstify` or another `notify-send`-compatible binary.
- **No notification appears (Windows).** Make sure PowerShell is on `PATH` and that the _Focus assist_ / _Do not disturb_ mode is off. Toasts land in the Action Center under the "ClaudeCodeSupernotifier" app id.
- **Click does nothing.** macOS-only feature. Make sure the [Claude Code](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code) VS Code extension is installed in the target window — `claudeOpenSessionCommand` resolves to one of its commands.
- **Hooks not firing.** Re-run `Claude Code SuperNotifier: Install Claude Hooks`, then check `~/.claude/settings.json` for an entry pointing to `~/.claude-code-supernotifier/hook.js`.
- **Inspect what the helper saw.** `tail -f ~/.claude-code-supernotifier/events.jsonl` and `~/.claude-code-supernotifier/errors.log`.

## Development

```sh
pnpm install
pnpm run watch        # parallel esbuild + tsgo watchers
pnpm run lint         # oxlint
pnpm run typecheck    # tsgo
pnpm test             # vitest
pnpm run package      # production bundle (lint + typecheck + test + esbuild)
pnpm run vsce:package # build .vsix
```

See [CLAUDE.md](CLAUDE.md) for the agent / contributor rules and [CONTRIBUTING.md](CONTRIBUTING.md) for the release flow.

## License

[MIT](LICENSE)
