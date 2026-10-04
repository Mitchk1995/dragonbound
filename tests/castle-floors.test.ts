import * as THREE from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { KEEP_BUILDINGS } from '../src/data/zoneMaps';
import { ZONES } from '../src/data/zones';
import { Player } from '../src/entities/player';
import { Pet } from '../src/entities/pet';
import { Game } from '../src/game';
import { flightsOf, stairRect, type Flight } from '../src/world/building';
import { ZoneRuntime } from '../src/world/zone';

// Exercise the real zone/navigation and Game stair transition without a GPU or desktop window.
vi.mock('../src/world/worldView', () => ({
  OCCLUDE: {},
  buildWorldView: () => ({ group: new THREE.Group(), buildings: [], followers: [], props: [], heightAt: () => 0, floorAt: () => 0, tick: () => {} }),
}));

// Generating the keep island takes seconds, and building a zone per runtime once pushed the portal-trip case
// (two zones) past the 5 s test timeout on CI. Zone runtimes and floor travel only read their layout, so every
// runtime here shares one generated island; each is still its own runtime with its own floor and navigation.
const SEED = 1388;
beforeAll(() => {
  const keepLayout = ZONES.keep.build(SEED);
  vi.spyOn(ZONES.keep, 'build').mockImplementation((seed) => {
    if (seed !== SEED) throw new Error(`castle-floors builds the keep only at seed ${SEED}`);
    return keepLayout;
  });
}, 60_000);

const keep = KEEP_BUILDINGS.find((b) => b.id === 'keep')!;
/** A flight's low (foot) or high (head) end row: its first cell there, in local cells. */
function end(f: Flight, head: boolean) {
  const [x0, z0, x1, z1] = stairRect(f), up = f.dir === 's' || f.dir === 'e';
  const hi = head === up;
  return f.dir === 'n' || f.dir === 's' ? [x0, hi ? z1 - 1 : z0] : [hi ? x1 - 1 : x0, z0];
}
/** The keep's west stair: its first flight's foot (ground) and its last flight's head (upstairs). */
const stair = keep.stairs![0], fl = flightsOf(stair);
const foot = end(fl[0], false), head = end(fl[fl.length - 1], true);
const footCell = [keep.x + foot[0], keep.z + foot[1]], headCell = [keep.x + head[0], keep.z + head[1]];
function fixture() {
  let finishFade: () => void = () => {};
  const game = Object.assign(Object.create(Game.prototype) as Game, {
    time: 0, mode: 'play', traveling: false, player: new Player(), pet: new Pet('golemite', 'golem'),
    mouse: { down: true, mode: 'walk' }, camPos: new THREE.Vector3(),
    skilling: { stop: vi.fn() }, text: { clear: vi.fn() },
    ui: { fade: vi.fn((f: () => void) => { finishFade = f; }), clearZoneState: vi.fn(), zoneTitle: vi.fn() },
  });
  const zone = new ZoneRuntime(game, 'keep', SEED);
  Object.assign(game, { zoneOrNull: zone });
  const station = { obj: new THREE.Group(), update: vi.fn(), kind: 'bank' };
  zone.interactables.push(station as any);
  game.player.pos.set(footCell[0] + 0.5, 0, footCell[1] + 0.5);
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
    f.game.player.pos.set(headCell[0] + 0.5, keep.storeyH!, headCell[1] + 0.5);
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
    const fresh = new ZoneRuntime(f.game, 'keep', SEED);
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
    f.game.player.pos.set(keep.x + 2.5, keep.storeyH!, keep.z + 10.5);
    f.game.pet!.pos.set(0, 0, 0);
    f.game.pet!.follow(1 / 60, f.game.player, f.zone.nav);
    expect(f.game.pet!.pos.y).toBe(keep.storeyH);
  });
});
