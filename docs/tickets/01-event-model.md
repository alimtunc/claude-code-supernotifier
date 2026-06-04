# Expand the event model: Permission, Question, SubagentStop, subagent suppression

- **Priority:** high
- **Complexity:** L
- **Theme:** Events
- **Status:** To do
- **Depends on:** —
- **Combines:** former ticket 01 (Permission + Question), SubagentStop opt-in, suppress-subagent-prompts

## Scope

Today [`shouldNotify`](../../src/hook/event.ts#L65-L80) only returns `true` for `Stop` and `Notification`; the bare `return false` at [event.ts:79](../../src/hook/event.ts#L79) silently drops every other event. The `PermissionRequest` hook we install at [claudeHooks.ts:46](../../src/claudeHooks.ts#L46) therefore never banners — it only feeds status-bar state — and there is no `AskUserQuestion` or `SubagentStop` handling at all.

This epic reshapes the event model in one pass, because all three work items touch the same four files: [src/claudeHooks.ts](../../src/claudeHooks.ts) (hook registration), [src/hook/event.ts](../../src/hook/event.ts) (`shouldNotify` / `getEventLabel`), [src/hook/types.ts](../../src/hook/types.ts) (`HookInputEvent` / `HookConfig`), and the settings chain (`package.json` → [DEFAULTS](../../src/shared/constants.ts#L18-L35) → [SupernotifierConfig](../../src/types.ts#L1-L21) → [getRuntimeConfig](../../src/config.ts#L7-L31)).

- **Part 1** makes `PermissionRequest` and `AskUserQuestion` first-class banner events, gated by the existing `notifyOnAttention`.
- **Part 2** adds an opt-in (default **off**) `SubagentStop` banner.
- **Part 3** suppresses permission/question prompts that originate inside a `Task` subagent (default **on**).

All three land as **separate, individually-unit-testable branches** in `shouldNotify`. Branch ordering is fixed: existing allow-list ([event.ts:66-69](../../src/hook/event.ts#L66-L69)) and focus-suppression ([event.ts:70-72](../../src/hook/event.ts#L70-L72)) checks run first, then Part 3 subagent suppression, then the per-event branches (Stop, Notification, Permission, Question, SubagentStop). Nothing in `src/shared/` or `src/hook/` may import `vscode`.

## Part 1 — Permission + AskUserQuestion as first-class notifiable events

### Problem

We install a `PermissionRequest` hook at [claudeHooks.ts:46](../../src/claudeHooks.ts#L46) but [`shouldNotify`](../../src/hook/event.ts#L65-L80) returns `false` for everything except `Stop` ([event.ts:73-75](../../src/hook/event.ts#L73-L75)) and `Notification` ([event.ts:76-78](../../src/hook/event.ts#L76-L78)). So `PermissionRequest` only ever drives status-bar state via the event log — it **never banners**. And we have no handling for structured questions (`AskUserQuestion`) at all.

A user waiting on a permission or question prompt in a background window gets no ping, unless Claude *also* happens to emit a `Notification(permission_prompt)` — which is inconsistent across Claude Code versions. The reference project treats "permission needed" and "question asked" as first-class, separately-handled events.

### Proposal

Make both events produce a banner, gated by the existing `notifyOnAttention`.

1. **Register a `PreToolUse` hook with matcher `AskUserQuestion`.** In [src/claudeHooks.ts](../../src/claudeHooks.ts): add `'PreToolUse'` to `CLAUDE_HOOK_EVENTS` ([line 6](../../src/claudeHooks.ts#L6)) and `MANAGED_EVENTS` ([line 7](../../src/claudeHooks.ts#L7)). `ensureHook` already accepts a matcher ([claudeHooks.ts:91-115](../../src/claudeHooks.ts#L91-L115)), so add one line in `applyInstallToSettings` after [line 47](../../src/claudeHooks.ts#L47): `ensureHook(next, 'PreToolUse', 'AskUserQuestion', command);`. The `ClaudeSettings.hooks` index signature ([types.ts:39](../../src/types.ts#L39)) already permits the key, but make it first-class: add `PreToolUse?: ClaudeHookGroup[]` to [ClaudeSettings.hooks](../../src/types.ts#L33-L42) alongside the existing event keys.

2. **Add the notify branches** in [`shouldNotify`](../../src/hook/event.ts#L65) before the final `return false` at [event.ts:79](../../src/hook/event.ts#L79):
   - `if (event.event === 'PermissionRequest') return config.notifyOnAttention !== false;`
   - `if (event.event === 'PreToolUse' && event.raw.tool_name === 'AskUserQuestion') return config.notifyOnAttention !== false;`

   Add an explicit `tool_name?: string` field to [`HookInputEvent`](../../src/hook/types.ts#L1-L13) (the index signature at [types.ts:12](../../src/hook/types.ts#L12) already permits it, but make it first-class).

3. **Avoid double-firing with permission.** Mirror the reference behaviour: a `PermissionRequest` whose `raw.tool_name === 'AskUserQuestion'` must `return false` (it is handled by the `PreToolUse` branch). Permission prompts may *also* surface via the existing `Notification(permission_prompt)` hook on some Claude Code versions — note this overlap; it will be coalesced once the backlog **stage dedup** ticket lands. Until then, focus-suppression ([event.ts:70-72](../../src/hook/event.ts#L70-L72)) limits the nuisance.

4. **Event labels.** In [`getEventLabel`](../../src/hook/event.ts#L82-L101) add a `PermissionRequest` branch → `config.permissionLabel ?? DEFAULTS.permissionLabel` (reuse the existing label at [constants.ts:30](../../src/shared/constants.ts#L30)), and a `PreToolUse`/`AskUserQuestion` branch → a new `questionLabel` (default `"Claude is asking a question"`). Wire `questionLabel` through [DEFAULTS](../../src/shared/constants.ts#L18-L35), [`SupernotifierConfig`](../../src/types.ts#L1-L21), [`HookConfig`](../../src/hook/types.ts#L15-L32), `package.json` `contributes.configuration.properties` (next to `permissionLabel` at [package.json:191-195](../../package.json#L191-L195)), and `getRuntimeConfig` in [config.ts:25-28](../../src/config.ts#L25-L28).

5. **Status-bar state.** Update `mapEventToState` in [sessionState.ts:66-71](../../src/shared/sessionState.ts#L66-L71) so `PermissionRequest` (already maps to `waiting` at [line 68](../../src/shared/sessionState.ts#L68)) and the new `PreToolUse`/`AskUserQuestion` event both resolve to `waiting`.

Keep scope to `notifyOnAttention` — no new on/off toggle here beyond `questionLabel`.

### Acceptance criteria

- [ ] Installing hooks writes a `PreToolUse` group with matcher `AskUserQuestion` pointing at our helper, preserving any existing `PreToolUse` entries (covered by a `claudeHooks.test.ts` case).
- [ ] `shouldNotify` returns `true` for a `PermissionRequest` event when `notifyOnAttention` is true and the `focused` flag is absent.
- [ ] `shouldNotify` returns `true` for a `PreToolUse` event whose `raw.tool_name === 'AskUserQuestion'`, and `false` for any other `PreToolUse` tool and for a `PermissionRequest` whose tool is `AskUserQuestion`.
- [ ] `event.test.ts` covers both new branches plus the `focused`-flag short-circuit still applying to them.
- [ ] Uninstall removes the `PreToolUse` matcher group cleanly (no empty `PreToolUse` array left behind), driven by `MANAGED_EVENTS` in `applyUninstallFromSettings` ([claudeHooks.ts:52-74](../../src/claudeHooks.ts#L52-L74)).
- [ ] `questionLabel` renders as `${eventLabel}` for question events and lives only in `DEFAULTS` (single source of truth).
- [ ] `grep -rn "from 'vscode'" src/shared src/hook` returns nothing.

## Part 2 — SubagentStop as an opt-in (default OFF) notifiable event

### Problem

Long agentic runs spawn `Task` subagents. Some users want a ping when one finishes (e.g. a long background research subagent), but most do not — firing on every subagent completion would be noise during a normal multi-step turn. We currently register no `SubagentStop` hook, so the event is invisible. The reference project ships a dedicated `SubagentStop` hook whose level defaults to `off`.

### Proposal

Add `SubagentStop` as a registered hook plus a default-off toggle, following the [CLAUDE.md "Adding a setting" 6-step checklist](../../CLAUDE.md).

1. **Register the hook.** In [src/claudeHooks.ts](../../src/claudeHooks.ts): add `'SubagentStop'` to `CLAUDE_HOOK_EVENTS` ([line 6](../../src/claudeHooks.ts#L6)) and `MANAGED_EVENTS` ([line 7](../../src/claudeHooks.ts#L7)), and add `ensureHook(next, 'SubagentStop', undefined, command);` in `applyInstallToSettings` ([claudeHooks.ts:44-47](../../src/claudeHooks.ts#L44-L47)). Add `SubagentStop?: ClaudeHookGroup[]` to [ClaudeSettings.hooks](../../src/types.ts#L33-L42). We register unconditionally; the *banner* is gated by the setting so the hook can stay installed while the user toggles the preference without re-running install.

2. **Add the setting `claudeCodeSupernotifier.notifyOnSubagentStop` (default `false`).**
   - `package.json` `contributes.configuration.properties` — declare it next to `notifyOnAttention` ([package.json:115-119](../../package.json#L115-L119)) with `"type": "boolean"`, `"default": false`.
   - [DEFAULTS](../../src/shared/constants.ts#L18-L35) — add `notifyOnSubagentStop: false` (single source of truth).
   - [`SupernotifierConfig`](../../src/types.ts#L1-L21) — add `notifyOnSubagentStop: boolean;`.
   - [`HookConfig`](../../src/hook/types.ts#L15-L32) — add `notifyOnSubagentStop?: boolean;` (the hook needs it).
   - [`getRuntimeConfig`](../../src/config.ts#L7-L31) — add `notifyOnSubagentStop: config.get('notifyOnSubagentStop', DEFAULTS.notifyOnSubagentStop),`.

3. **Add the notify branch** in [`shouldNotify`](../../src/hook/event.ts#L65) after the Notification branch and before the final `return false`: `if (event.event === 'SubagentStop') return config.notifyOnSubagentStop === true;`. Use strict `=== true` (not `!== false`) so that the omitted/default state yields **no banner**.

4. **Event label.** Add `subagentStopLabel` (default `"Subagent finished"`) alongside the other labels, wired through [DEFAULTS](../../src/shared/constants.ts#L29-L32), [`SupernotifierConfig`](../../src/types.ts#L1-L21), [`HookConfig`](../../src/hook/types.ts#L15-L32), `package.json` (next to `stopLabel` at [package.json:186-189](../../package.json#L186-L189)), and [getRuntimeConfig](../../src/config.ts#L25-L28). In [`getEventLabel`](../../src/hook/event.ts#L82-L101) add a `SubagentStop` branch → `config.subagentStopLabel ?? DEFAULTS.subagentStopLabel`.

5. **Status-bar state.** In `mapEventToState` ([sessionState.ts:66-71](../../src/shared/sessionState.ts#L66-L71)) map `SubagentStop` → `idle` (a subagent finishing leaves the parent session quiescent, same as `Stop` at [line 67](../../src/shared/sessionState.ts#L67)). The `idle`/`inactive` icons in [statusBar.ts](../../src/statusBar.ts#L129-L153) need no change.

### Acceptance criteria

- [ ] Installing hooks writes a `SubagentStop` group pointing at our helper; uninstall removes it (driven by `MANAGED_EVENTS`); both covered by `claudeHooks.test.ts`.
- [ ] `shouldNotify` returns `false` for a `SubagentStop` event by default, `false` when `notifyOnSubagentStop` is omitted/undefined, and `true` only when `notifyOnSubagentStop === true` — covered in `event.test.ts`.
- [ ] `subagentStopLabel` renders as `${eventLabel}` for `SubagentStop` events and lives only in `DEFAULTS`.
- [ ] `mapEventToState` returns `idle` for a `SubagentStop` entry (covered in `sessionState.test.ts`).
- [ ] `notifyOnSubagentStop` appears in `package.json`, `DEFAULTS`, `SupernotifierConfig`, `HookConfig`, and `getRuntimeConfig` with no hardcoded default outside `DEFAULTS`.

## Part 3 — Suppress permission/question prompts originating inside subagents

### Problem

In auto-accept / heavy agentic flows, a `Task` subagent's internal tool approvals and clarifying questions are usually noise: the user cares about the top-level session, not every nested approval. Once Parts 1 makes permission and question events banner, a chatty subagent could ping repeatedly. The reference hooks read `input.agent_id` and exit early before signalling when suppression is enabled.

### Proposal

Add a default-on guard that drops `PermissionRequest` and `AskUserQuestion`-`PreToolUse` events when they carry a non-empty `agent_id` (i.e. originate inside a subagent). Pure and unit-testable.

1. **Add `agent_id` to the input type.** Add `agent_id?: string;` to [`HookInputEvent`](../../src/hook/types.ts#L1-L13) (first-class, even though the index signature at [types.ts:12](../../src/hook/types.ts#L12) already permits it).

2. **Add the setting `claudeCodeSupernotifier.suppressSubagentInteractions` (default `true`).**
   - `package.json` `contributes.configuration.properties` — `"type": "boolean"`, `"default": true`, near the attention/label settings.
   - [DEFAULTS](../../src/shared/constants.ts#L18-L35) — add `suppressSubagentInteractions: true` (single source of truth).
   - [`SupernotifierConfig`](../../src/types.ts#L1-L21) — add `suppressSubagentInteractions: boolean;`.
   - [`HookConfig`](../../src/hook/types.ts#L15-L32) — add `suppressSubagentInteractions?: boolean;`.
   - [`getRuntimeConfig`](../../src/config.ts#L7-L31) — add `suppressSubagentInteractions: config.get('suppressSubagentInteractions', DEFAULTS.suppressSubagentInteractions),`.

3. **Add the suppression branch** in [`shouldNotify`](../../src/hook/event.ts#L65), positioned **after** the allow-list and focus checks ([event.ts:66-72](../../src/hook/event.ts#L66-L72)) and **before** the per-event branches (Part 1/2 and existing Stop/Notification): when the event is a permission/question interaction *and* suppression is enabled *and* an `agent_id` is present, return `false`. Concretely:
   - `const isInteraction = event.event === 'PermissionRequest' || (event.event === 'PreToolUse' && event.raw.tool_name === 'AskUserQuestion');`
   - `const agentId = event.raw.agent_id;`
   - `if (isInteraction && config.suppressSubagentInteractions !== false && typeof agentId === 'string' && agentId.length > 0) return false;`

   Use `!== false` so the default (omitted) behaviour is **suppress**. The `typeof ... === 'string'` narrowing satisfies `noUncheckedIndexedAccess` without `any`/`as`.

This branch must sit *before* the Part 1 permission/question branches so suppression wins; top-level interactions (no `agent_id`) fall through to the Part 1 branches unchanged.

### Acceptance criteria

- [ ] `shouldNotify` returns `false` for a `PermissionRequest` carrying a non-empty `raw.agent_id` when `suppressSubagentInteractions` is true/omitted.
- [ ] `shouldNotify` returns `false` for a `PreToolUse`/`AskUserQuestion` event carrying a non-empty `raw.agent_id` under the same condition.
- [ ] With `suppressSubagentInteractions: false`, the same subagent events fall through to the Part 1 branches and banner (gated by `notifyOnAttention`).
- [ ] A top-level `PermissionRequest`/question with no `agent_id` (or empty string) is unaffected and still banners.
- [ ] The branch is unreachable for `Stop`/`Notification`/`SubagentStop` (those have no interaction semantics) — asserted in `event.test.ts`.
- [ ] `suppressSubagentInteractions` appears in `package.json`, `DEFAULTS`, `SupernotifierConfig`, `HookConfig`, and `getRuntimeConfig` with no duplicated default.

## Reference implementation

Paths below are in the reference repo (not in this workspace), cited as inline code.

- **Event registry as single source of truth:** `src/hooks/registry.ts` — the question entry is `type: PreToolUse` with `matcher: 'AskUserQuestion'`, `eventKey: asksQuestion`; the subagent entry (`subagentCompleted`) carries `defaultSound: 'Pop'` and `level` defaulting to `'off'`. Mirrors our split between `MANAGED_EVENTS` registration and per-event gating.
- **Defense-in-depth tool guard (question):** `hook/claude-notifier-on-question.js` exits unless `tool_name === 'AskUserQuestion'` — informs Part 1's `PreToolUse` matcher branch.
- **Permission/question de-dup:** `hook/claude-notifier-on-permission.js` deliberately skips `tool_name === 'AskUserQuestion'` — informs Part 1's double-fire guard.
- **SubagentStop opt-in:** `hook/claude-notifier-on-subagent-stop.js`; the `subagentCompleted.level` default is `off` in the reference `package.json`, and the hook bypasses stage-dedup — informs Part 2's strict `=== true` gate.
- **Subagent suppression:** `hook/claude-notifier-on-permission.js` and `hook/claude-notifier-on-question.js` both read `input.agent_id` and exit before signalling when `suppressSubagentInteractions` (default `true`); the setting is declared in `src/settings/sync.ts` + `package.json` — informs Part 3.

Our implementation keeps the registry-equivalent (`CLAUDE_HOOK_EVENTS` / `MANAGED_EVENTS` in [claudeHooks.ts:6-7](../../src/claudeHooks.ts#L6-L7)) and the gating logic ([`shouldNotify`](../../src/hook/event.ts#L65-L80)) as separate concerns, with `DEFAULTS` ([constants.ts:18-35](../../src/shared/constants.ts#L18-L35)) as the single source of truth for every new setting and label. All child-process invocations remain in their sanctioned modules — no new spawns are introduced by this ticket.

## Definition of done

In order, per [CLAUDE.md](../../CLAUDE.md):

```sh
pnpm run lint        # oxlint
pnpm run format      # oxfmt (writes; sorts imports)
pnpm run typecheck   # tsgo --noEmit
pnpm test            # vitest run
node esbuild.js --production   # bundles both extension + hook
```

Plus:

- [ ] `grep -rn "from 'vscode'" src/shared src/hook` returns nothing.
- [ ] `package.json` `contributes.configuration` declares `notifyOnSubagentStop`, `questionLabel`, `subagentStopLabel`, and `suppressSubagentInteractions`; every default matches `DEFAULTS` with no duplicate hardcoded value.
- [ ] New branches in `shouldNotify` are each covered by a dedicated `event.test.ts` case; `claudeHooks.test.ts` covers `PreToolUse` + `SubagentStop` install/uninstall; `sessionState.test.ts` covers the new `mapEventToState` mappings.
- [ ] No new `cp.spawn`/`cp.spawnSync` outside the sanctioned modules.
- [ ] README "Settings" (and "Template variables" if labels changed) updated for the three new settings and two new labels.
