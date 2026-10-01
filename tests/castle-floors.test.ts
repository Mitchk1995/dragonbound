import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { KEEP_BUILDINGS } from '../src/data/zoneMaps';
import { Player } from '../src/entities/player';
import { Pet } from '../src/entities/pet';
import { Game } from '../src/game';
import { towerEntry } from '../src/world/building';
import { ZoneRuntime } from '../src/world/zone';

// Exercise the real zone/navigation and Game stair transition without a GPU or desktop window.
vi.mock('../src/world/worldView', () => ({
  OCCLUDE: {},
  buildWorldView: () => ({ group: new THREE.Group(), buildings: [], followers: [], props: [], heightAt: () => 0, floorAt: () => 0, tick: () => {} }),
}));

const keep = KEEP_BUILDINGS.find((b) => b.id === 'keep')!;
function fixture() {
  let finishFade: () => void = () => {};
  const game = Object.assign(Object.create(Game.prototype) as Game, {
    time: 0, mode: 'play', traveling: false, player: new Player(), pet: new Pet('golemite', 'golem'),
    mouse: { down: true, mode: 'walk' }, camPos: new THREE.Vector3(),
    skilling: { stop: vi.fn() }, text: { clear: vi.fn() },
    ui: { fade: vi.fn((f: () => void) => { finishFade = f; }), clearZoneState: vi.fn(), zoneTitle: vi.fn() },
  });
  const zone = new ZoneRuntime(game, 'keep', 1388);
  Object.assign(game, { zoneOrNull: zone });
  const station = { obj: new THREE.Group(), update: vi.fn(), kind: 'bank' };
  zone.interactables.push(station as any);
  const [x, z] = towerEntry(keep, keep.turrets!.find((t) => t.use === 'stair')!);
  game.player.pos.set(x + 0.5, 0, z + 0.5);
  const step = (dt = 1 / 60) => (game as unknown as { tryStairs(dt: number): void }).tryStairs(dt);
  return { game, zone, station, step, finish: () => finishFade() };
}

describe('castle floor travel', () => {
  it('changes collision, player/pet height and station visibility once the fade reaches its midpoint', () => {
    const f = fixture(), groundNav = f.zone.nav;
    f.step();
    expect(f.game.traveling).toBe(true);
    expect(f.zone.floor).toBe(0);
    f.step();
    expect(f.game.ui.fade).toHaveBeenCalledTimes(1);
    f.finish();
    expect(f.game.traveling).toBe(false);
    expect(f.zone.floor).toBe(1);
    expect(f.zone.nav).not.toBe(groundNav);
    expect(f.zone.nav.isWalkable(f.game.player.x, f.game.player.z)).toBe(true);
    expect(f.game.player.pos.y).toBe(keep.storeyH);
    expect(f.game.pet!.pos.y).toBe(keep.storeyH);
    expect(f.zone.groundY(f.game.player.x, f.game.player.z)).toBe(keep.storeyH);
    expect(f.station.obj.visible).toBe(false);
    f.step();
    expect(f.game.ui.fade).toHaveBeenCalledTimes(1);
    const [x, z] = towerEntry(keep, keep.turrets!.find((t) => t.use === 'stair')!);
    f.game.player.pos.set(x + 0.5, keep.storeyH!, z + 0.5);
    f.step();
    f.finish();
    expect(f.zone.floor).toBe(0);
    expect(f.zone.nav).toBe(groundNav);
    expect(f.game.player.pos.y).toBe(0);
    expect(f.game.pet!.pos.y).toBe(0);
    expect(f.station.obj.visible).toBe(true);
  });
  it('paused inspection never starts a floor transition', () => {
    const f = fixture();
    f.step(0);
    expect(f.game.ui.fade).not.toHaveBeenCalled();
    expect(f.zone.floor).toBe(0);
  });
  it('a pending old-zone landing cannot put the player upstairs after a portal trip', () => {
    const f = fixture();
    f.step();
    const fresh = new ZoneRuntime(f.game, 'keep', 1388);
    Object.assign(f.game, { zoneOrNull: fresh });
    f.game.player.pos.set(fresh.layout.entry.x, 0, fresh.layout.entry.z);
    f.finish();
    expect(fresh.floor).toBe(0);
    expect(f.game.player.pos.y).toBe(0);
    expect(f.game.traveling).toBe(false);
  });
  it('rejects an upper floor for a building outside the zone or without an upstairs plan', () => {
    const f = fixture();
    expect(f.zone.setFloor(1, { ...keep })).toBe(false);
    expect(f.zone.setFloor(1, KEEP_BUILDINGS.find((b) => b.id === 'bank'))).toBe(false);
    expect(f.zone.floor).toBe(0);
  });
  it('pets follow at their owner\'s floor height, including distance catch-up', () => {
    const f = fixture();
    f.zone.setFloor(1, keep);
    f.game.player.pos.set(75, keep.storeyH!, 28);
    f.game.pet!.pos.set(0, 0, 0);
    f.game.pet!.follow(1 / 60, f.game.player, f.zone.nav);
    expect(f.game.pet!.pos.y).toBe(keep.storeyH);
  });
});
