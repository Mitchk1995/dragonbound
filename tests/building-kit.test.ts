import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { KitBuild, type Placed } from '../src/world/kit/build';
import { overlap, placeClaim, turn, inside, type Claim, type Hull, type P3 } from '../src/world/kit/claims';
import { ELEMENTS, stoneEl } from '../src/world/kit/elements';
import { buildBakery, DOOR, H, HOUSE, STAIR, standsIn, type Cut } from '../src/world/kit/house';
import { OVEN, RISE, treadTop } from '../src/world/kit/houseInside';
import { APEX, CHIMNEY_TOP, plane } from '../src/world/kit/houseRoof';
import { CELL, CELL_U, COURSE, HERO_H, STEP, STEP_U, U, type Rot } from '../src/world/kit/scale';
import { lightOf } from '../src/world/kit/shapes/openings';
import { LAYERS } from '../src/world/kit/surfaces';
import { course, joints, type Line } from '../src/world/kit/walls';

/** The hero across in plate armour, arms at his sides (as measured in the game by the `kit` inspect suite). */
const HERO_W_PLATE = 1.42;
const u = (m: number) => m / U;

describe('the building kit\'s grid', () => {
  it('is sized from the hero: four courses tall, a cell 0.45 m, a step 0.18 m, a course three steps', () => {
    expect(CELL).toBeCloseTo(0.45, 6);
    expect(STEP).toBeCloseTo(0.18, 6);
    expect(COURSE).toBeCloseTo(3 * STEP, 6);
    expect(HERO_H / COURSE).toBeGreaterThan(3.9);
    expect(HERO_H / COURSE).toBeLessThan(4.1);
    // A stone two cells long is that long (less its joint) and a course tall.
    const [lo, hi] = stoneEl(2).parts[0].mesh().bounds();
    expect((hi.y - lo.y) * U).toBeCloseTo(COURSE, 6);
    expect((hi.x - lo.x) * U).toBeCloseTo(2 * CELL - 0.5 * U, 6);
  });

  it('has a door the hero walks through in plate armour with room over his head and either side', () => {
    const [x0, y0, x1, y1] = lightOf(DOOR.w, (H.doorHead - H.walk) * STEP_U, true);
    expect((x1 - x0) * U).toBeGreaterThan(HERO_W_PLATE + 0.3);
    expect((y1 - y0) * U).toBeGreaterThan(HERO_H + 0.6);
  });
});

describe('claims', () => {
  const at = (c: Claim, o: P3 = [0, 0, 0], rot: Rot = 0) => placeClaim(c, rot, o);
  it('touching face to face is not overlapping; sharing space is', () => {
    const a = at({ box: [0, 0, 0, 20, 24, 20] });
    expect(overlap(a, at({ box: [20, 0, 0, 40, 24, 20] }))).toBe(false);
    expect(overlap(a, at({ box: [19, 0, 0, 40, 24, 20] }))).toBe(true);
  });
  it('a sloped top touching a sloped bottom along the slope does not overlap, one a little lower does', () => {
    const wall = at({ box: [0, 0, 0, 20, 16, 20], top: { axis: 'z', at0: 16, at1: 0 } });
    expect(overlap(wall, at({ box: [0, 0, 0, 20, 20, 20], bottom: { axis: 'z', at0: 16, at1: 0 } }))).toBe(false);
    expect(overlap(wall, at({ box: [0, -1, 0, 20, 20, 20], bottom: { axis: 'z', at0: 15, at1: -1 } }))).toBe(true);
    expect(inside([10, 7.9, 10], wall)).toBe(true);
    expect(inside([10, 8.2, 10], wall)).toBe(false);
  });
});

/** Every part of every piece made so far (building the house makes the pieces it uses). */
const allParts = () => {
  buildBakery();
  // (A plant's cards are seen from both sides: they have no outside.)
  return Object.values(ELEMENTS).flatMap((e) => e.parts.filter((p) => p.look !== 'card').map((p, k) => ({ e, k, mesh: p.mesh(), look: p.look })));
};

describe('the pieces', () => {
  it('turn every face outward: each triangle\'s winding agrees with its shading normals', () => {
    const bad: string[] = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    for (const { e, k, mesh } of allParts()) {
      const P = mesh.pos, N = mesh.nor;
      for (let t = 0; t < mesh.idx.length; t += 3) {
        const [i, j, l] = [mesh.idx[t], mesh.idx[t + 1], mesh.idx[t + 2]];
        a.fromArray(P, i * 3);
        b.fromArray(P, j * 3).sub(a);
        c.fromArray(P, l * 3).sub(a);
        const face = b.cross(c);
        if (face.length() < 1e-6) continue;
        n.fromArray(N, i * 3).add(c.fromArray(N, j * 3)).add(c.fromArray(N, l * 3));
        if (face.dot(n) < 0) bad.push(`${e.id}#${k} at ${a.toArray().map((v) => v.toFixed(1))}`);
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('stay, at every turn, inside the space they claim (so claims that never overlap mean shapes that never clip)', () => {
    buildBakery();
    const out: string[] = [];
    for (const e of Object.values(ELEMENTS)) for (const rot of [0, 1, 2, 3] as Rot[]) {
      const b = new KitBuild(), p = b.place(e, 10, 0, 10, 0xffffff, { rot });
      const hulls = b.hullsOf(p), [ox, oy, oz] = b.origin(p);
      // (Glass is seated a hair into its frame.)
      const slack = 0.06;
      for (const part of e.parts) {
        if (part.look === 'glass') continue;
        const P = part.mesh().pos;
        for (let i = 0; i < P.length; i += 3) {
          const [x, z] = turn(P[i], P[i + 2], rot), w: P3 = [ox + x, oy + P[i + 1], oz + z];
          if (!hulls.some((h) => inside(w, h, slack))) {
            out.push(`${e.id} turned ${rot} at ${P[i].toFixed(1)}, ${P[i + 1].toFixed(1)}, ${P[i + 2].toFixed(1)}`);
            break;
          }
        }
      }
    }
    expect([...new Set(out)].slice(0, 12)).toEqual([]);
  });

  it('stand within their footprint unless they hang outside it on purpose', () => {
    buildBakery();
    const outside = /^(sill|shutter|windowBox|signBracket|sign|doors|counter|chimneyCap|chimneyPot|ridge|stool|barrel|sack|candle|pot|lamp|tiles|barge|wardrobe|chest)/;
    for (const e of Object.values(ELEMENTS)) {
      if (outside.test(e.id)) continue;
      for (const { box: [x0, y0, z0, x1, y1, z1] } of e.claims) {
        expect(x0 >= -e.w * 10 && x1 <= e.w * 10 && z0 >= -e.d * 10 && z1 <= e.d * 10, e.id).toBe(true);
        expect(y0 >= 0 && y1 <= e.h * STEP_U + 1e-9, e.id).toBe(true);
      }
    }
  });
});

/** Every pair of consecutive courses of a line: joint positions they share (none in running bond), and joints seen. */
function shared(b: KitBuild, l: Line, y0: number, n: number, h = 3) {
  let clash = 0, seen = 0;
  for (let k = 0; k + 1 < n; k++) {
    const lo = joints(b, l, y0 + h * k, h), up = joints(b, l, y0 + h * (k + 1), h);
    seen += up.size;
    for (const j of up) if (lo.has(j)) clash++;
  }
  return { clash, seen };
}

describe('building with the kit', () => {
  it('places on the grid only (half steps up allowed), and refuses anything passing through what is there', () => {
    const b = new KitBuild();
    b.place(stoneEl(4), 0, 0, 0, 0);
    expect(() => b.place(stoneEl(2), 3, 0, 0, 0)).toThrow(/passes through/);
    expect(() => b.place(stoneEl(2), 0.5, 0, 1, 0)).toThrow(/off the grid/);
    expect(() => b.place(stoneEl(2), 0, 3.25, 1, 0)).toThrow(/off the grid/);
    b.place(stoneEl(2), 4, 0, 0, 0);
    b.place(stoneEl(4), 2, 3, 0, 0);
    b.place(stoneEl(2), 0, 3.5, 1, 0);
    const t = b.place(stoneEl(4), 10, 0, 0, 0, { rot: 1 });
    expect(b.free(10, 3, 0, 3)).toBe(false);
    expect(b.free(11, 0, 0, 3)).toBe(true);
    expect(t.el.w).toBe(4);
  });

  it('lays a wall in running bond, every joint broken by the course above, every stretch ending on a whole stone', () => {
    const l: Line = { axis: 'x', at: 0, from: 0, to: 31 };
    const b = new KitBuild();
    for (let k = 0; k < 8; k++) course(b, l, k * 3, { sizes: [2, 3, 4, 1], piece: (n) => stoneEl(n), color: 0, part: 'w', rot: 0, parity: k % 2, cost: (n) => (n === 1 ? 2.5 : 0) });
    expect(shared(b, l, 0, 8)).toMatchObject({ clash: 0 });
    expect(shared(b, l, 0, 8).seen).toBeGreaterThan(40);
    for (let k = 0; k < 8; k++) for (let x = 0; x < 31; x++) expect(b.free(x, 0, k * 3, k * 3 + 3)).toBe(false);
  });
});

describe('the bakery', () => {
  const b = buildBakery();
  const hulls = b.items.map((p) => b.claimed(p));

  it('is all on the grid and nothing in it passes through anything else', () => {
    expect(b.items.length).toBeGreaterThan(600);
    const cells = new Map<string, number[]>();
    hulls.forEach((hs, i) => {
      for (const h of hs) for (let x = Math.floor(h.lo[0] / CELL_U); x <= Math.floor((h.hi[0] - 0.1) / CELL_U); x++) for (let z = Math.floor(h.lo[2] / CELL_U); z <= Math.floor((h.hi[2] - 0.1) / CELL_U); z++) {
        const k = `${x},${z}`;
        const list = cells.get(k);
        if (list) { if (!list.includes(i)) list.push(i); } else cells.set(k, [i]);
      }
    });
    const clashes = new Set<string>();
    for (const list of cells.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      if (hulls[list[i]].some((a) => hulls[list[j]].some((c) => overlap(a, c)))) clashes.add(`${b.items[list[i]].el.id} / ${b.items[list[j]].el.id}`);
    }
    expect([...clashes]).toEqual([]);
  });

  it('breaks every joint of the stone walls on the course above, the plinth\'s included', () => {
    const { x0, z0, x1, z1 } = HOUSE;
    const lines: Line[] = [
      { axis: 'x', at: z1 - 1, from: x0, to: x1 }, { axis: 'x', at: z0, from: x0, to: x1 },
      { axis: 'z', at: x0, from: z0, to: z1 }, { axis: 'z', at: x1 - 1, from: z0, to: z1 },
    ];
    let clash = 0, seen = 0;
    for (const l of lines) {
      const s = shared(b, l, 0, 8);
      clash += s.clash;
      seen += s.seen;
    }
    expect(seen).toBeGreaterThan(120);
    expect(clash).toBe(0);
  });

  /** A placed claim grown a hair all round: what overlaps it touches the claim (shares a face with it, within a hair). */
  const grow = (h: Hull): Hull => {
    const m: P3 = [(h.lo[0] + h.hi[0]) / 2, (h.lo[1] + h.hi[1]) / 2, (h.lo[2] + h.hi[2]) / 2];
    const v = h.v.map((p) => p.map((q, k) => q + Math.sign(q - m[k]) * 0.35) as P3);
    return { v, lo: h.lo.map((q) => q - 0.35) as P3, hi: h.hi.map((q) => q + 0.35) as P3 };
  };

  /**
   * The pieces (of those `shown`) not held to the ground: stone and floors must rest on what is under
   * them; timbers, panels, frames, tiles and what hangs on a wall are held by whatever they touch.
   */
  const loose = (shown: (p: Placed) => boolean) => {
    const root = b.items.map((_, i) => i);
    const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i])));
    const list = b.items.filter(shown);
    for (const p of list) {
      const below = p.el.kind === 'stone' || p.el.kind === 'floor';
      const lo = Math.min(...hulls[p.i].map((h) => h.lo[1]));
      for (const h of hulls[p.i]) for (const q of b.hits(grow(h), p)) {
        if (!shown(q)) continue;
        if (below && Math.max(...hulls[q.i].map((c) => c.hi[1])) > lo + 0.5) continue;
        root[find(p.i)] = find(q.i);
      }
    }
    const grounded = new Set(list.filter((p) => p.y === 0).map((p) => find(p.i)));
    return list.filter((p) => !grounded.has(find(p.i))).map((p) => `${p.el.id} at ${p.x}, ${p.y}, ${p.z}`);
  };

  it('holds together: every piece rests on, or is framed into, pieces held to the ground', () => {
    expect(loose(() => true)).toEqual([]);
  });

  it('has ceilings well over the hero on both floors', () => {
    expect((H.wallTop - H.walk) * STEP).toBeGreaterThan(HERO_H + 1);
    expect((H.plate - H.upperWalk) * STEP).toBeGreaterThan(HERO_H + 0.6);
  });

  it('climbs by a stair with sensible steps that fits him and leads to the upper floor', () => {
    const riser = RISE * STEP;
    expect(riser).toBeLessThan(0.3);
    expect(Math.atan2(riser, CELL) * (180 / Math.PI)).toBeLessThan(35);
    expect((STAIR.z1 - STAIR.z0) * CELL).toBeGreaterThan(HERO_W_PLATE + 0.1);
    expect(treadTop(STAIR.foot) - H.walk).toBe(RISE);
    // The last riser lands on the upper floor, and the floor is there beyond it.
    expect(treadTop(STAIR.top - 1) + RISE).toBe(H.upperWalk);
    expect(b.free(STAIR.top, STAIR.z0, H.frameTop, H.upperWalk)).toBe(false);
    // Headroom over every tread, to whatever stands over it.
    for (let x = STAIR.foot; x < STAIR.top; x++) for (let z = STAIR.z0; z < STAIR.z1 - 1; z++) {
      let y = treadTop(x);
      while (y < 120 && b.free(x, z, y, y + 0.5)) y += 0.5;
      expect((y - treadTop(x)) * STEP, `headroom over the tread at ${x}, ${z}`).toBeGreaterThan(HERO_H + 0.3);
    }
  });

  /** Where the hero can stand on a floor: a square as wide as he is in plate, clear from the floor to over his head (the doors swing out of his way). */
  const S = u(HERO_W_PLATE);
  const walkable = (walk: number) => (x: number, z: number) => {
    const top = walk + Math.ceil(u(HERO_H + 0.1) / STEP_U);
    return b.hits([x * CELL_U + 0.5, walk * STEP_U + 0.5, z * CELL_U + 0.5, x * CELL_U + S, top * STEP_U, z * CELL_U + S]).every((p) => p.el.kind === 'door' || p.el.id.startsWith('rug'));
  };
  const reach = (ok: (x: number, z: number) => boolean, from: [number, number], to: [number, number]) => {
    const seen = new Set([from.join()]), queue = [from];
    while (queue.length) {
      const [x, z] = queue.shift()!;
      if (x === to[0] && z === to[1]) return true;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n: [number, number] = [x + dx, z + dz];
        const inHouse = n[0] > HOUSE.x0 && n[1] > HOUSE.z0 && n[0] + S / CELL_U <= HOUSE.x1 - 1 && n[1] + S / CELL_U <= HOUSE.z1 - 1;
        if (!seen.has(n.join()) && inHouse && ok(...n)) {
          seen.add(n.join());
          queue.push(n);
        }
      }
    }
    return false;
  };

  it('leaves the hero room to walk from the door to the stair\'s foot, to the oven and behind the counter, and round the room upstairs', () => {
    const ground = walkable(H.walk), upper = walkable(H.upperWalk);
    const inside0: [number, number] = [DOOR.x, HOUSE.z1 - 5];
    expect(ground(...inside0)).toBe(true);
    expect(reach(ground, inside0, [STAIR.foot - 3, STAIR.z1])).toBe(true);
    expect(reach(ground, inside0, [OVEN.x, OVEN.z1])).toBe(true);
    const landing: [number, number] = [STAIR.top, STAIR.z0];
    expect(upper(...landing)).toBe(true);
    expect(reach(upper, landing, [8, 6])).toBe(true);
    expect(reach(upper, landing, [18, 12])).toBe(true);
  });

  it('keeps the space before the oven\'s mouth open, the fire inside it', () => {
    for (let x = OVEN.x + 2; x < OVEN.x + 4; x++) for (let z = OVEN.z1; z < OVEN.z1 + 3; z++) expect(b.free(x, z, OVEN.floor, OVEN.floor + 4), `${x}, ${z}`).toBe(true);
    expect(b.items.some((p) => p.el.id.startsWith('fire') && p.z < OVEN.z1 && p.x >= OVEN.x)).toBe(true);
  });

  it('cuts away by whole courses: no wall piece on the camera side straddles its stub', () => {
    for (const p of b.items) {
      if (!['stone', 'beam', 'post', 'panel'].includes(p.el.kind)) continue;
      const stub = p.part === 'gS' ? HOUSE.stubGround : p.part === 'uS' ? HOUSE.stubUpper : null;
      if (stub !== null) expect(p.y < stub && p.y + p.el.h > stub, `${p.el.id} at ${p.x}, ${p.y}, ${p.z}`).toBe(false);
    }
  });

  it('leaves nothing floating in either cut-away: everything shown is held to the ground by what is shown', () => {
    for (const cut of ['ground', 'upper'] as Cut[]) {
      const shown = (p: Placed) => standsIn(cut, p.part, p.y, p.el.h);
      expect(loose(shown), cut).toEqual([]);
      expect(b.items.some((p) => p.part === 'roof' && shown(p))).toBe(false);
      if (cut === 'ground') expect(b.items.some((p) => p.part.startsWith('u') && shown(p))).toBe(false);
    }
  });

  it('roofs its gables exactly: under the roof there is gable, just over it there is roof, all along both gables', () => {
    for (const x of [HOUSE.x0, HOUSE.x1 - 1]) for (let z = HOUSE.z0 + 0.5; z < HOUSE.z1; z += 1) {
      const y = plane(z) * STEP_U, wx = (x + 0.5) * CELL_U, wz = z * CELL_U;
      const under = b.solidAt([wx, y - 0.6, wz]), over = b.solidAt([wx, y + 0.6, wz]);
      expect(under && under.part === 'roof' && under.el.kind !== 'tile', `under the roof at ${x}, ${z}`).toBe(true);
      expect(over && over.el.kind === 'tile', `the roof over ${x}, ${z}`).toBe(true);
    }
  });

  it('stands its chimney above the ridge', () => {
    expect(CHIMNEY_TOP).toBeGreaterThan(APEX + 3);
  });
});

/** A JPEG's size from its start-of-frame marker. */
function jpegSize(file: string): [number, number] {
  const d = fs.readFileSync(file);
  for (let i = 2; i < d.length;) {
    const marker = d[i + 1], len = d.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return [d.readUInt16BE(i + 7), d.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  throw new Error(`no frame in ${file}`);
}

describe('the kit\'s surfaces', () => {
  const dir = path.join(__dirname, '..', 'public', 'textures', 'kit');
  it('are one strip of square layers per map, a layer for every surface, small enough to keep', () => {
    for (const f of ['surfaces.jpg', 'surfaces-normal.jpg']) {
      const [w, h] = jpegSize(path.join(dir, f));
      expect(w).toBe(h * LAYERS.length);
      expect(fs.statSync(path.join(dir, f)).size).toBeLessThan(800 * 1024);
    }
  });
  it('list every layer\'s source and licence', () => {
    const text = fs.readFileSync(path.join(dir, 'LICENSES.md'), 'utf8');
    for (const l of LAYERS) expect(text, l).toMatch(new RegExp(`\\| ${l} \\|`));
  });
});
