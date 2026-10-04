import { describe, expect, it } from 'vitest';
import { BrickBuild, overlaps } from '../src/world/brick/build';
import { ELEMENTS, type Box } from '../src/world/brick/elements';
import { buildTownhouse, DOOR, H, HOUSE, inWell, STAIR, standsIn } from '../src/world/brick/house';
import { treadTop } from '../src/world/brick/houseInside';
import { BRICK, HERO_H, LDU, PLATE, STUD } from '../src/world/brick/scale';
import { DOOR_OPENING } from '../src/world/brick/shapesOpen';
import { course, joints, masonryBricks, plainBricks, type Line } from '../src/world/brick/walls';

/** The hero: 2.15 m tall bare-headed, 1.37 m across his shoulders with the outfit's pauldron (as measured in the game). */
const HERO_W = 1.37;
const ldu = (m: number) => m / LDU;

describe('the brick kit\'s scale', () => {
  it('keeps the real system\'s proportions at the hero\'s size', () => {
    expect(STUD / BRICK).toBeCloseTo(5 / 6, 6);
    expect(PLATE * 3).toBeCloseTo(BRICK, 6);
    // A minifigure is about four bricks tall without a hat; so is the hero.
    expect(HERO_H / BRICK).toBeGreaterThan(3.9);
    expect(HERO_H / BRICK).toBeLessThan(4.1);
  });

  it('has a door the hero walks through with room over his head', () => {
    const clearH = (DOOR_OPENING.y1 - DOOR_OPENING.y0) * LDU, clearW = (DOOR_OPENING.x1 - DOOR_OPENING.x0) * LDU;
    expect(clearH).toBeGreaterThan(HERO_H + 0.6);
    expect(clearW).toBeGreaterThan(HERO_W + 0.12);
  });
});

describe('the elements', () => {
  it('each stay inside the space they claim (so space that never overlaps means shapes that never clip)', () => {
    for (const e of Object.values(ELEMENTS)) {
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      // (A frame's round head reaches into the opening its glass fills.)
      for (const b of [...e.boxes, ...(e.holds ? [e.holds] : [])]) for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], b[k]);
        hi[k] = Math.max(hi[k], b[k + 3]);
      }
      // (Glass is seated a hair into its frame's groove.)
      const slack = e.kind === 'pane' ? 1.1 : 0.05;
      for (const part of e.parts) {
        const [a, b] = part.mesh().bounds();
        expect([a.x, a.y, a.z].every((v, k) => v >= lo[k] - slack), `${e.id} reaches out of its space`).toBe(true);
        expect([b.x, b.y, b.z].every((v, k) => v <= hi[k] + slack), `${e.id} reaches out of its space`).toBe(true);
      }
    }
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

  /** Every pair of consecutive courses of a line: joint positions they share (none in running bond). */
  const shared = (b: BrickBuild, l: Line, y0: number, n: number) => {
    let clash = 0;
    for (let k = 0; k + 1 < n; k++) {
      const lo = joints(b, l, y0 + 3 * k), up = joints(b, l, y0 + 3 * (k + 1));
      for (const j of up) if (lo.has(j)) clash++;
    }
    return clash;
  };

  it('lays a wall in running bond, every joint broken by the course above', () => {
    const b = new BrickBuild(), l: Line = { axis: 'x', at: 0, from: 0, to: 30 };
    for (let k = 0; k < 8; k++) course(b, l, k * 3, { sizes: [6, 4, 3, 2, 1], id: plainBricks, color: 'tan', part: 'w', rot: 0 });
    expect(shared(b, l, 0, 8)).toBe(0);
    // Masonry too, from 1 × 2 and 1 × 4 masonry bricks.
    const m = new BrickBuild();
    for (let k = 0; k < 8; k++) course(m, l, k * 3, { sizes: [4, 2, 1], id: masonryBricks, color: 'lightGrey', part: 'w', rot: 0, cost: (n) => (n === 1 ? 2 : 0) });
    expect(shared(m, l, 0, 8)).toBe(0);
  });

  it('breaks the joints round an opening and against pieces already set', () => {
    const b = new BrickBuild(), l: Line = { axis: 'z', at: 4, from: 0, to: 20 };
    b.place('window1x2x3', 4, 3, 7, 'white', { rot: 1 });
    b.place('brick1x6', 4, 12, 6, 'darkGrey', { rot: 1 });
    for (let k = 0; k < 7; k++) course(b, l, k * 3, { sizes: [6, 4, 3, 2, 1], id: plainBricks, color: 'white', part: 'w', rot: 1 });
    expect(shared(b, l, 0, 7)).toBe(0);
    for (let z = 0; z < 20; z++) for (let y = 0; y < 21; y++) expect(b.free(4, z, y, y + 1)).toBe(false);
  });
});

describe('the hub-town house', () => {
  const b = buildTownhouse();

  it('is all on the grid and nothing in it passes through anything else', () => {
    expect(b.items.length).toBeGreaterThan(800);
    for (const p of b.items) expect([p.x, p.y, p.z].every(Number.isInteger)).toBe(true);
    // (Checked again pair by pair, independently of the checks made while building.)
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

  it('breaks every joint of every wall, plinth and gable on the course above', () => {
    const { x0, z0, x1, z1 } = HOUSE;
    const lines: [Line, number, number][] = [];
    for (const [y0, n] of [[0, 1], [H.ground, 7], [H.upper, 6]] as [number, number][]) {
      lines.push([{ axis: 'x', at: z1 - 1, from: x0, to: x1 }, y0, n], [{ axis: 'x', at: z0, from: x0, to: x1 }, y0, n]);
      lines.push([{ axis: 'z', at: x0, from: z0, to: z1 }, y0, n], [{ axis: 'z', at: x1 - 1, from: z0, to: z1 }, y0, n]);
    }
    // The gables run on from the walls under them.
    lines.push([{ axis: 'z', at: x0, from: z0, to: z1 }, H.upper, 14], [{ axis: 'z', at: x1 - 1, from: z0, to: z1 }, H.upper, 14]);
    let clash = 0, joined = 0;
    for (const [l, y0, n] of lines) for (let k = 0; k + 1 < n; k++) {
      const lo = joints(b, l, y0 + 3 * k), up = joints(b, l, y0 + 3 * (k + 1));
      joined += up.size;
      for (const j of up) if (lo.has(j)) clash++;
    }
    expect(joined).toBeGreaterThan(150);
    expect(clash).toBe(0);
  });

  it('holds together: every piece is joined, foot to top, to pieces standing on the ground (hung pieces aside)', () => {
    // Hung pieces hang on clips and hinges (shutters, the sign and its bracket, the door) or sit in a frame (glass).
    const hung = (id: string) => ['shutter1x3', 'signBracket', 'signBoard3x2', 'door1x4x6'].includes(id) || ELEMENTS[id].kind === 'pane';
    const root = b.items.map((_, i) => i), GROUND = -1;
    const find = (i: number): number => (i === GROUND || root[i] === i ? i : (root[i] = find(root[i])));
    const ground = new Set<number>();
    const join = (i: number, j: number) => {
      const a = find(i), c = find(j);
      if (a !== c) root[a] = c;
    };
    for (const p of b.items) {
      if (hung(p.el.id)) continue;
      if (p.y === 0) ground.add(p.i);
      for (const [x0, y, z0, x1, , z1] of b.boxesOf(p).filter((q) => Math.abs(q[1] - p.y * 8) < 1e-6)) {
        for (const q of b.hits([x0 + 0.5, y - 1, z0 + 0.5, x1 - 0.5, y - 0.01, z1 - 0.5], p)) if (!hung(q.el.id)) join(p.i, q.i);
      }
    }
    const grounded = new Set([...ground].map(find));
    const loose = b.items.filter((p) => !hung(p.el.id) && !grounded.has(find(p.i))).map((p) => `${p.el.id} at ${p.x}, ${p.y}, ${p.z}`);
    expect(loose).toEqual([]);
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
   * Cells the hero can stand in on a floor: two studs square, clear from the floor to over his head
   * (the door swings out of his way).
   */
  const walkable = (walk: number) => (x: number, z: number) => {
    const top = walk + Math.ceil(ldu(HERO_H + 0.1) / 8);
    const box: Box = [x * 20 + 0.5, walk * 8 + 0.5, z * 20 + 0.5, (x + 2) * 20 - 0.5, top * 8, (z + 2) * 20 - 0.5];
    return b.hits(box).every((p) => p.el.id === 'door1x4x6');
  };
  const reach = (ok: (x: number, z: number) => boolean, from: [number, number], to: [number, number]) => {
    const seen = new Set([from.join()]), queue = [from];
    while (queue.length) {
      const [x, z] = queue.shift()!;
      if (x === to[0] && z === to[1]) return true;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n: [number, number] = [x + dx, z + dz];
        if (!seen.has(n.join()) && n[0] >= 1 && n[1] >= 1 && n[0] < 22 && n[1] < 16 && ok(...n)) {
          seen.add(n.join());
          queue.push(n);
        }
      }
    }
    return false;
  };

  it('leaves the hero room to walk from the door to the stair, and round the room upstairs', () => {
    const ground = walkable(H.groundWalk), upper = walkable(H.upperWalk);
    expect(ground(DOOR.x + 1, HOUSE.z1 - 3)).toBe(true);
    expect(reach(ground, [DOOR.x + 1, HOUSE.z1 - 3], [STAIR.foot, STAIR.z0 + 1])).toBe(true);
    expect(reach(ground, [DOOR.x + 1, HOUSE.z1 - 3], [3, 7])).toBe(true);
    expect(reach(upper, [STAIR.top - 2, STAIR.z0 + 1], [18, 13])).toBe(true);
    expect(reach(upper, [STAIR.top - 2, STAIR.z0 + 1], [19, 3])).toBe(true);
  });

  it('cuts away by whole courses: inside, nothing on the camera side stands over the stub', () => {
    for (const p of b.items) {
      if (p.part === 'gS' && standsIn('ground', p.part, p.y, p.el.h)) expect(p.y + p.el.h).toBeLessThanOrEqual(HOUSE.stubGround);
      if (p.part.startsWith('u') && p.part !== 'u.floor') expect(standsIn('ground', p.part, p.y, p.el.h)).toBe(false);
      if (p.part === 'roof') expect(standsIn('upper', p.part, p.y, p.el.h)).toBe(false);
    }
  });

  it('keeps the door\'s swing clear', () => {
    const door = b.items.find((p) => p.el.id === 'door1x4x6')!;
    expect(door.x).toBe(DOOR.x);
    const swing = b.boxesOf(door)[1] as Box;
    expect(b.hits(swing, door)).toEqual([]);
  });
});
