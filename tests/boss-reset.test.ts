import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Enemy } from '../src/entities/enemy';
import type { Game } from '../src/game';
import { Combat, type Hazard } from '../src/systems/combat';
import { Telegraph } from '../src/fx/telegraph';
import { Fx } from '../src/systems/fx';

function fixture() {
  const zone = { group: new THREE.Group(), telegraphs: [] as Telegraph[], hazards: [] as Hazard[] };
  const game = {
    zone, player: { x: 4, z: 4, radius: 0.45, dead: false },
    ui: { showBoss: vi.fn() }, announce: vi.fn(),
    fx: { add: vi.fn(), fireBurst: vi.fn() }, sfx: { play: vi.fn() },
    glow: { spawn: vi.fn() }, shake: vi.fn(),
  } as unknown as Game;
  const combat = new Combat(game);
  const boss = {} as Enemy;
  const other = {} as Enemy;
  return { zone, game, combat, boss, other };
}

describe('boss retreat cleanup', () => {
  it('cancels and disposes only the resetting boss attacks without resolving them', () => {
    const { zone, combat, boss, other } = fixture();
    const resolve = vi.fn(), resolveOther = vi.fn();
    const pending = combat.telegraph(4, 4, { kind: 'circle', r: 2 }, 1, resolve, boss);
    const kept = combat.telegraph(4, 4, { kind: 'circle', r: 2 }, 3, resolveOther, other);
    const dispose = vi.spyOn(pending, 'dispose');
    combat.hazard(4, 4, { kind: 'circle', r: 2 }, 5, 0.3, 12, boss);
    combat.hazard(4, 4, { kind: 'circle', r: 2 }, 5, 0.3, 12, other);
    combat.onBossDisengage(boss);
    combat.updateTelegraphs(1.5);
    expect(resolve).not.toHaveBeenCalled();
    expect(resolveOther).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(pending.group.parent).toBeNull();
    expect(zone.telegraphs).toEqual([kept]);
    expect(zone.hazards.map(h => h.source)).toEqual([other]);
    combat.updateTelegraphs(2);
    expect(resolveOther).toHaveBeenCalledTimes(1);
  });

  it('prevents an airborne meteor from exploding or damaging the player after retreat', () => {
    const { combat, zone, game, boss } = fixture();
    const damage = vi.spyOn(combat, 'damagePlayer').mockImplementation(() => {});
    combat.meteor(4, 4, boss);
    combat.onBossDisengage(boss);
    combat.updateTelegraphs(2);
    expect(damage).not.toHaveBeenCalled();
    expect(game.fx.fireBurst).not.toHaveBeenCalled();
    expect(zone.telegraphs).toHaveLength(0);
  });

  it('still resolves an engaged boss meteor normally', () => {
    const { combat, game, boss } = fixture();
    const damage = vi.spyOn(combat, 'damagePlayer').mockImplementation(() => {});
    combat.meteor(4, 4, boss);
    combat.updateTelegraphs(2);
    expect(damage).toHaveBeenCalledExactlyOnceWith(12, boss);
    expect(game.fx.fireBurst).toHaveBeenCalledExactlyOnceWith(4, 4, 1.7);
  });

  it('emits no breath while paused and the same density across frame rates', () => {
    const counts = [30, 60, 144].map(fps => {
      const { combat, game, boss } = fixture();
      vi.spyOn(combat, 'damagePlayer').mockImplementation(() => {});
      combat.hazard(4, 4, { kind: 'cone', r: 10, angle: 1, dir: 0 }, 3, 0.3, 12, boss);
      for (let i = 0; i < 10; i++) combat.updateHazards(0);
      expect(game.glow.spawn).not.toHaveBeenCalled();
      for (let i = 0; i < fps; i++) combat.updateHazards(1 / fps);
      return vi.mocked(game.glow.spawn).mock.calls.length;
    });
    for (const count of counts) expect(count).toBeGreaterThanOrEqual(599);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('emits no meteor trail while paused and the same density across frame rates', () => {
    const counts = [30, 60, 144].map(fps => {
      const { combat, game, boss } = fixture();
      (game as { fx: Fx }).fx = new Fx(game);
      combat.meteor(4, 4, boss);
      for (let i = 0; i < 10; i++) game.fx.update(0);
      expect(game.glow.spawn).not.toHaveBeenCalled();
      for (let i = 0; i < fps; i++) game.fx.update(1 / fps);
      return vi.mocked(game.glow.spawn).mock.calls.length;
    });
    for (const count of counts) expect(count).toBeGreaterThanOrEqual(179);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });
});
