import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BrickBuild, overlaps, turn, type Placed } from '../src/world/brick/build';
import { ELEMENTS, type Box } from '../src/world/brick/elements';
import { buildTownhouse, DOOR, H, HOUSE, inWell, STAIR, standsIn, type Cut } from '../src/world/brick/house';
import { treadTop } from '../src/world/brick/houseInside';
import { BRICK, HERO_H, LDU, PLATE, STUD, type Rot } from '../src/world/brick/scale';
import { stud } from '../src/world/brick/shapes';
import { DOOR_OPENING } from '../src/world/brick/shapesOpen';
import { course, joints, masonryBricks, plainBricks, type Line } from '../src/world/brick/walls';

/** The hero: 2.15 m tall bare-headed, 1.37 m across his shoulders with the outfit's pauldron (as measured in the game). */
const HERO_W = 1.37;
const ldu = (m: number) => m / LDU;

describe('the brick kit\'s scale', () => {
  it('is the real system\'s, at the hero\'s size: a brick 9.6 mm high, a stud pitch 8 mm, a stud Ø 4.8 mm and 1.7 mm tall', () => {
    expect(STUD / BRICK).toBeCloseTo(5 / 6, 6);
    // A minifigure is about four bricks tall without a hat; so is the hero.
    expect(HERO_H / BRICK).toBeGreaterThan(3.9);
    expect(HERO_H / BRICK).toBeLessThan(4.1);
    // The shapes themselves: a 1 × 1 brick, a plate, a stud.
    const [lo, hi] = ELEMENTS.brick1x1.parts[0].mesh().bounds();
    expect((hi.y - lo.y) * LDU).toBeCloseTo(BRICK, 6);
    expect((hi.x - lo.x) * LDU).toBeCloseTo(STUD - 0.2 * 0.05625, 6);
    const [pl, ph] = ELEMENTS.plate1x1.parts[0].mesh().bounds();
    expect((ph.y - pl.y) * LDU).toBeCloseTo(PLATE, 6);
    const [sl, sh] = stud().bounds();
    expect((sh.x - sl.x) * LDU).toBeCloseTo(0.27, 3);
    expect(sh.y * LDU).toBeCloseTo(1.7 * 0.05625, 3);
  });

  it('has a door the hero walks through with room over his head and either side', () => {
    const clearH = (DOOR_OPENING.y1 - DOOR_OPENING.y0) * LDU, clearW = (DOOR_OPENING.x1 - DOOR_OPENING.x0) * LDU;
    expect(clearH).toBeGreaterThan(HERO_H + 0.6);
    expect(clearW).toBeGreaterThan(HERO_W + 0.12);
  });
});

/** Every part of every element, with its id. */
const allParts = () => Object.values(ELEMENTS).flatMap((e) => e.parts.map((p, k) => ({ e, k, mesh: p.mesh() })));

describe('the elements', () => {
  it('turn every face outward: each triangle\'s winding agrees with its shading normals', () => {
    const bad: string[] = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    for (const { e, k, mesh } of [...allParts(), { e: { id: 'stud' }, k: 0, mesh: stud() }]) {
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
    expect(bad).toEqual([]);
  });

  it('stay, at every turn, inside the space they claim (so space that never overlaps means shapes that never clip)', () => {
    const out: string[] = [];
    for (const e of Object.values(ELEMENTS)) for (const rot of [0, 1, 2, 3] as Rot[]) {
      const b = new BrickBuild(), p = b.place(e.id, 10, 0, 10, 'red', { rot });
      const space = b.boxesOf(p), [ox, oy, oz] = b.origin(p);
      const lo = [0, 1, 2].map((k) => Math.min(...space.map((q) => q[k]))), hi = [3, 4, 5].map((k) => Math.max(...space.map((q) => q[k])));
      // (Glass is seated a hair into its frame's groove.)
      const slack = e.kind === 'pane' ? 1.1 : 0.05;
      for (const part of e.parts) {
        const P = part.mesh().pos;
        for (let i = 0; i < P.length; i += 3) {
          const [x, z] = turn(P[i], P[i + 2], rot), w = [ox + x, oy + P[i + 1], oz + z];
          if (w.some((v, k) => v < lo[k] - slack || v > hi[k] + slack)) {
            out.push(`${e.id} turned ${rot}`);
            break;
          }
        }
      }
    }
    expect([...new Set(out)]).toEqual([]);
  });

  it('stand within their footprint and height unless they hang outside it on purpose', () => {
    const outside = new Set(['shutter1x2', 'shutter1x3', 'signBracket', 'door1x4x6', 'leaves4x3', 'signBoard3x2']);
    for (const e of Object.values(ELEMENTS)) {
      if (outside.has(e.id)) continue;
      for (const [x0, y0, z0, x1, y1, z1] of e.boxes) {
        expect(x0 >= -e.w * 10 && x1 <= e.w * 10 && z0 >= -e.d * 10 && z1 <= e.d * 10, e.id).toBe(true);
        expect(y0 >= 0 && y1 <= e.h * 8 + 1e-9, e.id).toBe(true);
      }
    }
  });
});

/** Every pair of consecutive courses of a line: joint positions they share (none in running bond), and joints seen. */
function shared(b: BrickBuild, l: Line, y0: number, n: number, h = 3) {
  let clash = 0, seen = 0;
  for (let k = 0; k + 1 < n; k++) {
    const lo = joints(b, l, y0 + h * k, h), up = joints(b, l, y0 + h * (k + 1), h);
    seen += up.size;
    for (const j of up) if (lo.has(j)) clash++;
  }
  return { clash, seen };
}

describe('building with the kit', () => {
  it('places on the grid only, and refuses anything passing through what is there', () => {
    const b = new BrickBuild();
    b.place('brick1x4', 0, 0, 0, 'red');
    expect(() => b.place('brick1x2', 3, 0, 0, 'red')).toThrow(/passes through/);
    expect(() => b.place('brick1x2', 0.5, 0, 1, 'red')).toThrow(/off the grid/);
    b.place('brick1x2', 4, 0, 0, 'red');
    b.place('brick1x4', 2, 3, 0, 'red');
    // Turned a quarter, a 1 × 4 runs along z.
    const t = b.place('brick1x4', 10, 0, 0, 'red', { rot: 1 });
    expect(b.free(10, 3, 0, 3)).toBe(false);
    expect(b.free(11, 0, 0, 3)).toBe(true);
    expect(b.boxesOf(t)[0][5] - b.boxesOf(t)[0][2]).toBeCloseTo(80 - 0.5);
  });

  it('covers a stud that something stands on, and only that one', () => {
    const b = new BrickBuild();
    const base = b.place('brick1x4', 0, 0, 0, 'red');
    b.place('plate1x2', 0, 3, 0, 'red');
    const covered = b.studsOf(base).map((s) => !!b.coverOf(s, base));
    expect(covered).toEqual([true, true, false, false]);
  });

  it('lays a wall in running bond, every joint broken by the course above', () => {
    const l: Line = { axis: 'x', at: 0, from: 0, to: 30 };
    const b = new BrickBuild();
    for (let k = 0; k < 8; k++) course(b, l, k * 3, { sizes: [6, 4, 3, 2, 1], id: plainBricks, color: 'tan', part: 'w', rot: 0, parity: k % 2 });
    expect(shared(b, l, 0, 8)).toMatchObject({ clash: 0 });
    expect(shared(b, l, 0, 8).seen).toBeGreaterThan(20);
    // Masonry too, from 1 × 2 and 1 × 4 masonry bricks.
    const m = new BrickBuild();
    for (let k = 0; k < 8; k++) course(m, l, k * 3, { sizes: [4, 2, 1], id: masonryBricks, color: 'tan', part: 'w', rot: 0, cost: (n) => (n === 1 ? 2 : 0) });
    expect(shared(m, l, 0, 8)).toMatchObject({ clash: 0 });
    expect(shared(m, l, 0, 8).seen).toBeGreaterThan(20);
  });

  it('breaks the joints round an opening and against pieces already set, and between courses of plates', () => {
    const b = new BrickBuild(), l: Line = { axis: 'z', at: 4, from: 0, to: 20 };
    b.place('window1x2x3', 4, 3, 7, 'white', { rot: 1 });
    b.place('brick1x6', 4, 12, 6, 'darkGrey', { rot: 1 });
    for (let k = 0; k < 7; k++) course(b, l, k * 3, { sizes: [6, 4, 3, 2, 1], id: plainBricks, color: 'white', part: 'w', rot: 1 });
    expect(shared(b, l, 0, 7)).toMatchObject({ clash: 0 });
    expect(shared(b, l, 0, 7).seen).toBeGreaterThan(5);
    for (let z = 0; z < 20; z++) for (let y = 0; y < 21; y++) expect(b.free(4, z, y, y + 1)).toBe(false);
    const p = new BrickBuild(), pl: Line = { axis: 'x', at: 0, from: 0, to: 24 };
    for (let k = 0; k < 6; k++) course(p, pl, k, { sizes: [6, 4, 3, 2, 1], id: (n) => `plate1x${n}`, color: 'tan', part: 'p', rot: 0, h: 1 });
    expect(shared(p, pl, 0, 6, 1)).toMatchObject({ clash: 0 });
    expect(shared(p, pl, 0, 6, 1).seen).toBeGreaterThan(10);
  });
});

/** Pieces that hang on clips and hinges (shutters, the sign and its bracket, the door) or sit in a frame (glass). */
const hung = (p: Placed) => ['shutter1x3', 'signBracket', 'signBoard3x2', 'door1x4x6'].includes(p.el.id) || p.el.kind === 'pane';

/** Does p stand on q, gripping at least one of q's studs? */
function grips(b: BrickBuild, p: Placed, q: Placed) {
  const feet = b.boxesOf(p).filter((f) => Math.abs(f[1] - p.y * 8) < 1e-6);
  return b.studsOf(q).some(([x, y, z]) => Math.abs(y - p.y * 8) < 1e-6 && feet.some((f) => x > f[0] && x < f[3] && z > f[2] && z < f[5]));
}

/** What p stands on: everything touching its foot from below. */
const under = (b: BrickBuild, p: Placed) => b.boxesOf(p).filter((f) => Math.abs(f[1] - p.y * 8) < 1e-6)
  .flatMap(([x0, y, z0, x1, , z1]) => b.hits([x0 + 0.5, y - 1, z0 + 0.5, x1 - 0.5, y - 0.01, z1 - 0.5], p));

describe('the hub-town house', () => {
  const b = buildTownhouse();

  it('is all on the grid and nothing in it passes through anything else', () => {
    expect(b.items.length).toBeGreaterThan(800);
    for (const p of b.items) expect([p.x, p.y, p.z].every(Number.isInteger)).toBe(true);
    // (Every pair checked again by brute force over the stud columns, apart from the checks made while building.)
    const all = b.items.map((p) => ({ p, boxes: b.boxesOf(p) }));
    const cells = new Map<string, Set<number>>();
    all.forEach(({ boxes }, i) => {
      for (const [x0, , z0, x1, , z1] of boxes) for (let x = Math.floor(x0 / 20); x <= Math.floor((x1 - 0.1) / 20); x++) for (let z = Math.floor(z0 / 20); z <= Math.floor((z1 - 0.1) / 20); z++) {
        const k = `${x},${z}`;
        cells.set(k, (cells.get(k) ?? new Set()).add(i));
      }
    });
    const clashes = new Set<string>();
    for (const set of cells.values()) {
      const list = [...set];
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        if (all[list[i]].boxes.some((a) => all[list[j]].boxes.some((c) => overlaps(a, c)))) clashes.add(`${list[i]}:${list[j]}`);
      }
    }
    expect([...clashes]).toEqual([]);
  });

  it('breaks every joint of every wall and gable on the course above', () => {
    const { x0, z0, x1, z1 } = HOUSE;
    const lines: [Line, number, number][] = [];
    for (const [y0, n] of [[H.ground, 7], [H.upper, 6]] as [number, number][]) {
      lines.push([{ axis: 'x', at: z1 - 1, from: x0, to: x1 }, y0, n], [{ axis: 'x', at: z0, from: x0, to: x1 }, y0, n]);
    }
    // The side walls run on up into the gables.
    lines.push([{ axis: 'z', at: x0, from: z0, to: z1 }, H.ground, 7], [{ axis: 'z', at: x1 - 1, from: z0, to: z1 }, H.ground, 7]);
    lines.push([{ axis: 'z', at: x0, from: z0, to: z1 }, H.upper, 14], [{ axis: 'z', at: x1 - 1, from: z0, to: z1 }, H.upper, 14]);
    let clash = 0, seen = 0;
    for (const [l, y0, n] of lines) {
      const s = shared(b, l, y0, n);
      clash += s.clash;
      seen += s.seen;
    }
    expect(seen).toBeGreaterThan(150);
    expect(clash).toBe(0);
  });

  /**
   * The pieces (of those `shown`) not held to the ground: a piece is held to another when it grips one
   * of its studs, so a plate can hang from the tiles laid across it as well as sit on what is under it.
   */
  const loose = (shown: (p: Placed) => boolean) => {
    const root = b.items.map((_, i) => i);
    const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i])));
    const counts = (p: Placed) => shown(p) && !hung(p);
    for (const p of b.items.filter(counts)) for (const q of under(b, p)) if (counts(q) && grips(b, p, q)) root[find(p.i)] = find(q.i);
    const grounded = new Set(b.items.filter((p) => p.y === 0 && counts(p)).map((p) => find(p.i)));
    return b.items.filter((p) => counts(p) && !grounded.has(find(p.i))).map((p) => `${p.el.id} at ${p.x}, ${p.y}, ${p.z}`);
  };

  it('holds together: every piece grips a stud of the pieces round it, all the way down to the ground (hung pieces aside)', () => {
    expect(loose(() => true)).toEqual([]);
  });

  it('has ceilings well over the hero on both floors', () => {
    // Ground floor: from the tiles to the underside of the upper floor's plates.
    expect((H.upperPlate - H.groundWalk) * PLATE).toBeGreaterThan(HERO_H + 1);
    // Upper floor: from the boards to the wall plate under the eaves (the room is open to the roof above).
    expect((H.eaves - H.upperWalk) * PLATE).toBeGreaterThan(HERO_H + 0.6);
  });

  it('climbs by a stair that fits him and leads to the upper floor', () => {
    const riser = 2 * PLATE, going = STUD;
    expect(treadTop(STAIR.foot - 1) - H.groundWalk).toBe(2);
    expect(Math.atan2(riser, going) * (180 / Math.PI)).toBeLessThan(40);
    // Four studs wide: room for the hero's shoulders.
    expect((STAIR.z1 - STAIR.z0) * STUD).toBeGreaterThan(HERO_W + 0.4);
    // The last step lands on the upper floor, and the floor is there beyond it.
    expect(treadTop(STAIR.top) + 2).toBe(H.upperWalk);
    expect(b.free(STAIR.top - 1, STAIR.z0, H.upperPlate, H.upperWalk)).toBe(false);
    expect(inWell(STAIR.top - 1, STAIR.z0)).toBe(false);
    // Headroom over every tread, to whatever stands over it.
    for (let x = STAIR.top; x < STAIR.foot; x++) for (let z = STAIR.z0; z < STAIR.z1; z++) {
      let y = treadTop(x);
      while (y < 200 && b.free(x, z, y, y + 1)) y++;
      expect((y - treadTop(x)) * PLATE, `headroom over the tread at ${x}, ${z}`).toBeGreaterThan(HERO_H + 0.3);
    }
  });

  /**
   * Where the hero can stand on a floor: three studs square (his shoulders' width), clear from the
   * floor to over his head (the door swings out of his way).
   */
  const walkable = (walk: number) => (x: number, z: number) => {
    const top = walk + Math.ceil(ldu(HERO_H + 0.1) / 8);
    const box: Box = [x * 20 + 0.5, walk * 8 + 0.5, z * 20 + 0.5, (x + 3) * 20 - 0.5, top * 8, (z + 3) * 20 - 0.5];
    return b.hits(box).every((p) => p.el.id === 'door1x4x6');
  };
  const reach = (ok: (x: number, z: number) => boolean, from: [number, number], to: [number, number]) => {
    const seen = new Set([from.join()]), queue = [from];
    while (queue.length) {
      const [x, z] = queue.shift()!;
      if (x === to[0] && z === to[1]) return true;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n: [number, number] = [x + dx, z + dz];
        const inside = n[0] > HOUSE.x0 && n[1] > HOUSE.z0 && n[0] + 3 < HOUSE.x1 && n[1] + 3 < HOUSE.z1;
        if (!seen.has(n.join()) && inside && ok(...n)) {
          seen.add(n.join());
          queue.push(n);
        }
      }
    }
    return false;
  };

  it('leaves the hero room to walk from the door to the stair and behind the counter, and round the room upstairs', () => {
    const ground = walkable(H.groundWalk), upper = walkable(H.upperWalk);
    const inside: [number, number] = [DOOR.x + 1, HOUSE.z1 - 4];
    expect(ground(...inside)).toBe(true);
    expect(reach(ground, inside, [STAIR.foot, STAIR.z0 + 1])).toBe(true);
    expect(reach(ground, inside, [3, 6])).toBe(true);
    const landing: [number, number] = [STAIR.top - 3, STAIR.z0 + 1];
    expect(reach(upper, landing, [18, 13])).toBe(true);
    expect(reach(upper, landing, [19, 2])).toBe(true);
  });

  it('cuts away by whole courses: no wall brick on the camera side straddles its stub', () => {
    for (const p of b.items) {
      if (p.el.kind !== 'brick') continue;
      const stub = p.part === 'gS' ? HOUSE.stubGround : p.part === 'uS' ? HOUSE.stubUpper - 1 : null;
      if (stub !== null) expect(p.y < stub && p.y + p.el.h > stub, `${p.el.id} at ${p.x}, ${p.y}, ${p.z}`).toBe(false);
    }
  });

  it('leaves nothing floating in either cut-away: everything shown is held to the ground by what is shown', () => {
    for (const cut of ['ground', 'upper'] as Cut[]) {
      const shown = (p: Placed) => standsIn(cut, p.part, p.y, p.el.h);
      expect(loose(shown), cut).toEqual([]);
      // And the cut does lift the roof (and, on the ground floor, the upper storey).
      expect(b.items.some((p) => p.part === 'roof' && shown(p))).toBe(false);
      if (cut === 'ground') expect(b.items.some((p) => p.part.startsWith('u') && shown(p))).toBe(false);
    }
  });

  it('keeps the door\'s swing clear', () => {
    const door = b.items.find((p) => p.el.id === 'door1x4x6')!;
    expect(door.x).toBe(DOOR.x);
    const swing = b.boxesOf(door)[1];
    expect(b.hits(swing, door)).toEqual([]);
  });
});
