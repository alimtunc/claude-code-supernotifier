import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appDir,
  claudeSettingsPath,
  configPath,
  errorLogPath,
  eventLogPath,
  focusStateRoot,
  getClickedPath,
  getSignalPath,
  getStateDir,
  hashWorkspace,
  helperPath
} from './paths';

describe('paths', () => {
  it('hashWorkspace is deterministic and 12 hex chars', () => {
    const value = hashWorkspace('/Users/alice/dev/app');
    expect(value).toMatch(/^[a-f0-9]{12}$/);
    expect(hashWorkspace('/Users/alice/dev/app')).toBe(value);
  });

  it('hashWorkspace differs for different inputs', () => {
    expect(hashWorkspace('/a')).not.toBe(hashWorkspace('/b'));
  });

  it('appDir lives under the user home', () => {
    expect(appDir.endsWith(path.join('.supernotify'))).toBe(true);
  });

  it('helper, config and log paths sit inside appDir', () => {
    for (const child of [helperPath, configPath, eventLogPath, errorLogPath, focusStateRoot]) {
      expect(child.startsWith(appDir + path.sep)).toBe(true);
    }
  });

  it('getStateDir is inside the focus state root and namespaced by hash', () => {
    const root = '/Users/alice/dev/app';
    const stateDir = getStateDir(root);
    expect(stateDir.startsWith(focusStateRoot + path.sep)).toBe(true);
    expect(path.basename(stateDir)).toBe(hashWorkspace(root));
  });

  it('getSignalPath/getClickedPath sit inside getStateDir for a workspace', () => {
    const root = '/x/y/z';
    expect(path.dirname(getSignalPath(root))).toBe(getStateDir(root));
    expect(path.dirname(getClickedPath(root))).toBe(getStateDir(root));
    expect(path.basename(getSignalPath(root))).toBe('signal.json');
    expect(path.basename(getClickedPath(root))).toBe('clicked');
  });

  it('claudeSettingsPath points at ~/.claude/settings.json', () => {
    expect(claudeSettingsPath.endsWith(path.join('.claude', 'settings.json'))).toBe(true);
  });
});
