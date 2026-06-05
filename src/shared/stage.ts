import { tryReadJson, writeJson } from './json';
import { getStagePath } from './paths';
import { sanitiseSessionId } from './taskTimer';

export interface StageState {
  stageId: number;
  firedReasons: string[];
}

export function advanceStage(state: StageState): StageState {
  return { stageId: state.stageId + 1, firedReasons: [] };
}

export function shouldFire(state: StageState, reason: string): { fire: boolean; next: StageState } {
  if (state.firedReasons.includes(reason)) {
    return { fire: false, next: state };
  }
  return { fire: true, next: { stageId: state.stageId, firedReasons: [...state.firedReasons, reason] } };
}

export function reasonForEvent(eventName: string, toolName: string | undefined): string | null {
  switch (eventName) {
    case 'Stop':
      return 'done';
    case 'PermissionRequest':
    case 'Notification':
      return 'input';
    case 'PreToolUse':
      return toolName === 'AskUserQuestion' ? 'question' : null;
    default:
      return null;
  }
}

export function readStageState(sessionId: string): StageState {
  return normaliseState(tryReadJson<unknown>(getStagePath(sanitiseSessionId(sessionId)), {}));
}

export function writeStageState(sessionId: string, state: StageState): void {
  try {
    writeJson(getStagePath(sanitiseSessionId(sessionId)), state);
  } catch {
    // Best-effort dedup state; never block the notification path.
  }
}

function normaliseState(raw: unknown): StageState {
  if (typeof raw !== 'object' || raw === null) {
    return { stageId: 0, firedReasons: [] };
  }
  const obj = raw as Record<string, unknown>;
  const stageId = typeof obj.stageId === 'number' && Number.isFinite(obj.stageId) ? obj.stageId : 0;
  const firedReasons = Array.isArray(obj.firedReasons)
    ? obj.firedReasons.filter((reason): reason is string => typeof reason === 'string')
    : [];
  return { stageId, firedReasons };
}
