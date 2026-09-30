import { describe, expect, it, vi } from 'vitest';
import { Enemy } from '../src/entities/enemy';

describe('enemy chase pathfinding', () => {
  it('an unreachable target is searched for on the re-path timer, not every frame', () => {
    const findPath = vi.fn(() => null);
    const g = { zone: { nav: { lineClear: () => false, findPath } } } as any;
    const self = Object.assign(Object.create(Enemy.prototype), {
      obj: { position: { x: 0, z: 0 } }, radius: 0.5, path: [], repathT: 0, pathFailed: false,
      followPath: () => 0, moveToward: () => 0,
    });
    for (let i = 0; i < 20; i++) self.chase(1 / 60, g, 10, 10, 3); // 1/3 s of frames
    expect(findPath).toHaveBeenCalledTimes(1);
  });

  it('a reachable target whose path ran out is re-searched right away', () => {
    const findPath = vi.fn(() => [{ x: 1, z: 1 }]);
    const g = { zone: { nav: { lineClear: () => false, findPath } } } as any;
    const self = Object.assign(Object.create(Enemy.prototype), {
      obj: { position: { x: 0, z: 0 } }, radius: 0.5, path: [], repathT: 0, pathFailed: false,
      followPath(this: any) { this.path = []; return 0; }, moveToward: () => 0,
    });
    self.chase(1 / 60, g, 10, 10, 3);
    self.chase(1 / 60, g, 10, 10, 3);
    expect(findPath).toHaveBeenCalledTimes(2);
  });
});
