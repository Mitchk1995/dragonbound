import { describe, expect, it } from 'vitest';
import { Enemy } from '../src/entities/enemy';

describe('dormant enemy visibility', () => {
  it('wakes a hidden enemy pulled into combat by another enemy', () => {
    const makeEnemy = (x: number) => Object.assign(Object.create(Enemy.prototype), {
      obj: { position: { x, z: 0 }, visible: true },
      def: { behavior: 'chaser' }, aggro: false, returning: false, dead: false,
      think: () => 0, updateCommon: () => {}, anim: {}, atkCd: 1,
    });
    const nearby = makeEnemy(39), distant = makeEnemy(45);
    const game = { player: { x: 0, z: 0 }, zone: { enemies: [nearby, distant], nav: {} } } as any;
    distant.update(1 / 60, game);
    expect(distant.obj.visible).toBe(false);
    nearby.setAggro(game);
    expect(distant.aggro).toBe(true);
    distant.update(1 / 60, game);
    expect(distant.obj.visible).toBe(true);
  });
});
