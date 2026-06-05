import * as vscode from 'vscode';
import { CONFIG_SECTION } from './constants';
import { previewSound } from './notifierApp';
import { listPresetsForPlatform, NO_SOUND_LABEL, NO_SOUND_VALUE } from './shared/soundPresets';
import type { SoundEvent } from './types';

const EVENT_SETTING_KEY: Readonly<Record<SoundEvent, string>> = {
  stop: 'stopSound',
  permission: 'permissionSound',
  question: 'questionSound',
  subagentStop: 'subagentStopSound'
};

const EVENT_CHOICES: ReadonlyArray<{ label: string; value: SoundEvent }> = [
  { label: 'Finished (Stop)', value: 'stop' },
  { label: 'Permission', value: 'permission' },
  { label: 'Question', value: 'question' },
  { label: 'Subagent', value: 'subagentStop' }
];

const PREVIEW_DEBOUNCE_MS = 150;

interface SoundQuickPickItem extends vscode.QuickPickItem {
  value: string;
}

export async function pickEventSound(event?: SoundEvent): Promise<void> {
  const target = event ?? (await pickEvent());
  if (!target) {
    return;
  }
  await pickSound(target);
}

async function pickEvent(): Promise<SoundEvent | undefined> {
  const choice = await vscode.window.showQuickPick(EVENT_CHOICES.slice(), {
    placeHolder: 'Which event sound do you want to change?'
  });
  return choice?.value;
}

function pickSound(event: SoundEvent): Promise<void> {
  return new Promise((resolve) => {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const settingKey = EVENT_SETTING_KEY[event];
    const current = config.get<string>(settingKey, NO_SOUND_VALUE);
    const items = buildItems(current);

    const quickPick = vscode.window.createQuickPick<SoundQuickPickItem>();
    quickPick.title = `Sound for ${event}`;
    quickPick.placeholder = 'Arrow through to preview; Enter to save, Esc to cancel';
    quickPick.items = items;
    const active = items.find((item) => item.value === current);
    if (active) {
      quickPick.activeItems = [active];
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let done = false;

    function cleanup(): void {
      if (done) {
        return;
      }
      done = true;
      if (timer) {
        clearTimeout(timer);
      }
      quickPick.dispose();
      resolve();
    }

    quickPick.onDidChangeActive((activeItems) => {
      const item = activeItems[0];
      if (!item) {
        return;
      }
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => previewSound(item.value), PREVIEW_DEBOUNCE_MS);
    });

    quickPick.onDidAccept(async () => {
      const selected = quickPick.selectedItems[0];
      if (selected) {
        await config.update(settingKey, selected.value, vscode.ConfigurationTarget.Global);
      }
      cleanup();
    });

    quickPick.onDidHide(() => cleanup());

    quickPick.show();
  });
}

function buildItems(current: string): SoundQuickPickItem[] {
  const presets = listPresetsForPlatform(process.platform);
  return [
    toItem(NO_SOUND_LABEL, NO_SOUND_VALUE, current),
    ...presets.map((name) => toItem(name, name, current))
  ];
}

function toItem(label: string, value: string, current: string): SoundQuickPickItem {
  return value === current ? { label, value, description: '$(check) current' } : { label, value };
}
