import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RESTORATION_BY_ID } from '../src/data/keep';
import { CASTLE_PLAN, KEEP_BUILDINGS } from '../src/data/zoneMaps';
import { ZONES } from '../src/data/zones';
import { cellRole, fitBlocks, fitsOf, flightsOf, inRoom, partitionRuns, raisedAt, sideLen, stairDest, stairProblems, stairRect, stairSteps, wallCell, wallRuns, type BuildingSpec, type Floor, type Stair } from '../src/world/building';
import { BRIDGE, CLIMB, CROWN_Y, CURTAIN_RUNS, MIRROR_CELL, mx, RANGE, TERRACE_STAIRS, TERRACE_Y, TOWERS } from '../src/world/castle/plan';
import { climbFlights, flightGround, headOf, treadTop } from '../src/world/castle/approach';
import { newSave } from '../src/save/save';
import { buildBuilding, FIT_KINDS } from '../src/world/buildingModel';
import { distToPoly } from '../src/world/gen';
import { Cell, Ground } from '../src/world/layout';
import { buildProp } from '../src/world/props';
import { NavGrid } from '../src/world/navgrid';

const L = ZONES.keep.build(1000 + 'keep'.length * 97);
const nav = new NavGrid(L.w, L.h, L.cells);
const B = Object.fromEntries(KEEP_BUILDINGS.map((b) => [b.id, b]));
const station = (kind: string, id: string) => L.stations.find((s) => s.kind === kind && s.id === id)!;
/** 4-connected flood fill over cells where `ok` holds, from cell index `from`. */
function flood(from: number, ok: (i: number) => boolean) {
  const seen = new Uint8Array(L.w * L.h), stack = [from];
  seen[from] = 1;
  while (stack.length) {
    const i = stack.pop()!, x = i % L.w;
    for (const j of [x > 0 ? i - 1 : -1, x < L.w - 1 ? i + 1 : -1, i - L.w, i + L.w]) {
      if (j < 0 || j >= L.w * L.h || seen[j] || !ok(j)) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return seen;
}
/** Is a point inside a polygon (even-odd rule)? */
function inPoly(x: number, z: number, poly: number[][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

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
  it('a stair that turns: the first flight\'s foot goes up, the last flight\'s head comes down, the rest is solid', () => {
    const t: BuildingSpec = { ...b, w: 12, d: 12, storeyH: 5, wallH: 10, upper: { voids: [[6, 1, 11, 11]] }, stairs: [{ x: 5, z: 8, w: 2, len: 4, dir: 'w', land0: [9, 8], land1: [1, 3], turns: [{ landing: [1, 8, 5, 10], flight: { x: 1, z: 4, w: 2, len: 4, dir: 'n' } }] }] };
    // Climbing west along z 8..9 from its foot at x 8, round the landing, north up x 1..2 to its head at z 4.
    expect(cellRole(t, 18, 28, 0)).toBe('stair');
    expect(cellRole(t, 16, 28, 0)).toBe('wall');
    expect(cellRole(t, 12, 29, 0)).toBe('wall');
    expect(cellRole(t, 11, 25, 0)).toBe('wall');
    expect(cellRole(t, 11, 24, 1)).toBe('stair');
    expect(cellRole(t, 18, 28, 1)).toBe('wall');
    expect(stairDest(t, 18.5, 28.5, 0)).toEqual({ x: 11.5, z: 23.5, floor: 1, y: 5 });
    expect(stairDest(t, 11.5, 24.5, 1)).toEqual({ x: 19.5, z: 28.5, floor: 0, y: 0 });
    // Thirty risers of 16.7 cm, fifteen to each flight, the landing half way up.
    const steps = stairSteps(t.stairs![0], 5);
    expect(steps.map((q) => q.risers)).toEqual([15, 15]);
    expect(steps[1].y0).toBeCloseTo(2.5, 6);
    expect(stairProblems(t)).toEqual([]);
    // The same climb in one flight breaks the rule: 30 risers between landings.
    expect(stairProblems({ ...t, stairs: [{ ...t.stairs![0], turns: undefined }] }).length).toBeGreaterThan(0);
  });
  it('a raised part of the floor (a dais) stands up from the floor round it', () => {
    const t: BuildingSpec = { ...b, raised: [{ rect: [2, 1, 5, 3], h: 0.5 }] };
    expect(raisedAt(t, 13, 21)).toBe(0.5);
    expect(raisedAt(t, 11, 21)).toBe(0);
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
  it('the great keep is two storeys round a throne hall open to its battlements, its galleries at the wall walk', () => {
    const k = B.keep;
    expect(k.storeyH).toBeLessThan(k.wallH - 10);
    expect(k.wallH + TERRACE_Y).toBeGreaterThan(CROWN_Y + 26);
    expect(Math.abs(TERRACE_Y + k.storeyH! - (CROWN_Y + 7.06))).toBeLessThan(0.1);
    expect(k.windows.some((w) => w.floor === 1)).toBe(true);
    expect(k.upper?.voids?.length).toBeGreaterThan(0);
    const p = buildBuilding(k), box = new THREE.Box3().setFromObject(p.obj);
    expect(box.max.y).toBeGreaterThan(k.wallH + 1);
  });
  it('the castle stands level on the crown, the north range and the keep on the terrace; the way in climbs the stair, crosses the bridge and runs up the avenue to the great door', () => {
    let inside = 0;
    for (const [cx, cz] of [[60, 90], [92, 90]]) for (let z = cz - 5; z <= cz + 5; z++) for (let x = cx - 5; x <= cx + 5; x++) {
      const i = z * L.w + x;
      if (L.cells[i] !== Cell.Ground) continue;
      expect(L.level![i], `${x},${z}`).toBe(CROWN_Y);
      inside++;
    }
    expect(inside).toBeGreaterThan(100);
    for (const [x, z] of [[50, 40], [100, 40], [76, 44]]) expect(L.level![z * L.w + x], `terrace ${x},${z}`).toBe(TERRACE_Y);
    const k = B.keep, great = k.doors.find((d) => d.side === 's' && d.w === 4)!;
    const door = { x: k.x + great.at + great.w / 2, z: k.z + k.d + 0.5 };
    const path = nav.findPath(L.entry.x, L.entry.z, door.x, door.z)!;
    expect(path).not.toBeNull();
    // On the way in it climbs the stair, crosses the bridge, passes through the gate and up the avenue.
    const near = (g: { x: number; z: number }) => Math.min(...path.slice(1).map((q, i) => distToPoly(g.x, g.z, [path[i], q]).d));
    for (const g of [{ x: 131, z: 128 }, { x: 125, z: 118 }, { x: 76, z: 105 }, { x: 76, z: 100 }, { x: 76, z: 62 }, { x: 76, z: 50 }]) expect(near(g), `${g.x},${g.z}`).toBeLessThan(2.6);
    // The curtain is shut elsewhere: a step through its north and west runs is blocked.
    expect(nav.isWalkable(50, 21)).toBe(false);
    expect(nav.isWalkable(32, 60)).toBe(false);
  });
  it('the castle is laid out on one axis: the great door, the gate and the dragon fountain', () => {
    const k = B.keep, great = k.doors.find((d) => d.side === 's' && d.w === 4)!;
    const gate = L.props.find((p) => p.kind === 'outer_gatehouse')!, fountain = L.props.find((p) => p.kind === 'dragon_fountain')!;
    expect(k.x + great.at + great.w / 2).toBe(CASTLE_PLAN.gate.x);
    expect(gate.x).toBeCloseTo(CASTLE_PLAN.gate.x, 6);
    expect([fountain.x, fountain.z]).toEqual([76, 70]);
    expect(fountain.x).toBe(CASTLE_PLAN.gate.x);
  });
  it('the plan is a mirror image about the axis: the curtain, the towers, the buildings and the stairs', () => {
    const key = (x: number, z: number) => `${x.toFixed(2)},${z.toFixed(2)}`;
    const towers = new Set(TOWERS.map((t) => key(t.x, t.z)));
    for (const t of TOWERS) expect(towers.has(key(mx(t.x), t.z)), t.id).toBe(true);
    const ends = new Set(CURTAIN_RUNS.flatMap(([a, c]) => [key(a.x, a.z), key(c.x, c.z)]));
    for (const [a] of CURTAIN_RUNS) expect(ends.has(key(mx(a.x), a.z))).toBe(true);
    const rect = (q: BuildingSpec) => [q.x, q.z, q.x + q.w, q.z + q.d];
    for (const [l, r] of [['kitchen', 'solar'], ['great_hall', 'chapel'], ['stables', 'barracks']]) {
      const [x0, z0, x1, z1] = rect(B[l]);
      expect(rect(B[r]), `${l} / ${r}`).toEqual([MIRROR_CELL + 1 - x1, z0, MIRROR_CELL + 1 - x0, z1]);
    }
    expect(B.keep.x + B.keep.w / 2).toBe(CASTLE_PLAN.gate.x);
    expect(RANGE.stables[3] - RANGE.stables[1]).toBe(10);
    const [, k, p] = TERRACE_STAIRS;
    expect([p.x0, p.x1]).toEqual([mx(k.x1), mx(k.x0)]);
    // The stables' and the barracks' gable doors face each other on the cross axis.
    const span = (q: BuildingSpec, side: 'e' | 'w') => q.doors.filter((d) => d.side === side).map((d) => [q.z + d.at, q.z + d.at + d.w]);
    expect(span(B.barracks, 'w')).toEqual(span(B.stables, 'e'));
  });
  it('every flight of the climb and of the terrace\'s stairs climbs evenly between level landings', () => {
    const lv = (x: number, z: number) => L.level![z * L.w + x];
    for (const f of CLIMB.flights) {
      const [x0, z0, x1, z1] = f.rect, alongZ = f.up === 'n' || f.up === 's';
      for (let a = alongZ ? x0 : z0; a < (alongZ ? x1 : z1); a++) {
        const row: number[] = [];
        for (let t = alongZ ? z0 : x0; t < (alongZ ? z1 : x1); t++) row.push(alongZ ? lv(a, t) : lv(t, a));
        const up = f.up === 'n' || f.up === 'w' ? row.reverse() : row;
        for (let i = 1; i < up.length; i++) {
          expect(up[i] - up[i - 1], `flight ${f.rect}`).toBeGreaterThan(0);
          expect(up[i] - up[i - 1], `flight ${f.rect}`).toBeLessThan(0.7);
        }
        expect(up[0]).toBeGreaterThan(f.y0 - 0.01);
        expect(up[up.length - 1]).toBeLessThan(f.y1 + 0.01);
      }
    }
    for (const l of CLIMB.landings) {
      const [x0, z0, x1, z1] = l.rect;
      for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) if (L.cells[z * L.w + x] === Cell.Ground) expect(lv(x, z), `landing ${x},${z}`).toBe(l.y);
    }
    for (const st of TERRACE_STAIRS) for (let z = Math.ceil(st.z0); z + 1.5 < st.z1; z++) {
      const x = Math.floor((st.x0 + st.x1) / 2), a = lv(x, z), c = lv(x, z + 1);
      expect(a - c, `${st.id} at ${z}`).toBeGreaterThan(0);
      expect(a - c, `${st.id} at ${z}`).toBeLessThan(0.7);
    }
  });
  it('the climb is built in real steps: risers of 16 to 17 cm, no flight over 17, a comfortable going, the ground laid under every tread', () => {
    for (const f of climbFlights()) {
      expect(f.risers).toBeLessThanOrEqual(17);
      expect(f.riser).toBeGreaterThanOrEqual(0.16);
      expect(f.riser).toBeLessThanOrEqual(0.17);
      // (Two risers and a tread make a pace: 60 to 65 cm.)
      expect(2 * f.riser + f.tread).toBeGreaterThanOrEqual(0.6);
      expect(2 * f.riser + f.tread).toBeLessThanOrEqual(0.65);
      // The head's landing runs on past the last riser at least a tread deep, to the flight's end.
      expect(f.run - headOf(f)).toBeGreaterThanOrEqual(f.tread);
      // The ground under the flight runs straight from one cell edge to the next (the last edge at the
      // head's level): it never stands through a tread, and the hero walking on it is never more than a
      // riser and a half under the stone (most of the way less than a riser).
      const edge = (j: number) => (j >= f.run ? f.y1 : flightGround(f, j));
      for (let s = 0; s < f.run; s += 0.01) {
        const j = Math.floor(s), ground = edge(j) + (edge(j + 1) - edge(j)) * (s - j), top = treadTop(f, s);
        expect(ground, `${f.foot.x},${f.foot.z} at ${s.toFixed(2)}`).toBeLessThan(top - 0.005);
        expect(top - ground, `${f.foot.x},${f.foot.z} at ${s.toFixed(2)}`).toBeLessThan(1.6 * f.riser);
      }
      // Its cells carry that ground, walkable.
      for (let j = 0; j < f.run; j++) {
        const x = Math.floor(f.foot.x + f.up.x * (j + 0.5)), z = Math.floor(f.foot.z + f.up.z * (j + 0.5)), i = z * L.w + x;
        expect(L.cells[i]).toBe(Cell.Ground);
        expect(L.level![i]).toBeCloseTo(flightGround(f, j), 5);
      }
    }
  });
  it('the bridge is walked at the crown\'s level over the moat, which runs on under its arches', () => {
    const deck = L.decks?.find((d) => d.box[0] <= BRIDGE.x0 && d.box[2] >= BRIDGE.x1);
    expect(deck?.y).toBe(CROWN_Y);
    const [a0, a1] = [BRIDGE.arches[0][0], BRIDGE.arches[BRIDGE.arches.length - 1][1]];
    for (let z = a0; z < a1; z++) for (let x = BRIDGE.deck[0]; x < BRIDGE.deck[1]; x++) {
      const i = z * L.w + x;
      expect(L.fluid[i], `${x},${z}`).toBeGreaterThan(0);
    }
    // The deck is walkable from the gate's passage to the terrace, the parapets' cells either side blocked.
    for (let z = 100; z < BRIDGE.z1 + 1; z++) for (let x = BRIDGE.deck[0]; x < BRIDGE.deck[1]; x++) expect(nav.isWalkable(x + 0.5, z + 0.5), `${x},${z}`).toBe(true);
    for (let z = a0; z < a1; z++) for (const x of [BRIDGE.deck[0] - 1, BRIDGE.deck[1]]) expect(nav.isWalkable(x + 0.5, z + 0.5), `${x},${z}`).toBe(false);
    // (Its box covers the bridge alone: not the gate's passage nor the terrace's banners.)
    expect(deck!.box[1]).toBeGreaterThanOrEqual(100.5);
    expect(deck!.box[3]).toBeLessThanOrEqual(BRIDGE.z1);
  });
  it('a save made anywhere, the old castle included, loads with the hero on the walkable arrival dais', () => {
    // (Saves keep no position: every load enters the keep at its arrival dais.)
    const keys = Object.keys(newSave());
    for (const k of ['pos', 'x', 'z', 'zone', 'position']) expect(keys).not.toContain(k);
    expect(nav.isWalkable(L.entry.x, L.entry.z)).toBe(true);
  });
  it('every castle door opens onto paving and is reached from the gate', () => {
    const from = nav.nearestWalkable(CASTLE_PLAN.gate.x, CASTLE_PLAN.gate.z - 2)!;
    for (const b of KEEP_BUILDINGS.filter((q) => q.style === 'keep')) for (const d of b.doors) {
      for (let k = 0; k < d.w; k++) {
        const [x, z] = d.side === 's' ? [b.x + d.at + k, b.z + b.d] : d.side === 'n' ? [b.x + d.at + k, b.z - 1] : d.side === 'w' ? [b.x - 1, b.z + d.at + k] : [b.x + b.w, b.z + d.at + k];
        const i = z * L.w + x;
        expect(L.ground[i] === Ground.Stone || L.ground[i] === Ground.Path, `${b.id} ${d.side}@${d.at} threshold ${x},${z}`).toBe(true);
        expect(L.cells[i], `${b.id} ${d.side}@${d.at} threshold ${x},${z}`).toBe(Cell.Ground);
        const path = nav.findPath(from.x, from.z, x + 0.5, z + 0.5);
        expect(path, `${b.id} ${d.side}@${d.at}`).not.toBeNull();
        expect(path!.at(-1), `${b.id} ${d.side}@${d.at}`).toEqual({ x: x + 0.5, z: z + 0.5 });
      }
    }
  });
  it('the bailey has no orphan ground, and its walks join up into one network', () => {
    const curtain = CASTLE_PLAN.curtain.map((p) => [p.x, p.z]);
    const inside = (i: number) => inPoly((i % L.w) + 0.5, Math.floor(i / L.w) + 0.5, curtain);
    expect((L.sealed ?? []).filter(inside), 'walkable cells nobody can reach').toEqual([]);
    // Every walkable cell inside the curtain is reached from the arrival dais.
    const reach = flood(Math.floor(L.entry.z) * L.w + Math.floor(L.entry.x), (i) => L.cells[i] === Cell.Ground);
    for (let i = 0; i < L.w * L.h; i++) if (inside(i) && L.cells[i] === Cell.Ground) expect(reach[i], `${i % L.w},${Math.floor(i / L.w)}`).toBe(1);
    // The paving (walks, courts, yards, the terrace, building floors) is one 4-connected region.
    const paved = (i: number) => L.cells[i] === Cell.Ground && inside(i) && (L.ground[i] === Ground.Stone || L.ground[i] === Ground.Path);
    const seed = (CASTLE_PLAN.gate.z - 2) * L.w + CASTLE_PLAN.gate.x;
    expect(paved(seed)).toBe(true);
    const net = flood(seed, paved);
    for (let i = 0; i < L.w * L.h; i++) if (paved(i)) expect(net[i], `paving at ${i % L.w},${Math.floor(i / L.w)}`).toBe(1);
  });
  it('every castle building has its rooms, each one walked into from the gate, and its furnishings', () => {
    for (const b of KEEP_BUILDINGS.filter((q) => q.style === 'keep')) {
      // Flood the ground floor, never crossing an interior doorway: each region is a room.
      const seen = new Set<string>(), rooms: [number, number][][] = [];
      for (let z = b.z + 1; z < b.z + b.d - 1; z++) for (let x = b.x + 1; x < b.x + b.w - 1; x++) {
        if (seen.has(`${x},${z}`) || cellRole(b, x, z) !== 'floor') continue;
        const room: [number, number][] = [], stack = [[x, z]];
        seen.add(`${x},${z}`);
        while (stack.length) {
          const [cx, cz] = stack.pop()!;
          room.push([cx, cz]);
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, nz = cz + dz, key = `${nx},${nz}`;
            if (!seen.has(key) && cellRole(b, nx, nz) === 'floor') {
              seen.add(key);
              stack.push([nx, nz]);
            }
          }
        }
        rooms.push(room);
      }
      for (const room of rooms) {
        const open = room.find(([x, z]) => !fitBlocks(b, x, z) && L.cells[z * L.w + x] === Cell.Ground)!;
        expect(open, `${b.id}: a room with no open floor`).toBeDefined();
        const path = nav.findPath(L.entry.x, L.entry.z, open[0] + 0.5, open[1] + 0.5);
        expect(path, `${b.id} room at ${open}`).not.toBeNull();
        const end = path![path!.length - 1];
        expect(Math.hypot(end.x - open[0] - 0.5, end.z - open[1] - 0.5)).toBeLessThan(1);
      }
      if (b.id === 'kitchen') expect(rooms.length).toBeGreaterThanOrEqual(4);
    }
    const kinds = (id: string, floor: Floor = 0) => new Set(fitsOf(B[id], floor).map((f) => f.kind));
    for (const kind of ['high_table', 'pillar', 'brazier']) expect(kinds('keep'), kind).toContain(kind);
    for (const kind of ['high_table', 'feast_table', 'open_hearth']) expect(kinds('great_hall'), kind).toContain(kind);
    expect(kinds('kitchen')).toContain('hearth_oven');
    for (const kind of ['chapel_altar', 'bench']) expect(kinds('chapel'), kind).toContain(kind);
    expect(kinds('barracks')).toContain('bunk');
    expect(kinds('stables')).toContain('hay');
    // The lord's high table stands on the keep's dais, three steps up.
    const t = B.keep.fits!.find((f) => f.kind === 'high_table')!;
    expect(raisedAt(B.keep, B.keep.x + Math.floor(t.x), B.keep.z + Math.floor(t.z))).toBe(0.5);
  });
  it('every interior doorway opens onto floor you can stand on, on both sides', () => {
    for (const b of KEEP_BUILDINGS) for (const floor of [0, 1] as Floor[]) for (const p of floor ? b.upper?.partitions ?? [] : b.partitions ?? []) {
      for (const [a, dw] of p.doors ?? []) for (let k = a; k < a + dw; k++) {
        const [lx, lz] = p.axis === 'x' ? [k, p.at] : [p.at, k];
        const sides = p.axis === 'x' ? [[lx, lz - 1], [lx, lz + 1]] : [[lx - 1, lz], [lx + 1, lz]];
        for (const [sx, sz] of sides) {
          const role = cellRole(b, b.x + sx, b.z + sz, floor);
          expect(role === 'floor' || role === 'door' || role === 'stair', `${b.id} floor ${floor}: doorway cell ${lx},${lz} opens onto ${role} at ${sx},${sz}`).toBe(true);
        }
      }
    }
  });
  it('every stair keeps the house rules: at most 17 risers of 16 to 17 cm between landings, inside its walls', () => {
    for (const b of KEEP_BUILDINGS) expect(stairProblems(b), b.id).toEqual([]);
  });
  it('every stair connects the floor below to every upper-floor room and back without retriggering', () => {
    const up = new NavGrid(L.w, L.h, L.upper!);
    expect(up.isWalkable(L.entry.x, L.entry.z), 'there is no upstairs street').toBe(false);
    const foot = (st: Stair) => {
      const f = flightsOf(st)[0], [x0, z0, x1, z1] = stairRect(f);
      return f.dir === 'n' ? [x0, z1 - 1] : f.dir === 's' ? [x0, z0] : f.dir === 'w' ? [x1 - 1, z0] : [x0, z0];
    };
    for (const k of KEEP_BUILDINGS.filter((q) => q.stairs?.length)) for (const st of k.stairs!) {
      const [fx, fz] = foot(st), x = k.x + fx, z = k.z + fz;
      const path = nav.findPath(L.entry.x, L.entry.z, x + 0.5, z + 0.5)!;
      expect(path, k.id).not.toBeNull();
      expect(path.at(-1)).toEqual({ x: x + 0.5, z: z + 0.5 });
      const upDest = stairDest(k, x + 0.5, z + 0.5, 0)!;
      expect(upDest.floor).toBe(1);
      expect(upDest.y).toBe(k.storeyH);
      expect(up.isWalkable(upDest.x, upDest.z), `${k.id} arrives upstairs`).toBe(true);
      expect(stairDest(k, upDest.x, upDest.z, 1)).toBeNull();
      for (let zz = k.z + 1; zz < k.z + k.d - 1; zz++) for (let xx = k.x + 1; xx < k.x + k.w - 1; xx++) {
        if (!up.isWalkable(xx + 0.5, zz + 0.5)) continue;
        const p = up.findPath(upDest.x, upDest.z, xx + 0.5, zz + 0.5)!;
        expect(p, `${k.id} upstairs cell ${xx},${zz}`).not.toBeNull();
        expect(p.at(-1)).toEqual({ x: xx + 0.5, z: zz + 0.5 });
        // The way down is the stair's head: stepping onto it brings you back to the floor below.
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
      // (A castle window shows its lit room painted on a plate just behind the glass, seen from
      // outside only; past it the ray goes on into the room.)
      if (b.style === 'keep') expect(hits.some((h) => h.object.name === 'room'), `${b.id} shows its lit room behind the glass`).toBe(true);
      const solid = hits.find((h) => !((h.object as THREE.Mesh).material as THREE.Material).transparent && h.object.name !== 'room');
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
