export interface Disposableish {
  dispose(): void;
}

export interface Restartable {
  readonly running: boolean;
  start(): void;
  stop(): void;
}

export function createRestartable(create: () => Disposableish[]): Restartable {
  let live: Disposableish[] | null = null;

  return {
    get running(): boolean {
      return live !== null;
    },
    start(): void {
      if (live) {
        return;
      }
      live = create();
    },
    stop(): void {
      if (!live) {
        return;
      }
      const owned = live;
      live = null;
      for (const disposable of owned) {
        disposable.dispose();
      }
    }
  };
}
