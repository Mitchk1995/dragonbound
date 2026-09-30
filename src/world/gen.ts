import type { Vec2 } from '../types';
import { blockDisc, Cell, emptyLayout, Fluid, Ground, makeNoise, mulberry32, type PropSpawn, type ZoneLayout } from './layout';

/**
 * Zone generation toolkit: authored "big shapes" (roads, rivers, lakes, clearings, plateaus,
 * forests) composed on a grid, with seeded noise so edges look natural. Builders describe a
 * zone as a few landmarks and connections; the toolkit makes it look hand-placed.
 *
 * Reserved cells (roads, clearings, spawns, stations) are never filled with trees or rocks, so
 * every point of interest stays reachable (tests/logic.test.ts checks paths from the entry).
 */
export class Gen {
  readonly l: ZoneLayout;
  readonly rng: () => number;
  readonly noise: (x: number, z: number) => number;
  /** 1 = hard (roads, stations: nothing may cover them), 3 = clearing (no scenery; lakes only when forced), 2 = verge (sparse scenery). */
  readonly reserved: Uint8Array;

  constructor(readonly w: number, readonly h: number, seed: number, fill: Cell = Cell.Ground, ground: Ground = Ground.Grass) {
    this.l = emptyLayout(w, h);
    this.l.cells.fill(fill);
    this.l.ground.fill(ground);
    this.rng = mulberry32(seed);
    this.noise = makeNoise(this.rng);
    this.reserved = new Uint8Array(w * h);
  }

  idx(x: number, z: number) {
    return z * this.w + x;
  }

  inside(x: number, z: number) {
    return x >= 0 && z >= 0 && x < this.w && z < this.h;
  }

  /** Visit every cell whose centre lies within `r` (+ noise wobble) of (cx, cz). */
  blob(cx: number, cz: number, r: number, wobble: number, fn: (i: number, x: number, z: number, d: number) => void) {
    const R = Math.ceil(r + wobble + 1);
    for (let z = Math.floor(cz - R); z <= cz + R; z++) {
      for (let x = Math.floor(cx - R); x <= cx + R; x++) {
        if (!this.inside(x, z)) continue;
        const px = x + 0.5, pz = z + 0.5;
        const d = Math.hypot(px - cx, pz - cz);
        const rr = r + (this.noise(px * 0.18 + cx, pz * 0.18 + cz) - 0.5) * 2 * wobble;
        if (d <= rr) fn(this.idx(x, z), x, z, d / rr);
      }
    }
  }

  /** Visit every cell within `width/2` of a polyline (with wobble along its length). */
  along(poly: Vec2[], width: number, wobble: number, fn: (i: number, x: number, z: number, t: number) => void) {
    const minX = Math.min(...poly.map((p) => p.x)) - width - wobble - 2, maxX = Math.max(...poly.map((p) => p.x)) + width + wobble + 2;
    const minZ = Math.min(...poly.map((p) => p.z)) - width - wobble - 2, maxZ = Math.max(...poly.map((p) => p.z)) + width + wobble + 2;
    for (let z = Math.max(0, Math.floor(minZ)); z <= Math.min(this.h - 1, maxZ); z++) {
      for (let x = Math.max(0, Math.floor(minX)); x <= Math.min(this.w - 1, maxX); x++) {
        const px = x + 0.5, pz = z + 0.5;
        const { d, t } = distToPoly(px, pz, poly);
        const half = width / 2 + (this.noise(px * 0.12, pz * 0.12) - 0.5) * 2 * wobble;
        if (d <= half) fn(this.idx(x, z), x, z, t);
      }
    }
  }

  /** A walkable road/trail: ground type, reserved, clears scenery and relief. */
  road(points: Vec2[], width: number, ground: Ground = Ground.Path, wobble = 0.4) {
    const poly = spline(points);
    this.along(poly, width, wobble, (i) => {
      this.l.cells[i] = Cell.Ground;
      this.l.fluid[i] = Fluid.None;
      this.l.ground[i] = ground;
      this.reserved[i] = 1;
    });
    // Soft verge: the next band stays clear of trees so roads read as open corridors.
    this.along(poly, width + 3, wobble, (i) => {
      if (this.reserved[i] === 0) this.reserved[i] = 2;
    });
    return poly;
  }

  /** An open clearing (reserved), optionally with its own ground type. */
  clearing(cx: number, cz: number, r: number, ground?: Ground, wobble = 1.5) {
    this.blob(cx, cz, r, wobble, (i) => {
      if (this.l.cells[i] !== Cell.Ground || this.l.fluid[i]) this.l.cells[i] = Cell.Ground;
      this.l.fluid[i] = Fluid.None;
      if (ground !== undefined) this.l.ground[i] = ground;
      if (this.reserved[i] !== 1) this.reserved[i] = 3;
    });
  }

  /**
   * A river along a curve. Bridges span it wherever one of `roads` (polylines from road())
   * crosses, plus at any extra `crossings` (0..1 along the river); bridge cells stay walkable.
   */
  river(points: Vec2[], width: number, kind: Fluid = Fluid.Water, roads: Vec2[][] = [], crossings: number[] = [], bridgeProp = 'bridge') {
    const poly = spline(points);
    // Rivers cut through everything (clearings and roads included); every road that crosses gets
    // a bridge where it meets the river, so no route is ever severed.
    this.along(poly, width, 0.8, (i) => {
      this.l.fluid[i] = kind;
      this.l.cells[i] = Cell.Blocked;
    });
    // Each bridge: centre, deck direction and span. Road bridges follow the road (so both banks
    // meet it even when it crosses at an angle); extra crossings run straight across the flow.
    const decks: { p: Vec2; ax: number; az: number; span: number }[] = [];
    for (const t of crossings) {
      const { p, dir } = pointAt(poly, t);
      decks.push({ p, ax: -dir.z, az: dir.x, span: width + 3 });
    }
    for (const road of roads) {
      let best = { d: Infinity, k: 0 };
      road.forEach((p, k) => {
        const r = distToPoly(p.x, p.z, poly);
        if (r.d < best.d) best = { d: r.d, k };
      });
      if (best.d >= width) continue;
      const a = road[Math.max(0, best.k - 2)], b = road[Math.min(road.length - 1, best.k + 2)];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const ax = (b.x - a.x) / len, az = (b.z - a.z) / len;
      const { dir } = pointAt(poly, distToPoly(road[best.k].x, road[best.k].z, poly).t);
      const sin = Math.max(0.35, Math.abs(ax * dir.z - az * dir.x));
      decks.push({ p: road[best.k], ax, az, span: (width + 1.6) / sin + 2 });
    }
    for (const { p, ax, az, span } of decks) {
      const dir = { x: az, z: -ax };
      for (let s = -span / 2; s <= span / 2; s += 0.25) {
        for (let k = -1.4; k <= 1.4; k += 0.25) {
          const x = Math.floor(p.x + ax * s + dir.x * k), z = Math.floor(p.z + az * s + dir.z * k);
          if (!this.inside(x, z)) continue;
          const i = this.idx(x, z);
          this.l.cells[i] = Cell.Ground;
          this.reserved[i] = 1;
        }
      }
      this.l.props.push({ kind: bridgeProp, x: p.x, z: p.z, rot: Math.atan2(ax, az), len: span });
    }
    return poly;
  }

  /** A lake (noise-edged disc of fluid). `force` lets it fill a clearing (never a road). */
  lake(cx: number, cz: number, r: number, kind: Fluid = Fluid.Water, wobble = 2.5, force = false) {
    this.blob(cx, cz, r, wobble, (i) => {
      if (this.reserved[i] === 1 || (this.reserved[i] === 3 && !force)) return;
      this.l.fluid[i] = kind;
      this.l.cells[i] = Cell.Blocked;
    });
  }

  /** A raised mesa/cliff mass. */
  plateau(cx: number, cz: number, r: number, height: number, wobble = 2) {
    this.blob(cx, cz, r, wobble, (i) => {
      if (this.reserved[i] === 1 || this.reserved[i] === 3) return;
      this.l.cells[i] = Cell.Cliff;
      this.l.fluid[i] = Fluid.None;
      this.l.elev[i] = height;
    });
  }

  /** A cliff ridge along a curve. */
  ridge(points: Vec2[], width: number, height: number) {
    this.along(spline(points), width, 1.2, (i) => {
      if (this.reserved[i] === 1 || this.reserved[i] === 3) return;
      this.l.cells[i] = Cell.Cliff;
      this.l.fluid[i] = Fluid.None;
      this.l.elev[i] = height;
    });
  }

  /**
   * Scatter trees/rocks on open, unreserved ground. `density(x, z)` in 0..1 (combine noise
   * masks for clustered woods and open meadows). Verges (reserved = 2) get a tenth.
   */
  scatter(density: (x: number, z: number) => number, rockShare = 0.12) {
    for (let z = 0; z < this.h; z++) {
      for (let x = 0; x < this.w; x++) {
        const i = this.idx(x, z);
        if (this.l.cells[i] !== Cell.Ground || this.l.fluid[i] || this.reserved[i] === 1 || this.reserved[i] === 3) continue;
        let d = density(x + 0.5, z + 0.5);
        if (this.reserved[i] === 2) d *= 0.1;
        if (this.rng() < d) this.l.cells[i] = this.rng() < rockShare ? Cell.Rock : Cell.Tree;
      }
    }
  }

  /** Impassable frame so the camera never sees past the map: cliffs with a ragged inner edge. */
  frame(depth: number, cell: Cell = Cell.Cliff, height = 4) {
    for (let z = 0; z < this.h; z++) {
      for (let x = 0; x < this.w; x++) {
        const d = Math.min(x, z, this.w - 1 - x, this.h - 1 - z);
        const edge = depth + (this.noise(x * 0.1, z * 0.1) - 0.5) * depth * 0.8;
        const i = this.idx(x, z);
        if (d < edge && this.reserved[i] !== 1 && this.reserved[i] !== 3) {
          this.l.cells[i] = cell;
          this.l.fluid[i] = Fluid.None;
          this.l.elev[i] = height + this.noise(x * 0.07 + 30, z * 0.07) * 3;
        }
      }
    }
  }

  /**
   * Safety net: flood-fill from the entry and carve a trail to any station, ore node, pack or
   * boss that isn't reachable (forests or cliffs closing it in). Roads are the design; this only
   * guarantees nothing is ever stranded. Returns how many trails were cut.
   */
  connect(): number {
    const { w, h, l } = this;
    const walk = (i: number) => l.cells[i] === Cell.Ground;
    const reach = new Uint8Array(w * h);
    const flood = () => {
      reach.fill(0);
      const q = [this.idx(Math.floor(l.entry.x), Math.floor(l.entry.z))];
      reach[q[0]] = 1;
      while (q.length) {
        const i = q.pop()!;
        const x = i % w, z = (i - x) / w;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz;
          if (!this.inside(nx, nz)) continue;
          const j = this.idx(nx, nz);
          if (!reach[j] && walk(j)) {
            reach[j] = 1;
            q.push(j);
          }
        }
      }
    };
    const targets: Vec2[] = [...l.stations, ...l.nodes, ...l.packs, ...(l.boss ? [l.boss] : [])];
    let cut = 0;
    flood();
    for (const t of targets) {
      // Reached if any walkable cell within 2.5 of the target is connected.
      let ok = false;
      for (let z = Math.floor(t.z - 2.5); z <= t.z + 2.5 && !ok; z++) for (let x = Math.floor(t.x - 2.5); x <= t.x + 2.5; x++) {
        if (this.inside(x, z) && reach[this.idx(x, z)] && Math.hypot(x + 0.5 - t.x, z + 0.5 - t.z) <= 2.5) {
          ok = true;
          break;
        }
      }
      if (ok) continue;
      let best: Vec2 | null = null, bd = Infinity;
      for (let i = 0; i < w * h; i++) {
        if (!reach[i]) continue;
        const x = (i % w) + 0.5, z = Math.floor(i / w) + 0.5;
        const d = Math.hypot(x - t.x, z - t.z);
        if (d < bd) {
          bd = d;
          best = { x, z };
        }
      }
      if (!best) continue;
      // Start just outside the target (a trail through a station or ore cell would unblock it).
      const ux = (best.x - t.x) / bd, uz = (best.z - t.z) / bd;
      const start = { x: t.x + ux * 2.3, z: t.z + uz * 2.3 };
      const mid = { x: (start.x + best.x) / 2 + (this.rng() - 0.5) * bd * 0.3, z: (start.z + best.z) / 2 + (this.rng() - 0.5) * bd * 0.3 };
      this.road([start, mid, best], 2.4, Ground.Path, 0.3);
      cut++;
      flood();
    }
    // Seal off walkable pockets nobody can reach (e.g. a sliver between an ore rock and the
    // wall), so a click never picks a destination there. Nothing visible changes.
    for (let i = 0; i < w * h; i++) if (walk(i) && !reach[i]) l.cells[i] = Cell.Blocked;
    return cut;
  }

  prop(kind: string, x: number, z: number, rot = 0, s = 1, block = 0) {
    const p: PropSpawn = { kind, x, z, rot, s };
    this.l.props.push(p);
    if (block > 0) blockDisc(this.l, x, z, block);
    return p;
  }

  /** Reserve a disc so nothing is scattered there (spawns, stations, approach space). */
  reserve(cx: number, cz: number, r: number) {
    this.blob(cx, cz, r, 0, (i) => {
      this.reserved[i] = 1;
      if (this.l.cells[i] === Cell.Tree || this.l.cells[i] === Cell.Rock) this.l.cells[i] = Cell.Ground;
    });
  }

  station(kind: ZoneLayout['stations'][number]['kind'], id: string, x: number, z: number, rot = 0, block = 1) {
    this.reserve(x, z, block + 2.5);
    this.l.stations.push({ kind, id, x, z, rot });
    blockDisc(this.l, x, z, block);
  }

  pack(x: number, z: number, comp: string[], clear = 7, ground?: Ground) {
    this.clearing(x, z, clear, ground);
    // Camera-side verge: thin the woods between the camera (+z) and the fight.
    this.verge(x, z + clear + 3, clear + 3);
    this.l.packs.push({ x, z, comp });
  }

  /** Mark a disc as verge (scenery at a tenth of its density) wherever nothing is reserved yet. */
  verge(cx: number, cz: number, r: number) {
    this.blob(cx, cz, r, 1.5, (i) => {
      if (this.reserved[i] === 0) this.reserved[i] = 2;
    });
  }

  ore(ore: string, x: number, z: number) {
    const cx = Math.floor(x) + 0.5, cz = Math.floor(z) + 0.5;
    this.l.nodes.push({ ore, x: cx, z: cz });
    // Ore rocks are about two cells across: block the cell and its four neighbours.
    blockDisc(this.l, cx, cz, 1);
  }
}

// ─── Curves ─────────────────────────────────────────────────────────────────

/** Centripetal-ish Catmull-Rom through the points, sampled every ~0.5 units. */
export function spline(points: Vec2[]): Vec2[] {
  if (points.length < 3) return points.slice();
  const out: Vec2[] = [];
  const P = [points[0], ...points, points[points.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const n = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) * 2));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Distance from a point to a polyline, and the normalised arc parameter of the closest point. */
export function distToPoly(px: number, pz: number, poly: Vec2[]) {
  let best = Infinity, bestT = 0, acc = 0, total = 0;
  for (let i = 0; i < poly.length - 1; i++) total += Math.hypot(poly[i + 1].x - poly[i].x, poly[i + 1].z - poly[i].z);
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1e-6;
    const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / (len * len)));
    const d = Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
    if (d < best) {
      best = d;
      bestT = (acc + t * len) / (total || 1);
    }
    acc += len;
  }
  return { d: best, t: bestT };
}

/** Point and unit direction at arc parameter t (0..1) along a polyline. */
export function pointAt(poly: Vec2[], t: number) {
  let total = 0;
  for (let i = 0; i < poly.length - 1; i++) total += Math.hypot(poly[i + 1].x - poly[i].x, poly[i + 1].z - poly[i].z);
  let want = t * total;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (want <= len || i === poly.length - 2) {
      const f = len ? Math.min(1, want / len) : 0;
      return { p: { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f }, dir: { x: (b.x - a.x) / (len || 1), z: (b.z - a.z) / (len || 1) } };
    }
    want -= len;
  }
  return { p: poly[0], dir: { x: 1, z: 0 } };
}
