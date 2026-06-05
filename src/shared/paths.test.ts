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
  getStagePath,
  getStateDir,
  getTaskStartPath,
  hashWorkspace,
  helperPath,
  iconPath,
  mutedPath,
  soundsDir,
  stagedSoundPath,
  stageRoot,
  taskStartRoot
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
    expect(appDir.endsWith(path.join('.claude-code-supernotifier'))).toBe(true);
  });

  it('helper, config and log paths sit inside appDir', () => {
    for (const child of [helperPath, configPath, iconPath, eventLogPath, errorLogPath, focusStateRoot]) {
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

  it('getTaskStartPath sits inside taskStartRoot and is a per-session json file', () => {
    expect(taskStartRoot.startsWith(appDir + path.sep)).toBe(true);
    expect(path.basename(taskStartRoot)).toBe('task-start');
    const resolved = getTaskStartPath('sess-1');
    expect(path.dirname(resolved)).toBe(taskStartRoot);
    expect(path.basename(resolved)).toBe('sess-1.json');
  });

  it('getStagePath sits inside stageRoot and is a per-session json file', () => {
    expect(stageRoot.startsWith(appDir + path.sep)).toBe(true);
    expect(path.basename(stageRoot)).toBe('stage');
    const resolved = getStagePath('sess-1');
    expect(path.dirname(resolved)).toBe(stageRoot);
    expect(path.basename(resolved)).toBe('sess-1.json');
  });

  it('claudeSettingsPath points at ~/.claude/settings.json', () => {
    expect(claudeSettingsPath.endsWith(path.join('.claude', 'settings.json'))).toBe(true);
  });

  it('mutedPath sits inside appDir and is named muted', () => {
    expect(mutedPath.startsWith(appDir + path.sep)).toBe(true);
    expect(path.basename(mutedPath)).toBe('muted');
  });

  it('soundsDir sits inside appDir and is named sounds', () => {
    expect(soundsDir.startsWith(appDir + path.sep)).toBe(true);
    expect(path.basename(soundsDir)).toBe('sounds');
  });

  it('stagedSoundPath resolves a file inside soundsDir', () => {
    const resolved = stagedSoundPath('done.wav');
    expect(path.dirname(resolved)).toBe(soundsDir);
    expect(path.basename(resolved)).toBe('done.wav');
  });
});
