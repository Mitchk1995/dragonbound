import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RESTORATION_BY_ID } from '../src/data/keep';
import { KEEP_BUILDINGS } from '../src/data/zoneMaps';
import { ZONES } from '../src/data/zones';
import { cellRole, fitBlocks, fitsOf, inRoom, partitionRuns, sideLen, stairDest, stairRect, wallCell, wallRuns, type BuildingSpec, type Floor, type Stair } from '../src/world/building';
import { buildBuilding, FIT_KINDS } from '../src/world/buildingModel';
import { distToPoly } from '../src/world/gen';
import { Cell, Ground } from '../src/world/layout';
import { buildProp } from '../src/world/props';
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
  it('interior walls block, their doorways open, and they split into runs round the doors', () => {
    const r: BuildingSpec = { ...b, w: 10, d: 8, partitions: [{ axis: 'z', at: 4, from: 1, to: 7, doors: [[3, 2]] }] };
    expect(cellRole(r, 14, 21)).toBe('wall');
    expect(cellRole(r, 14, 23)).toBe('door');
    expect(cellRole(r, 14, 24)).toBe('door');
    expect(cellRole(r, 14, 25)).toBe('wall');
    expect(cellRole(r, 13, 23)).toBe('floor');
    expect(partitionRuns(r.partitions![0])).toEqual([[1, 3], [5, 7]]);
  });
  it('a straight stair: its foot is the way up, its head the way down, the flight and stairwell solid', () => {
    const t: BuildingSpec = { ...b, w: 10, d: 10, storeyH: 4, wallH: 8, upper: { voids: [[5, 1, 9, 9]] }, stairs: [{ x: 2, z: 2, w: 1, len: 4, dir: 'n', land0: [2, 6], land1: [2, 6] }] };
    // Climbing north: the foot is the south end (z 5), the head the north end (z 2).
    expect(cellRole(t, 12, 25, 0)).toBe('stair');
    expect(cellRole(t, 12, 23, 0)).toBe('wall');
    expect(cellRole(t, 12, 22, 1)).toBe('stair');
    expect(cellRole(t, 12, 24, 1)).toBe('wall');
    expect(stairDest(t, 12.5, 25.5, 0)).toEqual({ x: 12.5, z: 26.5, floor: 1, y: 4 });
    expect(stairDest(t, 12.5, 22.5, 1)).toEqual({ x: 12.5, z: 26.5, floor: 0, y: 0 });
    expect(stairDest(t, 12.5, 26.5, 1)).toBeNull();
    // The void is open to the floor below: walkable downstairs, not up.
    expect(cellRole(t, 16, 23, 0)).toBe('floor');
    expect(cellRole(t, 16, 23, 1)).toBe('wall');
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
  it('the residence range is two storeys round a hall open to its roof, with battlements and upper windows', () => {
    const k = B.keep;
    expect(k.storeyH).toBeLessThan(k.wallH - 3);
    expect(k.windows.some((w) => w.floor === 1)).toBe(true);
    expect(k.upper?.voids?.length).toBeGreaterThan(0);
    const p = buildBuilding(k), box = new THREE.Box3().setFromObject(p.obj);
    expect(box.max.y).toBeGreaterThan(k.wallH + 4);
  });
  it('the castle stands level on the crown, its curtain closing the wards; the outer gate, the lower ward and the inner gate lead to the hall\'s great door', () => {
    // The wards are level with the crown (+11): round the well in the inner court and across the lower ward.
    let inside = 0;
    for (const [cx, cz] of [[70, 56], [98, 62]]) for (let z = cz - 6; z <= cz + 6; z++) for (let x = cx - 6; x <= cx + 6; x++) {
      const i = z * L.w + x;
      if (L.cells[i] !== Cell.Ground) continue;
      expect(L.level![i], `${x},${z}`).toBe(11);
      inside++;
    }
    expect(inside).toBeGreaterThan(100);
    const k = B.keep, great = k.doors.find((d) => d.side === 's' && d.w === 4)!;
    const door = { x: k.x + great.at + great.w / 2, z: k.z + k.d + 0.5 };
    const path = nav.findPath(L.entry.x, L.entry.z, door.x, door.z)!;
    expect(path).not.toBeNull();
    // On the way in it passes the outer gate (112, 71) and the inner gate (82, 54.8).
    const near = (g: { x: number; z: number }) => Math.min(...path.slice(1).map((q, i) => distToPoly(g.x, g.z, [path[i], q]).d));
    for (const g of [{ x: 112, z: 71 }, { x: 82, z: 54.8 }]) expect(near(g), `${g.x},${g.z}`).toBeLessThan(1.5);
    // The curtain is shut elsewhere: a step through its north wall is blocked.
    expect(nav.isWalkable(80, 19)).toBe(false);
  });
  it('the keep has several rooms with a purpose, and you can walk into every one of them', () => {
    const k = B.keep;
    // Flood the ground floor, never crossing an interior doorway: each region is a room.
    const seen = new Set<string>(), rooms: [number, number][][] = [];
    for (let z = k.z + 1; z < k.z + k.d - 1; z++) for (let x = k.x + 1; x < k.x + k.w - 1; x++) {
      if (seen.has(`${x},${z}`) || cellRole(k, x, z) !== 'floor') continue;
      const room: [number, number][] = [], stack = [[x, z]];
      seen.add(`${x},${z}`);
      while (stack.length) {
        const [cx, cz] = stack.pop()!;
        room.push([cx, cz]);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, nz = cz + dz, key = `${nx},${nz}`;
          if (!seen.has(key) && cellRole(k, nx, nz) === 'floor') {
            seen.add(key);
            stack.push([nx, nz]);
          }
        }
      }
      rooms.push(room);
    }
    expect(rooms.length).toBeGreaterThanOrEqual(4);
    for (const room of rooms) {
      const open = room.find(([x, z]) => !fitBlocks(k, x, z) && L.cells[z * L.w + x] === Cell.Ground)!;
      expect(open).toBeDefined();
      const path = nav.findPath(L.entry.x, L.entry.z, open[0] + 0.5, open[1] + 0.5);
      expect(path, `room at ${open}`).not.toBeNull();
      const end = path![path!.length - 1];
      expect(Math.hypot(end.x - open[0] - 0.5, end.z - open[1] - 0.5)).toBeLessThan(1);
    }
    // The great hall has the high table, the long tables and the open hearth; the service end its
    // casks and stores; the other castle buildings their own furnishings.
    const kinds = (id: string, floor: Floor = 0) => new Set(fitsOf(B[id], floor).map((f) => f.kind));
    for (const kind of ['high_table', 'feast_table', 'open_hearth', 'barrel', 'shelf']) expect(kinds('keep'), kind).toContain(kind);
    for (const kind of ['ledger_desk', 'bench']) expect(kinds('keep', 1), kind).toContain(kind);
    expect(kinds('kitchen')).toContain('hearth_oven');
    for (const kind of ['weapon_rack', 'chapel_altar']) expect(kinds('west_wing'), kind).toContain(kind);
    expect(kinds('barracks')).toContain('bunk');
  });
  it('the screens stair connects the entry to every upper-floor room and back without retriggering', () => {
    const k = B.keep, up = new NavGrid(L.w, L.h, L.upper!);
    expect(k.stairs).toHaveLength(1);
    expect(up.isWalkable(L.entry.x, L.entry.z), 'there is no upstairs street').toBe(false);
    const foot = (st: Stair) => {
      const [x0, z0, x1, z1] = stairRect(st);
      return st.dir === 'n' ? [x0, z1 - 1] : st.dir === 's' ? [x0, z0] : st.dir === 'w' ? [x1 - 1, z0] : [x0, z0];
    };
    for (const st of k.stairs!) {
      const [fx, fz] = foot(st), x = k.x + fx, z = k.z + fz;
      const path = nav.findPath(L.entry.x, L.entry.z, x + 0.5, z + 0.5)!;
      expect(path).not.toBeNull();
      expect(path.at(-1)).toEqual({ x: x + 0.5, z: z + 0.5 });
      const upDest = stairDest(k, x + 0.5, z + 0.5, 0)!;
      expect(upDest.floor).toBe(1);
      expect(upDest.y).toBe(k.storeyH);
      expect(up.isWalkable(upDest.x, upDest.z)).toBe(true);
      expect(stairDest(k, upDest.x, upDest.z, 1)).toBeNull();
      for (let zz = k.z + 1; zz < k.z + k.d - 1; zz++) for (let xx = k.x + 1; xx < k.x + k.w - 1; xx++) {
        if (!up.isWalkable(xx + 0.5, zz + 0.5)) continue;
        const p = up.findPath(upDest.x, upDest.z, xx + 0.5, zz + 0.5)!;
        expect(p, `upstairs cell ${xx},${zz}`).not.toBeNull();
        expect(p.at(-1)).toEqual({ x: xx + 0.5, z: zz + 0.5 });
        // The way down is the stair's head: stepping onto it brings you back to the ground floor.
        const down = stairDest(k, xx + 0.5, zz + 0.5, 1);
        if (down) {
          expect(nav.isWalkable(down.x, down.z)).toBe(true);
          expect(stairDest(k, down.x, down.z, 0)).toBeNull();
        }
      }
    }
  });
  it('the smelter is laid out as the work flows: ore in from the east, furnace, casting to the west, bars by the south door', () => {
    const s = B.smelter, at = (kind: string) => s.fits!.find((f) => f.kind === kind)!;
    const furnace = at('furnace_spot');
    expect(at('ore_bin').x).toBeGreaterThan(furnace.x);
    expect(at('ore_cart').x).toBeGreaterThan(furnace.x);
    expect(at('crucibles').x).toBeLessThan(furnace.x);
    expect(at('bars').z).toBeGreaterThan(s.d / 2);
    expect(s.doors.some((d) => d.side === 'e')).toBe(true);
  });
  it('no two furnishings in a building stand in each other', () => {
    for (const b of KEEP_BUILDINGS) {
      const fits = (b.fits ?? []).filter((f) => f.block);
      for (let i = 0; i < fits.length; i++) for (let j = i + 1; j < fits.length; j++) {
        const p = fits[i], q = fits[j];
        const overlap = Math.abs(p.x - q.x) < p.block![0] + q.block![0] - 0.05 && Math.abs(p.z - q.z) < p.block![1] + q.block![1] - 0.05;
        expect(overlap, `${b.id}: ${p.kind} @${p.x},${p.z} / ${q.kind} @${q.x},${q.z}`).toBe(false);
      }
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
  it('the bank counter, furnace and shop counter stand inside their buildings; the Board stands in the arrival court', () => {
    expect(inRoom(B.bank, station('bank', 'bank').x, station('bank', 'bank').z, 0)).toBe(true);
    expect(inRoom(B.smelter, station('furnace', 'furnace').x, station('furnace', 'furnace').z, 0)).toBe(true);
    expect(inRoom(B.shop, station('shop', 'shop').x, station('shop', 'shop').z, 0)).toBe(true);
    expect(inRoom(B.shop, station('npc', 'quartermaster').x, station('npc', 'quartermaster').z, 0)).toBe(true);
    const board = station('restore', 'board'), warden = station('npc', 'warden');
    expect(Math.hypot(board.x - L.entry.x, board.z - L.entry.z)).toBeLessThan(10);
    expect(Math.hypot(board.x - warden.x, board.z - warden.z)).toBeLessThan(15);
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
  it('the Quartermaster is talked to across his counter, from the customer side', () => {
    const q = station('npc', 'quartermaster'), counter = station('shop', 'shop');
    // A click on him paths to the nearest open cell: it must be in front of the counter and
    // within talking reach (NPC reach 2.2 + the hero's radius 0.45).
    const stand = nav.nearestWalkable(q.x, q.z)!;
    expect(stand.z).toBeGreaterThan(counter.z);
    expect(Math.hypot(stand.x - q.x, stand.z - q.z)).toBeLessThanOrEqual(2.65);
    const path = nav.findPath(L.entry.x, L.entry.z, q.x, q.z)!;
    const end = path[path.length - 1];
    expect(end.z).toBeGreaterThan(counter.z);
  });
  it('the Great Anvil looks different once reforged', () => {
    const p = buildProp('anvil');
    const visible = () => {
      let n = 0;
      p.obj.traverseVisible((o) => { if (o instanceof THREE.Mesh) n += (o.geometry.getAttribute('position').count); });
      return n;
    };
    p.setState!('ruined');
    const cracked = visible();
    let hot = false;
    p.setState!('restored');
    p.obj.traverseVisible((o) => { if (o instanceof THREE.Mesh && (o.material as THREE.MeshStandardMaterial).emissiveIntensity > 1) hot = true; });
    expect(visible()).not.toBe(cracked);
    expect(hot, 'the reforged anvil has a glowing bar / rune').toBe(true);
  });
  it('yard and roadside dressing never blocks a road', () => {
    for (const p of L.props) {
      const i = Math.floor(p.z) * L.w + Math.floor(p.x);
      if (['fence', 'hedge', 'cart', 'haystack', 'veg_patch', 'planter', 'target', 'scarecrow', 'stump'].includes(p.kind) || p.kind.startsWith('fit_')) {
        expect(L.ground[i] === Ground.Path, `${p.kind} at ${p.x},${p.z}`).toBe(false);
      }
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
  it('upstairs shows the boards and upper rooms, the hall below through its open void, and switches back cleanly', () => {
    const p = buildBuilding(B.keep);
    const [, built, roof, , upper] = p.obj.children;
    const ground = built.children[0];
    p.setCut(1, 0);
    expect([ground.visible, upper.visible, roof.visible]).toEqual([true, false, false]);
    p.setCut(1, 1);
    expect([ground.visible, upper.visible, roof.visible]).toEqual([true, true, false]);
    p.setCut(1, 0);
    expect([ground.visible, upper.visible, roof.visible]).toEqual([true, false, false]);
  });
  it('the lifted parts sit above the cut; what stays is floor, stubs, back walls and furniture', () => {
    const p = buildBuilding(B.shop);
    const box = new THREE.Box3().setFromObject(lifted(p));
    expect(box.min.y).toBeGreaterThan(1.0);
  });
  it('windows are real openings: you see through the glass, past the wall, into the room', () => {
    for (const b of [B.smelter, B.keep, B.bank]) {
      const p = buildBuilding(b);
      p.obj.updateMatrixWorld(true);
      const meshes: THREE.Mesh[] = [];
      p.obj.traverse((o) => { if (o instanceof THREE.Mesh) meshes.push(o); });
      const wi = b.windows.find((w) => w.side === 'n' && !w.floor)!;
      const dims = b.style === 'timber' ? { ww: 1.0, wh: 1.3, wy: 1.55 } : b.style === 'stone' ? { ww: 1.0, wh: 1.3, wy: 1.55 } : { ww: 0.8, wh: 2.4, wy: 1.7 };
      // Aim through one pane (clear of the mullion and transom), from outside the north wall.
      const from = new THREE.Vector3(b.x + wi.at + dims.ww / 4, dims.wy + dims.wh * 0.3, b.z - 3);
      const hits = new THREE.Raycaster(from, new THREE.Vector3(0, 0, 1)).intersectObjects(meshes, false);
      const glass = hits.find((h) => (h.object as THREE.Mesh).material instanceof THREE.Material && ((h.object as THREE.Mesh).material as THREE.Material).transparent);
      expect(glass, `${b.id} has glass in the opening`).toBeDefined();
      expect(((glass!.object as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity).toBeLessThan(0.5);
      const solid = hits.find((h) => !((h.object as THREE.Mesh).material as THREE.Material).transparent);
      // The first solid thing the ray meets is inside the room, not the wall around the window.
      expect(solid ? solid.point.z : Infinity, b.id).toBeGreaterThan(b.z + 1.1);
    }
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
    const used = new Set(KEEP_BUILDINGS.flatMap((b) => [...fitsOf(b), ...fitsOf(b, 1)].map((f) => f.kind)));
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
