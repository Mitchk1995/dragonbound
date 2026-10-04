import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Projectile } from '../src/entities/projectile';
import type { Game } from '../src/game';
import { Combat } from '../src/systems/combat';
import { Cell } from '../src/world/layout';

function fixture(kind: 'fireball' | 'arrow', range = 2) {
  const projectile = new Projectile({
    kind, owner: 'player', x: 4, z: 4, dirX: 1, dirZ: 0,
    speed: 10, dmg: 2, range, ...(kind === 'fireball' ? { aoe: 2.6 } : {}),
  });
  const group = new THREE.Group();
  group.add(projectile.mesh);
  const zone = {
    projectiles: [projectile], group, enemies: [] as any[],
    layout: { w: 20, h: 20, cells: new Uint8Array(400) },
  };
  const fx = { fireBurst: vi.fn(), trail: vi.fn() };
  const game = {
    zone, player: { x: 0, z: 0, radius: 0.45, dead: false },
    glow: { spawn: vi.fn() }, fx, sfx: { play: vi.fn() }, shake: vi.fn(),
  } as unknown as Game;
  return { combat: new Combat(game), projectile, zone, fx };
}

describe('projectile explosions', () => {
  it('explodes a fireball once when it reaches maximum range in open ground', () => {
    const { combat, projectile, zone, fx } = fixture('fireball');
    combat.updateProjectiles(0.2);
    expect(fx.fireBurst).toHaveBeenCalledExactlyOnceWith(projectile.x, projectile.z, 2.6);
    expect(zone.projectiles).toHaveLength(0);
    expect(projectile.mesh.parent).toBeNull();
    combat.updateProjectiles(0.2);
    expect(fx.fireBurst).toHaveBeenCalledTimes(1);
  });

  it('does not explode a fireball before its range is reached', () => {
    const { combat, zone, fx } = fixture('fireball');
    combat.updateProjectiles(0.1);
    expect(fx.fireBurst).not.toHaveBeenCalled();
    expect(zone.projectiles).toHaveLength(1);
  });

  it('explodes once on hitting a wall before maximum range', () => {
    const { combat, zone, fx } = fixture('fireball', 10);
    zone.layout.cells[4 * 20 + 5] = Cell.Wall;
    combat.updateProjectiles(0.1);
    expect(fx.fireBurst).toHaveBeenCalledTimes(1);
    expect(zone.projectiles).toHaveLength(0);
  });

  it('does not double-explode when hitting an enemy on the range boundary', () => {
    const { combat, zone, fx } = fixture('fireball');
    zone.enemies.push({ x: 6, z: 4, radius: 0.5, dead: false, untargetable: false });
    vi.spyOn(combat, 'hitEnemy').mockImplementation(() => {});
    combat.updateProjectiles(0.2);
    expect(fx.fireBurst).toHaveBeenCalledTimes(1);
    expect(zone.projectiles).toHaveLength(0);
  });

  it('removes an arrow at maximum range without creating an explosion', () => {
    const { combat, projectile, zone, fx } = fixture('arrow');
    combat.updateProjectiles(0.2);
    expect(fx.fireBurst).not.toHaveBeenCalled();
    expect(zone.projectiles).toHaveLength(0);
    expect(projectile.mesh.parent).toBeNull();
  });
});
