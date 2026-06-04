# Roadmap tickets

Feature backlog for Claude Code SuperNotifier, mined from a deep analysis of
[`ashmitb95/claude-notifier`](https://github.com/ashmitb95/claude-notifier)
(v3.3.0) compared against our v0.7.0, then **grouped into 6 epics** — each one a
coherent unit of work that touches a shared set of files and can be implemented
in a single pass.

We are ahead on native macOS quality (bundled `UNUserNotificationCenter` Swift
app under our own identity, real Notification Center entries, LaunchServices
priming) and on the derived live status-bar state. The reference project is
ahead on **event coverage**, **per-event sound configurability**, **noise
control**, **cwd routing**, and an **interactive status-bar UI**. These epics
port the worthwhile ideas while respecting our architecture (the `shared/` and
`hook/` boundary that forbids importing `vscode`, the two-entry esbuild bundle,
the bundled Swift helper, and `DEFAULTS` as the single source of truth).

What we deliberately do **not** copy: their shell-script + Homebrew /
`terminal-notifier` install path. We are a polished Marketplace extension and
keep the bundled Swift helper.

## Epics

| # | Epic | Theme | Priority | Complexity | Depends on |
|---|------|-------|----------|------------|-----------|
| 01 | [Expand the event model: Permission, Question, SubagentStop, subagent suppression](01-event-model.md) | Events | high | L | — |
| 02 | [Per-event sound delivery: resolver, Linux sound, bundled fallbacks](02-per-event-sound-delivery.md) | Sounds | high | L | 01-event-model.md (events must exist to sound-differentiate them) |
| 03 | [Sound configuration UX: live-preview picker and per-event notification levels](03-sound-config-ux-and-levels.md) | Sounds | medium | L | 02-per-event-sound-delivery.md |
| 04 | [Noise control: duration threshold, per-session stage dedup, cmux awareness](04-noise-control.md) | Thresholds | high | XL | 01-event-model.md |
| 05 | [Precise multi-window routing: cwd ownership and ancestor-PID terminal reveal](05-multiwindow-routing.md) | Routing | medium | XL | — |
| 06 | [Status-bar UX: file-based mute, reactive enable/disable, interactive control panel](06-status-bar-ux.md) | UI | high | L | 03-sound-config-ux-and-levels.md and 04-noise-control.md (for the panel preview/threshold links) |

- **[Expand the event model: Permission, Question, SubagentStop, subagent suppression](01-event-model.md)** — Epic combining Permission/AskUserQuestion banners, opt-in SubagentStop notifications, and subagent-prompt suppression — all gated behind separately-testable shouldNotify branches.
- **[Per-event sound delivery: resolver, Linux sound, bundled fallbacks](02-per-event-sound-delivery.md)** — Epic combining per-event sound overrides, Linux notification audio via paplay/freedesktop, and bundled fallback WAVs staged into the app dir.
- **[Sound configuration UX: live-preview picker and per-event notification levels](03-sound-config-ux-and-levels.md)** — Epic combining a live-preview sound-picker QuickPick and a per-event notification level enum (sound+popup / sound / popup / off).
- **[Noise control: duration threshold, per-session stage dedup, cmux awareness](04-noise-control.md)** — Epic combining min task-duration threshold, file-backed per-session stage dedup, and cmux double-notify suppression to cut redundant Claude Code banners.
- **[Precise multi-window routing: cwd ownership and ancestor-PID terminal reveal](05-multiwindow-routing.md)** — Epic combining per-PID cwd-ownership handoff and ancestor-PID terminal reveal so exactly one window owns a session and clicks reveal the launching terminal.
- **[Status-bar UX: file-based mute, reactive enable/disable, interactive control panel](06-status-bar-ux.md)** — Combines file-based mute, reload-free status-bar enable/disable, and a trusted interactive Markdown control panel into one status-bar epic.

### Suggested order

1. **01 — Event model** and **06 (Part 1: mute)** are the independent, high-value
   starting points.
2. **02 — Per-event sound delivery** and **04 — Noise control** build on 01.
3. **03 — Sound config UX & levels** builds on 02.
4. **05 — Multi-window routing** is independent and can run in parallel.
5. **06 — Status-bar UX** (full interactive panel) lands last, once 03 and 04
   provide the preview/threshold commands it links to.

## Definition of done (every epic)

Per the repo guide, before claiming any work finished, in order:

```sh
pnpm run lint
pnpm run format
pnpm run typecheck
pnpm test
node esbuild.js --production
```

And the boundary invariant must hold:

```sh
grep -rn "from 'vscode'" src/shared src/hook   # must return nothing
```
