import type { Vec2 } from '../../types';
import { blockDisc, Cell, Ground } from '../../world/layout';
import * as castleApproach from '../../world/castle/approach';
import * as castleBailey from '../../world/castle/bailey';
import * as castleGround from '../../world/castle/ground';
import { FARM, WATER } from '../../world/castle/plan';
import { blockRect, inPoly } from './helpers';
import { inB } from './keepBuildings';
import { BAY_PATH, KEEP_STAGE, POOL_BAY, STAGE_CAMERAS, type KeepBuild } from './keepPlan';

/** The districts and roadsides: the green, the fields, the gardens, the farm, the castle's walls and falls, the pool's bay. */
export function dressDistricts({ G, site }: KeepBuild, look: Vec2, stream: Vec2[]) {
  // ─── District and roadside dressing ──────────────────────────────────────────
  // Everything here keeps off the roads, the station approaches and the stage (any cell it would
  // block must be open, unreserved ground; `paved` allows yard and market paving). Pieces that
  // don't fit are simply skipped, so the walks stay clear however the land falls.
  /** Cells blocked by fences and hedges: another run may meet them (at a corner or a gate post). */
  const lined = new Set<number>();
  const fits = (x: number, z: number, r: number, paved: boolean, joins = false) => {
    for (let cz = Math.floor(z - r - 0.5); cz <= z + r + 0.5; cz++) for (let cx = Math.floor(x - r - 0.5); cx <= x + r + 0.5; cx++) {
      if (Math.hypot(cx + 0.5 - x, cz + 0.5 - z) > r + 0.5) continue;
      if (!G.inside(cx, cz)) return false;
      const i = G.idx(cx, cz), gr = G.l.ground[i];
      if (joins && lined.has(i)) continue;
      if (G.l.cells[i] !== Cell.Ground || G.l.fluid[i] || G.reserved[i] === 1) return false;
      if (!paved && (gr === Ground.Stone || gr === Ground.Path)) return false;
    }
    return true;
  };
  const dress = (kind: string, x: number, z: number, rot = 0, block = 0.6, opt: { paved?: boolean; len?: number; s?: number } = {}) => {
    if (!fits(x, z, block, !!opt.paved)) return null;
    const p = G.prop(kind, x, z, rot, opt.s ?? 1, block);
    if (opt.len !== undefined) p.len = opt.len;
    G.verge(x, z, block + 1.5);
    return p;
  };
  /**
   * A fence or hedge from (x0, z0) to (x1, z1): all or nothing, keeping its whole width on open
   * ground and blocking the cells along its line.
   */
  const line = (kind: 'fence' | 'hedge', x0: number, z0: number, x1: number, z1: number) => {
    const L = Math.hypot(x1 - x0, z1 - z0), at = (t: number) => ({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t });
    const cells: number[] = [];
    const n = Math.ceil(L / 0.7), r = kind === 'hedge' ? 0.5 : 0.35;
    for (let k = 0; k <= n; k++) if (!fits(at(k / n).x, at(k / n).z, r, false, true)) return;
    for (let k = 0; k <= n; k++) {
      const q = at(k / n);
      for (let cz = Math.floor(q.z - r); cz <= Math.floor(q.z + r); cz++) for (let cx = Math.floor(q.x - r); cx <= Math.floor(q.x + r); cx++) {
        if (Math.hypot(cx + 0.5 - q.x, cz + 0.5 - q.z) <= r) cells.push(G.idx(cx, cz));
      }
    }
    const p = G.prop(kind, (x0 + x1) / 2, (z0 + z1) / 2, Math.atan2(-(z1 - z0), x1 - x0));
    p.len = L;
    for (const i of cells) {
      G.l.cells[i] = Cell.Blocked;
      lined.add(i);
    }
    G.verge((x0 + x1) / 2, (z0 + z1) / 2, L / 2 + 1.5);
  };
  /** Plant one tree (a planted tree, not scenery: the green, the orchard). */
  const plant = (x: number, z: number) => {
    const i = G.idx(Math.floor(x), Math.floor(z));
    if (G.l.cells[i] === Cell.Ground && !G.l.fluid[i] && G.reserved[i] !== 1 && G.l.ground[i] !== Ground.Stone && G.l.ground[i] !== Ground.Path) G.l.cells[i] = Cell.Tree;
  };

  // The village green: an open lawn round the old well, a pair of shade trees and benches.
  dress('well', 146.6, 198.4, 0.12, 1.1);
  for (const [x, z] of [[148.5, 194.2], [151.5, 195.5]]) plant(x, z);
  dress('fit_bench', 145.4, 194.6, 0.08, 0.5);
  dress('fit_bench', 151.2, 199.4, Math.PI / 2 + 0.1, 0.5);

  // The vegetable plots in a true grid either side of the field lane, the scarecrow between them
  // (the hay paddock at the lane's end, below). Each plot
  // grows one crop, the five crops turning through the grid so no two plots side by side match.
  // (West of the pool under the castle's fall.)
  for (const [xi, x] of FARM.plotsX.entries()) for (const [zi, z] of FARM.plotsZ.entries()) {
    const plot = dress('veg_patch', x, z, 0, 1.5);
    if (plot) plot.v = (xi + 2 * zi) % 5;
  }
  dress('scarecrow', 78.0, 179.6, 0, 0.4);

  // The bank forecourt: planters either side of the door, a bench facing the square.
  dress('planter', inB('bank', 6.2, 16).x, inB('bank', 6.2, 16).z, 0, 0.7, { paved: true });
  dress('planter', inB('bank', 13.8, 16).x, inB('bank', 13.8, 16).z, 0, 0.7, { paved: true });
  dress('fit_bench', inB('bank', 15.6, 21.2).x, inB('bank', 15.6, 21.2).z, -Math.PI / 2, 0.5);
  // The market: each stall's stock stacked at its back corner.
  dress('fit_sacks', 178.6, 195.6, 0.4, 0.5);
  dress('crates', 185.4, 210.6, 0.6, 0.9);
  dress('barrels', 202.4, 205.0, 0.2, 0.9);
  // The alchemy lab's front garden and a bench by the pond.
  for (const [x, z] of [[128.4, 226.2], [128.4, 229.4], [137.0, 226.2], [137.0, 229.4]]) dress('herb_bed', x, z, 0, 1.2);
  dress('fit_bench', 122.6, 221.4, -0.5, 0.5);
  // The memorial garden: hedges on three sides, open to the lookout path; planters and benches.
  line('hedge', 167.0, 218.6, 174.4, 218.6);
  line('hedge', 178.6, 218.6, 185.4, 218.6);
  line('hedge', 167.0, 219.4, 167.0, 235.6);
  line('hedge', 186.0, 219.4, 186.0, 235.6);
  G.prop('memorial', 176.6, 227.0, 0, 1.35, 1.9);
  for (const [x, z] of [[172.6, 224.2], [180.6, 224.2]]) dress('planter', x, z, 0, 0.7, { paved: true });
  dress('fit_bench', 180.4, 231.4, 0, 0.5);
  dress('fit_bench', 172.6, 231.4, 0, 0.5, { paved: true });
  // The lookout on the old south headland: a parapet on the edge, a bench and a lamp.
  G.prop('parapet', look.x, look.z + 2.6, 0).len = 9;
  blockRect(G, look.x, look.z + 2.6, 4.6, 0.5, 0);
  G.prop('fit_bench', look.x - 2.8, look.z + 1.0, 0, 1, 0.5);
  G.prop('lamp_post', look.x + 3.6, look.z + 1.0, 0, 1, 0.4);
  // The orchard by the east lane: fruit trees in rows, a cart and crates for the picking.
  for (let x = 232.5; x <= 256.5; x += 4) for (let z = 113.5; z <= 129.5; z += 4) if (inPoly(x, z, [[226, 108], [262, 110], [264, 132], [248, 136], [228, 130]])) plant(x, z);
  dress('cart', 240.4, 136.6, -0.3, 1.1);
  dress('crates', 244.0, 137.2, 0.3, 0.9);

  /** A piece of dressing: blocking a disc of radius `block`, or a turned rectangle [hw, hd]. */
  const place = (kind: string, x: number, z: number, rot = 0, opt: { s?: number; len?: number; v?: number; block?: number | [number, number] } = {}) => {
    const p = G.prop(kind, x, z, rot, opt.s ?? 1);
    if (opt.len !== undefined) p.len = opt.len;
    if (opt.v !== undefined) p.v = opt.v;
    const b = opt.block ?? 0.45;
    if (typeof b === 'number') {
      if (b > 0) blockDisc(G.l, x, z, b);
    } else blockRect(G, x, z, b[0], b[1], rot);
    return p;
  };
  /** The angle that faces from (x, z) toward (tx, tz). */
  const toward = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z);
  /**
   * A fence or hedge run from (x0, z0) to (x1, z1), set exactly as drawn: it blocks every cell its
   * centreline crosses (`v`: a hedge's height).
   */
  const rail = (kind: 'fence' | 'hedge', x0: number, z0: number, x1: number, z1: number, v?: number) => {
    const L = Math.hypot(x1 - x0, z1 - z0);
    const p = G.prop(kind, (x0 + x1) / 2, (z0 + z1) / 2, Math.atan2(-(z1 - z0), x1 - x0));
    p.len = L;
    if (v !== undefined) p.v = v;
    const n = Math.ceil(L / 0.1);
    for (let k = 0; k <= n; k++) {
      const t = 0.002 + (0.996 * k) / n, i = G.idx(Math.floor(x0 + (x1 - x0) * t), Math.floor(z0 + (z1 - z0) * t));
      G.l.cells[i] = Cell.Blocked;
      lined.add(i);
    }
  };
  // The farm at the rock's foot: the hay paddock at the end of the field lane, fenced all round with its
  // gate between stone piers where the lane arrives; the trough just inside the gate on its axis, the
  // hay lined up along the north fence.
  {
    const [fx, fz] = FARM.fence, gx = FARM.gate;
    rail('fence', fx, fz, fx + 14.4, fz);
    rail('fence', fx, fz, fx, fz + 12.4);
    rail('fence', fx + 14.4, fz, fx + 14.4, fz + 12.4);
    rail('fence', fx, fz + 12.4, gx - 1.4, fz + 12.4);
    rail('fence', gx + 1.4, fz + 12.4, fx + 14.4, fz + 12.4);
    place('gate_piers', gx, fz + 12.4, 0, { block: 0 });
    for (const sx of [-1, 1]) blockDisc(G.l, gx + sx * 1.25, fz + 12.4, 0.35);
    for (const x of [gx - 4, gx + 4]) place('haystack', x, fz + 2.4, 0, { block: 1.1 });
    place('fit_hay', gx, fz + 1.8, 0, { block: 0.7 });
    place('fit_trough', gx, fz + 10.4, 0, { block: [0.9, 0.35] });
  }
  // ─── The castle's walls and dressing, the falls ─────────────────────────────
  castleApproach.walls(site);
  castleBailey.centrepiece(site);
  castleGround.falls(site);
  // The round viewing bay at the end of the spring path, on the pool's bank: a bench on its far
  // side looking at the fall, a lamp either side of where the path comes in.
  {
    const c = POOL_BAY, fall = { x: WATER.pool.x, z: WATER.pool.z - 3 };
    G.clearing(c.x, c.z, 2.0, Ground.Stone, 0);
    G.prop('round_terrace', c.x, c.z, toward(c.x, c.z, BAY_PATH.x, BAY_PATH.z)).len = 2.2;
    const ux = (fall.x - c.x) / Math.hypot(fall.x - c.x, fall.z - c.z), uz = (fall.z - c.z) / Math.hypot(fall.x - c.x, fall.z - c.z);
    const bx = c.x + ux * 1.15, bz = c.z + uz * 1.15;
    G.prop('stone_bench', bx, bz, toward(bx, bz, fall.x, fall.z));
    blockRect(G, bx, bz, 0.9, 0.3, toward(bx, bz, fall.x, fall.z));
    const px = BAY_PATH.x - c.x, pz = BAY_PATH.z - c.z, pl = Math.hypot(px, pz), tx = px / pl, tz = pz / pl;
    for (const sx of [-1, 1]) G.prop('lamp_post', c.x + tx * 2.4 - tz * sx * 1.4, c.z + tz * 2.4 + tx * sx * 1.4, 0, 1, 0.4);
  }
  // Reeds along the pool's west shore and the pond's.
  for (const [x, z, a] of [[82.4, 162.2, 0.4], [82.9, 159.3, 1.6], [112.0, 212.0, 0.6], [111.6, 215.8, 2.2], [112.4, 219.6, 4.0]]) G.prop('reeds', x, z, a);
  // A few rounded stones breaking the stream's surface below the pool, foam trailing from them.
  for (const [n, t] of [[1, 0.35], [2, 0.62], [3, 0.88], [4, 1.5], [5, 2.3]] as const) {
    const k = Math.floor(t), a = stream[k], b = stream[k + 1], f = t - k;
    const x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f, nx = -(b.z - a.z), nz = b.x - a.x, l = Math.hypot(nx, nz);
    const side = (n % 2 ? 1 : -1) * 0.45;
    G.prop('stream_stone', x + (nx / l) * side, z + (nz / l) * side, Math.atan2(b.x - a.x, b.z - a.z)).len = n;
  }
  // Where the stream leaves the island over its old south edge, it falls away into the Veil.
  G.prop('edge_fall', 106.6, 231.6, Math.atan2(105 - 110, 234 - 226));
  // The hero is staged here for character creation and the pose tools; keep every camera spot
  // around it clear, or the near plane slices whatever prop sits there.
  for (const c of STAGE_CAMERAS) G.reserve(KEEP_STAGE.x + c.x, KEEP_STAGE.z + c.z, 2);
  G.reserve(KEEP_STAGE.x, KEEP_STAGE.z, 3);
}
