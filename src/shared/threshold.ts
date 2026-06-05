export const MIN_TASK_DURATION_SECONDS = 0;
export const MAX_TASK_DURATION_SECONDS = 3600;

export function clampTaskDuration(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_TASK_DURATION_SECONDS;
  }
  return Math.min(MAX_TASK_DURATION_SECONDS, Math.max(MIN_TASK_DURATION_SECONDS, value));
}

export function parseTaskDuration(raw: string): number {
  return Number(raw.trim());
}

export function validateTaskDuration(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return `Enter a number of seconds (${MIN_TASK_DURATION_SECONDS}–${MAX_TASK_DURATION_SECONDS}).`;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return 'Enter a valid number.';
  }
  if (!Number.isInteger(value)) {
    return 'Enter a whole number of seconds.';
  }
  if (value < MIN_TASK_DURATION_SECONDS || value > MAX_TASK_DURATION_SECONDS) {
    return `Enter a value between ${MIN_TASK_DURATION_SECONDS} and ${MAX_TASK_DURATION_SECONDS} seconds.`;
  }
  return undefined;
}
