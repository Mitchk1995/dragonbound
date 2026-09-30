import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RESTORATION_BY_ID } from '../src/data/keep';
import { KEEP_BUILDINGS } from '../src/data/zoneMaps';
import { ZONES } from '../src/data/zones';
import { cellRole, inRoom, sideLen, wallCell, wallRuns, type BuildingSpec } from '../src/world/building';
import { buildBuilding, FIT_KINDS } from '../src/world/buildingModel';
import { Cell } from '../src/world/layout';
import { NavGrid } from '../src/world/navgrid';

const L = ZONES.keep.build(1000 + 'keep'.length * 97);
const nav = new NavGrid(L.w, L.h, L.cells);
const B = Object.fromEntries(KEEP_BUILDINGS.map((b) => [b.id, b]));
const station = (kind: string, id: string) => L.stations.find((s) => s.kind === kind && s.id === id)!;

describe('building specs (pure)', () => {
  const b: BuildingSpec = { id: 't', style: 'stone', interior: 'bank', x: 10, z: 20, w: 8, d: 6, wallH: 4, roof: 0, doors: [{ side: 's', at: 3, w: 2 }], windows: [] };
  it('the outer ring is wall, the doorway and the inside are floor', () => {
    expect(cellRole(b, 10, 20)).toBe('wall');
    expect(cellRole(b, 12, 20)).toBe('wall');
    expect(cellRole(b, 13, 25)).toBe('door');
    expect(cellRole(b, 14, 25)).toBe('door');
    expect(cellRole(b, 15, 25)).toBe('wall');
    expect(cellRole(b, 11, 21)).toBe('floor');
    expect(cellRole(b, 9, 21)).toBe('out');
    expect(wallCell(b, 's', 3)).toEqual([13, 25]);
  });
  it('wall runs stop at doorways', () => {
    expect(wallRuns(b, 's')).toEqual([[0, 3], [5, 8]]);
    expect(wallRuns(b, 'n')).toEqual([[0, 8]]);
  });
  it('a room counts the floor and the doorway, not the street outside', () => {
    expect(inRoom(b, 14, 22)).toBe(true);
    expect(inRoom(b, 14, 25.5)).toBe(true);
    expect(inRoom(b, 14, 27)).toBe(false);
    expect(inRoom(b, 8, 22)).toBe(false);
  });
});

describe('Dragonspire Keep', () => {
  it('is a big island (about 150 cells across)', () => {
    expect(L.w).toBeGreaterThanOrEqual(140);
    expect(L.h).toBeGreaterThanOrEqual(140);
    let ground = 0;
    for (let i = 0; i < L.w * L.h; i++) if (L.cells[i] !== Cell.Void) ground++;
    expect(ground).toBeGreaterThan(12000);
  });
  it('every building is stamped into the grid: walls block, doorways open', () => {
    expect(L.buildings?.length).toBe(KEEP_BUILDINGS.length);
    for (const b of KEEP_BUILDINGS) {
      for (let z = b.z; z < b.z + b.d; z++) for (let x = b.x; x < b.x + b.w; x++) {
        const role = cellRole(b, x, z), cell = L.cells[z * L.w + x];
        if (role === 'wall') expect(cell, `${b.id} wall ${x},${z}`).toBe(Cell.Blocked);
        if (role === 'door') expect(cell, `${b.id} door ${x},${z}`).toBe(Cell.Ground);
      }
    }
  });
  it('doorways are at least two cells wide and clear of the corners', () => {
    for (const b of KEEP_BUILDINGS) for (const d of b.doors) {
      expect(d.w, b.id).toBeGreaterThanOrEqual(2);
      expect(d.at, b.id).toBeGreaterThanOrEqual(2);
      expect(d.at + d.w, b.id).toBeLessThanOrEqual(sideLen(b, d.side) - 2);
    }
  });
  it('the side vault opens into the bank through the wall they share', () => {
    const bank = B.bank, vault = B.vault;
    expect(vault.shared).toContain('w');
    expect(vault.x).toBe(bank.x + bank.w - 1);
    const bd = bank.doors.find((d) => d.side === 'e')!, vd = vault.doors.find((d) => d.side === 'w')!;
    expect(bank.z + bd.at).toBe(vault.z + vd.at);
    expect(bd.w).toBe(vd.w);
  });
  it('the bank counter, furnace, shop counter and Restoration Board stand inside their buildings', () => {
    expect(inRoom(B.bank, station('bank', 'bank').x, station('bank', 'bank').z, 0)).toBe(true);
    expect(inRoom(B.smelter, station('furnace', 'furnace').x, station('furnace', 'furnace').z, 0)).toBe(true);
    expect(inRoom(B.shop, station('shop', 'shop').x, station('shop', 'shop').z, 0)).toBe(true);
    expect(inRoom(B.shop, station('npc', 'quartermaster').x, station('npc', 'quartermaster').z, 0)).toBe(true);
    expect(inRoom(B.great_hall, station('restore', 'board').x, station('restore', 'board').z, 0)).toBe(true);
  });
  it('every station is reachable from the arrival dais within the player\'s A* budget', () => {
    for (const s of L.stations) {
      const path = nav.findPath(L.entry.x, L.entry.z, s.x, s.z);
      expect(path, `${s.kind}:${s.id}`).not.toBeNull();
      const end = path![path!.length - 1];
      expect(Math.hypot(end.x - s.x, end.z - s.z), `${s.kind}:${s.id}`).toBeLessThan(3.2);
    }
  });
  it('you can walk into every building and between the busiest stations', () => {
    for (const b of KEEP_BUILDINGS) {
      const c = nav.nearestWalkable(b.x + b.w / 2, b.z + b.d / 2)!;
      expect(inRoom(b, c.x, c.z, 0), b.id).toBe(true);
      const path = nav.findPath(L.entry.x, L.entry.z, c.x, c.z);
      expect(path, `into ${b.id}`).not.toBeNull();
      const end = path![path!.length - 1];
      expect(inRoom(b, end.x, end.z, 0), `into ${b.id}`).toBe(true);
    }
    const busy = [station('bank', 'bank'), station('furnace', 'furnace'), station('anvil', 'anvil'), station('shop', 'shop'), station('npc', 'warden')];
    for (const a of busy) for (const b of busy) {
      if (a === b) continue;
      const from = nav.nearestWalkable(a.x, a.z + 1.5)!;
      expect(nav.findPath(from.x, from.z, b.x, b.z), `${a.id} → ${b.id}`).not.toBeNull();
    }
  });
  it('every restorable plot is a real restoration with a marker to inspect it', () => {
    for (const b of KEEP_BUILDINGS.filter((x) => x.restore)) {
      expect(RESTORATION_BY_ID[b.restore!], b.id).toBeDefined();
      expect(L.stations.some((s) => s.kind === 'restore' && s.id === b.restore), b.id).toBe(true);
    }
  });
});

describe('building models', () => {
  const lifted = (p: ReturnType<typeof buildBuilding>) => p.obj.children[2];
  it('the roof and camera-side walls lift away while the hero is inside', () => {
    const p = buildBuilding(B.bank);
    expect(lifted(p).visible).toBe(true);
    p.setCut(0.5);
    expect(lifted(p).visible).toBe(true);
    let shadow = false;
    lifted(p).traverse((o) => { if (o instanceof THREE.Mesh && o.castShadow) shadow = true; });
    expect(shadow, 'a lifting roof stops casting shadow into the room').toBe(false);
    p.setCut(1);
    expect(lifted(p).visible).toBe(false);
    expect(p.contains(B.bank.x + 5, B.bank.z + 5)).toBe(true);
    expect(p.contains(B.bank.x - 3, B.bank.z + 5)).toBe(false);
  });
  it('the lifted parts sit above the cut; what stays is floor, stubs, back walls and furniture', () => {
    const p = buildBuilding(B.shop);
    const box = new THREE.Box3().setFromObject(lifted(p));
    expect(box.min.y).toBeGreaterThan(1.0);
  });
  it('restorable plots show ruins until restored', () => {
    const p = buildBuilding(B.alchemy_plot);
    const [, built, lift, ruin] = p.obj.children;
    p.setState!('ruined');
    expect([built.visible, lift.visible, ruin.visible]).toEqual([false, false, true]);
    p.setState!('restored');
    expect([built.visible, lift.visible, ruin.visible]).toEqual([true, true, false]);
  });
  it('every building and furnishing builds with finite geometry', () => {
    const used = new Set(KEEP_BUILDINGS.flatMap((b) => (b.fits ?? []).map((f) => f.kind)));
    for (const k of used) expect(FIT_KINDS, k).toContain(k);
    for (const b of KEEP_BUILDINGS) {
      let bad = 0;
      buildBuilding(b).obj.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const a = o.geometry.getAttribute('position').array as ArrayLike<number>;
        for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) bad++;
      });
      expect(bad, b.id).toBe(0);
    }
  }, 30000);
});
