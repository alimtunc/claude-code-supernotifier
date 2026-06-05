import { describe, expect, it, vi } from 'vitest';
import { createRestartable } from './restartable';

describe('createRestartable', () => {
  it('is stopped before the first start', () => {
    const controller = createRestartable(() => []);
    expect(controller.running).toBe(false);
  });

  it('runs create once on start and exposes running state', () => {
    const create = vi.fn(() => []);
    const controller = createRestartable(create);
    controller.start();
    expect(create).toHaveBeenCalledTimes(1);
    expect(controller.running).toBe(true);
  });

  it('is idempotent: a second start does not re-create resources', () => {
    const create = vi.fn(() => []);
    const controller = createRestartable(create);
    controller.start();
    controller.start();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('disposes every owned disposable on stop and becomes stopped', () => {
    const a = { dispose: vi.fn() };
    const b = { dispose: vi.fn() };
    const controller = createRestartable(() => [a, b]);
    controller.start();
    controller.stop();
    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(b.dispose).toHaveBeenCalledTimes(1);
    expect(controller.running).toBe(false);
  });

  it('is idempotent: stop when already stopped is a no-op', () => {
    const dispose = vi.fn();
    const controller = createRestartable(() => [{ dispose }]);
    controller.stop();
    expect(dispose).not.toHaveBeenCalled();
  });

  it('start → stop → start re-creates a fresh set without leaking the old one', () => {
    const disposed: number[] = [];
    let round = 0;
    const create = vi.fn(() => {
      const id = round++;
      return [{ dispose: () => disposed.push(id) }];
    });
    const controller = createRestartable(create);
    controller.start();
    controller.stop();
    controller.start();
    expect(create).toHaveBeenCalledTimes(2);
    expect(disposed).toEqual([0]);
    controller.stop();
    expect(disposed).toEqual([0, 1]);
  });
});
