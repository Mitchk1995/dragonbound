import { COMBAT_TUNING } from '../../data/tuning';
import type { Vec2 } from '../../types';
import { Gen } from '../../world/gen';
import { Cell, Ground, lawnCell, type ZoneLayout } from '../../world/layout';
import { CELL } from '../../world/kit/scale';

/**
 * The hub town's layout options (dev only): three in-game blockouts of the town on the ground below
 * the castle, for the owner to pick one before any of its buildings is made. Each is a test lot of
 * real ground (grass, paving, water, the castle's rock) with the finished kit house standing in for
 * the town's houses, the stations as plain volumes at true size on the kit's grid, the castle as a
 * plain volume on its rock, and the stair up to it. This file holds what the three share: the lot,
 * the rock, the castle and its stair, and the rules for placing buildings; optionA–C.ts lay the towns.
 *
 * Coordinates are metres on the lot (1 cell of the walk grid = 1 m), x east, z south (toward the
 * camera); the castle stands on its rock at the north edge. Buildings sit on the kit's 0.45 m grid.
 */

/** The lot: wide enough that the view straight down sees only ground. */
export const LOT = { w: 380, h: 250 } as const;
/** The town's north–south axis (the castle's gate lines up on it). */
export const CX = 190;
/** The hero's run speed (m/s) before movement-speed gear. */
export const RUN = COMBAT_TUNING.hero.moveSpeed;
/** The castle rock's height over the ground at its foot, and the stair's rise per step and going per tread. */
export const ROCK = 11;
export const RISER = 0.27, TREAD = 0.45;
/** Risers from the foot of the castle stair to the top of the rock (41 × 0.27 m = 11.07 m). */
export const RISERS = 41;

export type Face = 'S' | 'E' | 'N' | 'W';
/** The direction each face looks (unit x, z). */
export const OUTWARD: Record<Face, Vec2> = { S: { x: 0, z: 1 }, E: { x: 1, z: 0 }, N: { x: 0, z: -1 }, W: { x: -1, z: 0 } };
/** The quarter turns that face a kit piece's front (+z) to each side. */
export const TURN: Record<Face, 0 | 1 | 2 | 3> = { S: 0, E: 1, N: 2, W: 3 };

/** A footprint (metres, its corners on the kit's grid). */
export interface Box { x0: number; z0: number; x1: number; z1: number }

/** A station's building as a plain kit volume: walls and roof at true size, its door on `face`. */
export interface Mass {
  box: Box;
  face: Face;
  /** Wall height (m, whole courses). */
  wall: number;
  roof: 'gable' | 'hip';
  walls: 'stone' | 'plaster';
  tiles: 'clay' | 'slate';
  chimney?: boolean;
}

/** One of the town's houses: the finished kit house (the bakery), its front to `face`. */
export interface House { box: Box; face: Face }

/** A labelled place: a station's use point, an exit, the castle, the stair. */
export interface Spot {
  id: string;
  label: string;
  /** Where the hero stands to use it (the walk times run between these). */
  at: Vec2;
  /** Where its label hangs, if not over `at`. */
  tag?: Vec2;
  kind: 'station' | 'exit' | 'castle';
}

/** One leg of the castle stair, going up: a flight of risers, a level landing, or a turn on a square landing. */
export type Leg = { risers: number } | { landing: number } | { turn: Face };
export interface StairPlan { foot: Vec2; dir: Face; width: number; legs: Leg[] }

/** The town wall (option C): its corners, its gates (centres on the wall line) and towers. */
export interface WallPlan { box: Box; gates: Vec2[]; towers: (Vec2 & { s: number })[] }

export interface HubPlan {
  id: 'a' | 'b' | 'c';
  name: string;
  idea: string;
  layout: ZoneLayout;
  masses: Mass[];
  houses: House[];
  /** The house shown with its name (the finished kit house). */
  bakery: number;
  spots: Spot[];
  stair: StairPlan;
  wall?: WallPlan;
  /** Where the hero stands for the play camera. */
  heart: Vec2;
  /** The street view: the hero's eye (over the ground there) and where he looks (height over the ground under it). */
  street: { eye: Vec2; look: Vec2 & { y: number } };
  /** The walks timed (spot ids), the busiest loop first. */
  routes: [string, string][];
}

export const snap = (m: number) => Math.round(m / CELL) * CELL;
/** A footprint from its corner (snapped to the grid) and its size in cells. */
export const cells = (x0: number, z0: number, w: number, d: number): Box => {
  const x = snap(x0), z = snap(z0);
  return { x0: x, z0: z, x1: x + w * CELL, z1: z + d * CELL };
};
/** The middle of a box's `face` side, `out` metres out from it. */
export const door = (b: Box, f: Face, out = 1.6): Vec2 => {
  const o = OUTWARD[f], mx = (b.x0 + b.x1) / 2, mz = (b.z0 + b.z1) / 2;
  return { x: o.x ? (o.x > 0 ? b.x1 : b.x0) + o.x * out : mx, z: o.z ? (o.z > 0 ? b.z1 : b.z0) + o.z * out : mz };
};

/**
 * The finished house's footprint, turned to face `f`: 29 × 22 cells, its front steps, chimney stack
 * and eaves included (its own grid runs from cell -1, -1 of this box; `mid` is the box's middle there).
 */
export const HOUSE_CELLS = { w: 29, d: 22, mid: { x: 13.5, z: 10 } } as const;
export const houseBox = (x0: number, z0: number, f: Face) => (f === 'S' || f === 'N' ? cells(x0, z0, HOUSE_CELLS.w, HOUSE_CELLS.d) : cells(x0, z0, HOUSE_CELLS.d, HOUSE_CELLS.w));

/** The castle (a plain volume on the rock): its curtain wall's box; the gate is in its south wall on CX. */
export const CASTLE: Box = { x0: 166, z0: 6, x1: 214, z1: 34 };

/**
 * A town on the lot: the ground, the rock, its buildings and spots. Each option lays its streets and
 * squares, then its buildings (`mass`, `house`, which refuse a footprint over a street, water or
 * another building), its stations and props, then `finish`.
 */
export class Town {
  readonly G: Gen;
  readonly masses: Mass[] = [];
  readonly houses: House[] = [];
  readonly spots: Spot[] = [];
  stairPlan: StairPlan | null = null;
  wallPlan: WallPlan | undefined;
  /** The house shown with its name (the finished kit house), by its index. */
  bakery = -1;
  private readonly taken: Box[] = [];

  constructor(seed: number, level?: (z: number) => number) {
    this.G = new Gen(LOT.w, LOT.h, seed, Cell.Ground, Ground.Grass);
    if (level) {
      const L = (this.G.l.level = new Float32Array(LOT.w * LOT.h));
      for (let z = 0; z < LOT.h; z++) L.fill(level(z + 0.5), z * LOT.w, (z + 1) * LOT.w);
    }
    this.rock();
  }

  /** The castle's rock along the north edge: dark cliffs 11 m high, lower shoulders either side. */
  private rock() {
    const G = this.G;
    for (const [x, z, r] of [[118, 10, 26], [262, 10, 26], [80, 4, 22], [300, 4, 22]]) G.plateau(x, z, r, ROCK * 0.62, 2.5);
    for (const [x, z, r] of [[CX, 18, 31], [CX - 25, 16, 23], [CX + 25, 16, 23], [CX - 44, 10, 16], [CX + 44, 10, 16]]) G.plateau(x, z, r, ROCK, 1.6);
  }

  /** A street (paved in town, a dirt road beyond); `hw` its half width. */
  street(pts: Vec2[], width: number, ground = Ground.Stone) {
    return this.G.road(pts, width, ground, 0.15);
  }

  /** Is a footprint clear: inside the lot, off the streets, squares and water, and clear of every building? */
  free(b: Box, margin = 0.45) {
    for (const t of this.taken) if (b.x0 < t.x1 + margin && b.x1 > t.x0 - margin && b.z0 < t.z1 + margin && b.z1 > t.z0 - margin) return false;
    const G = this.G;
    for (let z = Math.floor(b.z0); z < Math.ceil(b.z1); z++) for (let x = Math.floor(b.x0); x < Math.ceil(b.x1); x++) {
      if (!G.inside(x, z)) return false;
      const i = G.idx(x, z);
      if (G.l.ground[i] === Ground.Stone || G.l.ground[i] === Ground.Path || G.l.fluid[i] || G.l.cells[i] !== Cell.Ground) return false;
    }
    return true;
  }

  /** Stamps a footprint: blocked to walking, clear of trees round it. */
  private claim(b: Box) {
    const G = this.G;
    this.taken.push(b);
    for (let z = Math.floor(b.z0) - 2; z < Math.ceil(b.z1) + 2; z++) for (let x = Math.floor(b.x0) - 2; x < Math.ceil(b.x1) + 2; x++) {
      if (!G.inside(x, z)) continue;
      const i = G.idx(x, z), inBox = x + 0.5 > b.x0 && x + 0.5 < b.x1 && z + 0.5 > b.z0 && z + 0.5 < b.z1;
      if (inBox) {
        G.l.cells[i] = Cell.Blocked;
        G.reserved[i] = 1;
      } else if (G.reserved[i] === 0 || G.reserved[i] === 2) G.reserved[i] = 3;
    }
  }

  /** A station's building (throws if it does not fit: the plan is wrong). */
  mass(m: Mass) {
    if (!this.free(m.box)) throw new Error(`hub layout: a ${m.walls} building at ${m.box.x0}, ${m.box.z0} does not fit`);
    this.claim(m.box);
    this.masses.push(m);
    return m;
  }

  /** A house, if it fits (rows of houses are offered along a street and take what fits). */
  house(x0: number, z0: number, f: Face) {
    const box = houseBox(x0, z0, f);
    if (!this.free(box)) return null;
    this.claim(box);
    this.houses.push({ box, face: f });
    return box;
  }

  /** The house named on the pictures: the finished kit house itself (a bakery). */
  bakeryHouse(x0: number, z0: number, f: Face) {
    if (!this.house(x0, z0, f)) throw new Error(`hub layout: the bakery at ${x0}, ${z0} does not fit`);
    this.bakery = this.houses.length - 1;
  }

  /** Houses along a line, each `step` metres on from the last, their fronts to `f`: as many as fit. */
  row(x0: number, z0: number, f: Face, n: number, gap = 0.9) {
    const along = f === 'S' || f === 'N' ? { x: HOUSE_CELLS.w * CELL + gap, z: 0 } : { x: 0, z: HOUSE_CELLS.w * CELL + gap };
    for (let k = 0; k < n; k++) this.house(x0 + along.x * k, z0 + along.z * k, f);
  }

  /**
   * Houses fronting a street, packed along it from `from` to `to` (metres along it): their fronts
   * `setback` metres back from the street's edge `edge` (its z for fronts facing N or S, its x for E or W).
   */
  frontage(f: Face, edge: number, from: number, to: number, setback = 0.9) {
    const w = HOUSE_CELLS.w * CELL, d = HOUSE_CELLS.d * CELL;
    for (let a = from; a + w <= to;) {
      const x0 = f === 'S' || f === 'N' ? a : f === 'E' ? edge - setback - d : edge + setback;
      const z0 = f === 'E' || f === 'W' ? a : f === 'S' ? edge - setback - d : edge + setback;
      a += this.house(snap(x0), snap(z0), f) ? w + 0.9 : CELL;
    }
  }

  spot(s: Spot) {
    this.spots.push(s);
    return s;
  }

  prop(kind: string, x: number, z: number, rot = 0, block = 0.9, len?: number) {
    this.G.reserve(x, z, block + 0.5);
    const p = this.G.prop(kind, x, z, rot, 1, block);
    if (len !== undefined) p.len = len;
    return p;
  }

  /** A ring of four lit portals round (x, z), each facing the middle. */
  portals(x: number, z: number, r = 6.5) {
    const colours = [0x5a8aff, 0xff6a2a, 0x6ad0c0, 0xffb050];
    colours.forEach((c, k) => {
      const a = Math.PI / 4 + (k * Math.PI) / 2, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
      this.prop('portal', px, pz, a + Math.PI, 1.6, c);
    });
  }

  /**
   * The town wall: 2.7 m thick inside `box`'s edges, open at each gate (9 m), its towers 7.2 m square
   * on its line; all blocked to walking.
   */
  wall(w: WallPlan) {
    this.wallPlan = w;
    const G = this.G, { box: b } = w, t = WALL.thick;
    const block = (x0: number, z0: number, x1: number, z1: number) => {
      for (let z = Math.floor(z0); z < Math.ceil(z1); z++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
        if (!G.inside(x, z) || x + 0.5 < x0 || x + 0.5 > x1 || z + 0.5 < z0 || z + 0.5 > z1) continue;
        if (w.gates.some((g) => Math.abs(x + 0.5 - g.x) < WALL.gate / 2 && Math.abs(z + 0.5 - g.z) < WALL.gate / 2)) continue;
        const i = G.idx(x, z);
        G.l.cells[i] = Cell.Blocked;
        G.reserved[i] = 1;
      }
    };
    block(b.x0, b.z0, b.x1, b.z0 + t);
    block(b.x0, b.z1 - t, b.x1, b.z1);
    block(b.x0, b.z0, b.x0 + t, b.z1);
    block(b.x1 - t, b.z0, b.x1, b.z1);
    for (const p of [...w.towers, ...gateTowers(w)]) block(p.x - p.s / 2, p.z - p.s / 2, p.x + p.s / 2, p.z + p.s / 2);
  }

  /**
   * Cuts the stair's way into the rock (the rock stands back a metre and a half either side of it)
   * and blocks its footprint to walking (the walk times stop at its foot).
   */
  stair(s: StairPlan) {
    const G = this.G;
    this.stairPlan = s;
    for (const r of stairRects(s)) {
      const side = 1.5;
      for (let z = Math.floor(r.z0 - side); z < Math.ceil(r.z1 + side); z++) for (let x = Math.floor(r.x0 - side); x < Math.ceil(r.x1 + side); x++) {
        if (!G.inside(x, z)) continue;
        const i = G.idx(x, z), inside = x + 0.5 > r.x0 && x + 0.5 < r.x1 && z + 0.5 > r.z0 && z + 0.5 < r.z1;
        if (G.l.cells[i] === Cell.Cliff || inside) {
          G.l.cells[i] = inside ? Cell.Blocked : Cell.Ground;
          G.l.elev[i] = 0;
          G.l.ground[i] = Ground.Stone;
          G.reserved[i] = 1;
        }
      }
    }
  }

  /**
   * Woods round the town (none inside `town`, thickening toward the lot's edges), a meadow lawn on
   * every grassy cell, and nothing walkable left out of reach. Returns the finished plan.
   */
  finish(meta: Pick<HubPlan, 'id' | 'name' | 'idea' | 'heart' | 'street' | 'routes'>, town: (x: number, z: number) => boolean): HubPlan {
    const entry = meta.heart;
    const G = this.G;
    G.l.entry = { ...entry };
    for (let i = 0; i < LOT.w * LOT.h; i++) {
      const x = (i % LOT.w) + 0.5, z = Math.floor(i / LOT.w) + 0.5;
      if (town(x, z) && G.reserved[i] === 0) G.reserved[i] = 3;
    }
    // (The woods begin a few metres out from the town and are thick a few dozen out.)
    const out = G.distance((i) => town((i % LOT.w) + 0.5, Math.floor(i / LOT.w) + 0.5));
    G.scatter((x, z) => {
      const d = out[G.idx(Math.floor(x), Math.floor(z))];
      return Math.min(0.45, Math.max(0, (d - 4) / 22)) * (0.4 + G.noise(x * 0.06, z * 0.06));
    }, 0.06);
    G.connect();
    const lawn = (G.l.lawn = new Uint8Array(LOT.w * LOT.h));
    for (let i = 0; i < LOT.w * LOT.h; i++) lawn[i] = lawnCell(G.l.cells[i], G.l.ground[i], G.l.fluid[i], false);
    if (!this.stairPlan || this.bakery < 0) throw new Error(`hub layout ${meta.id}: no castle stair or no bakery`);
    return { ...meta, layout: G.l, masses: this.masses, houses: this.houses, bakery: this.bakery, spots: this.spots, stair: this.stairPlan, wall: this.wallPlan };
  }
}

/** The stair's footprints (flights and landings), each with the height of its top over the foot. */
export function stairRects(s: StairPlan): (Box & { top0: number; top1: number; flight: boolean; dir: Face })[] {
  const out: (Box & { top0: number; top1: number; flight: boolean; dir: Face })[] = [];
  let p = { ...s.foot }, d = s.dir, h = 0;
  const hw = s.width / 2;
  const rect = (len: number) => {
    const o = OUTWARD[d], q = { x: p.x + o.x * len, z: p.z + o.z * len }, n = { x: -o.z * hw, z: o.x * hw };
    const xs = [p.x + n.x, p.x - n.x, q.x + n.x, q.x - n.x], zs = [p.z + n.z, p.z - n.z, q.z + n.z, q.z - n.z];
    return { box: { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) }, q };
  };
  for (const leg of s.legs) {
    if ('turn' in leg) {
      // A square landing: back half the width to its middle, then out half the width the new way.
      const o = OUTWARD[d], c = { x: p.x - o.x * hw, z: p.z - o.z * hw }, n = OUTWARD[leg.turn];
      d = leg.turn;
      p = { x: c.x + n.x * hw, z: c.z + n.z * hw };
      continue;
    }
    const len = 'risers' in leg ? leg.risers * TREAD : leg.landing;
    const { box, q } = rect(len);
    const top1 = h + ('risers' in leg ? leg.risers * RISER : 0);
    out.push({ ...box, top0: h, top1, flight: 'risers' in leg, dir: d });
    h = top1;
    p = q;
  }
  return out;
}

/** The town wall's thickness, its gates' width and its towers' sizes (m, whole cells). */
export const WALL = { thick: 2.7, gate: 9, tower: 7.2, gateTower: 5.4 } as const;

/** The two towers flanking each gate, on the wall's line (centres and sizes). */
export function gateTowers(w: WallPlan) {
  const out: { x: number; z: number; s: number }[] = [];
  const s = WALL.gateTower, off = WALL.gate / 2 + s / 2, mid = WALL.thick / 2;
  for (const g of w.gates) {
    const ns = Math.abs(g.z - w.box.z0) < 0.01 || Math.abs(g.z - w.box.z1) < 0.01;
    const line = ns ? { x: g.x, z: Math.abs(g.z - w.box.z0) < 0.01 ? g.z + mid : g.z - mid } : { x: Math.abs(g.x - w.box.x0) < 0.01 ? g.x + mid : g.x - mid, z: g.z };
    for (const k of [-1, 1]) out.push(ns ? { x: line.x + k * off, z: line.z, s } : { x: line.x, z: line.z + k * off, s });
  }
  return out;
}

/** The foot of the castle's gate on the rock (the walk up ends here). */
export const castleGate = (): Vec2 => ({ x: CX, z: CASTLE.z1 + 1 });
