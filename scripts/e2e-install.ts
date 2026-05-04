// Read-only end-to-end check against ~/.claude/settings.json.
// Simulates clean install + update + idempotent re-install without writing the real file.

import * as fs from 'node:fs';
import {
  applyInstallToSettings,
  applyUninstallFromSettings,
  quoteForShell,
  settingsContainsHook
} from '../src/claudeHooks';
import { tryReadJson } from '../src/shared/json';
import { claudeSettingsPath, helperPath } from '../src/shared/paths';
import type { ClaudeSettings } from '../src/types';

const command = quoteForShell(helperPath);

console.log('Helper path:    ', helperPath);
console.log('Quoted command: ', command);
console.log('Settings path:  ', claudeSettingsPath);
console.log('Settings size:  ', fs.statSync(claudeSettingsPath).size, 'bytes');
console.log('');

const before = tryReadJson<ClaudeSettings>(claudeSettingsPath, {});

console.log('=== Scenario A: UPDATE on existing install ===');
console.log('Before — contains hook?', settingsContainsHook(before, command));
console.log('Before — Stop hooks count:', before.hooks?.Stop?.length ?? 0);

const reinstalled = applyInstallToSettings(before, command);
console.log('After install — contains hook?', settingsContainsHook(reinstalled, command));
console.log(
  'After install — Stop hook commands:',
  reinstalled.hooks?.Stop?.flatMap((g) => g.hooks ?? []).map((h) => h.command)
);

const reinstalledTwice = applyInstallToSettings(reinstalled, command);
const idempotent = JSON.stringify(reinstalled) === JSON.stringify(reinstalledTwice);
console.log('After install x2 — idempotent?', idempotent);

console.log('');
console.log('=== Scenario B: CLEAN INSTALL on a stripped settings ===');
const stripped = applyUninstallFromSettings(before, command);
console.log('Stripped — contains hook?', settingsContainsHook(stripped, command));
console.log('Stripped — Stop hooks count:', stripped.hooks?.Stop?.length ?? 0);

const fresh = applyInstallToSettings(stripped, command);
console.log('Fresh install — contains hook?', settingsContainsHook(fresh, command));
console.log(
  'Fresh install — created hook events:',
  Object.keys(fresh.hooks ?? {})
    .filter((k) => fresh.hooks?.[k]?.some((g) => g.hooks?.some((h) => h.command === command)))
    .sort()
);

console.log('');
console.log('=== Scenario C: UNINSTALL roundtrip ===');
const uninstalled = applyUninstallFromSettings(reinstalled, command);
console.log('After uninstall — contains hook?', settingsContainsHook(uninstalled, command));
console.log(
  'After uninstall — preserved foreign hooks:',
  Object.fromEntries(
    Object.entries(uninstalled.hooks ?? {}).map(([k, v]) => [
      k,
      (v ?? []).flatMap((g) => g.hooks ?? []).length
    ])
  )
);

console.log('');
console.log('=== Sanity diff (write-safe) ===');
console.log(
  'Other top-level settings preserved on install:',
  Object.keys(before)
    .filter((k) => k !== 'hooks')
    .sort()
    .join(', ') ===
    Object.keys(reinstalled)
      .filter((k) => k !== 'hooks')
      .sort()
      .join(', ')
);
console.log(
  'Foreign hook events preserved on uninstall:',
  Object.keys(before.hooks ?? {})
    .filter((k) => !['Stop', 'Notification', 'PermissionRequest'].includes(k))
    .every((k) => k in (uninstalled.hooks ?? {}))
);

console.log('');
console.log('No file was written. Original settings are untouched.');
