import type { Vec2 } from '../../types';
import { COURSE } from '../../render/masonry';
import { Cell, Ground } from '../layout';
import { APPROACH, BRIDGE, CLIMB, CROWN_Y, CURTAIN, GROW, MOAT, type Box } from './plan';
import { inBox, runRot, type Site } from './site';

/**
 * The approach: from the ore lane the climb's four flights up the rock's south-east corner to the
 * ledge, then everything at the crown's level, the ledge road west between its walls to the gate
 * terrace on its bastion and the bridge over the moat to the gate, the landing at the stair's head
 * and the ledge walk on west to the lookout on the knoll.
 */

/** How high the climb's walls' copings stand over the stair beside them: a parapet at the hero's chest. */
const COPING = 1.4;

/** How far the climb's stones stand over the ground laid under them (so their faces never lie in one plane). */
export const LIFT = 0.015;

/** One flight of the climb as it is built: its foot, the way up and across it in plan, its steps. */
export interface Flight {
  /** The middle of its foot edge, where its first riser stands. */
  foot: Vec2;
  /** Up the flight in plan (a unit vector), and across it. */
  up: Vec2;
  across: Vec2;
  /** Its width between its walls, and its length up to its head's cell edge. */
  width: number;
  run: number;
  /** Its foot and head levels, its risers (each `riser` high) and their treads (`tread` deep). */
  y0: number;
  y1: number;
  risers: number;
  riser: number;
  tread: number;
}

/** The climb's four flights, from the lane up. */
export function climbFlights(): Flight[] {
  return CLIMB.flights.map((f) => {
    const [x0, z0, x1, z1] = f.rect;
    const up = { n: { x: 0, z: -1 }, s: { x: 0, z: 1 }, e: { x: 1, z: 0 }, w: { x: -1, z: 0 } }[f.up];
    const alongZ = up.x === 0;
    const foot = alongZ ? { x: (x0 + x1) / 2, z: up.z < 0 ? z1 : z0 } : { x: up.x < 0 ? x1 : x0, z: (z0 + z1) / 2 };
    return {
      foot, up, across: { x: -up.z, z: up.x },
      width: alongZ ? x1 - x0 : z1 - z0, run: alongZ ? z1 - z0 : x1 - x0,
      y0: f.y0, y1: f.y1, risers: CLIMB.risers, riser: (f.y1 - f.y0) / CLIMB.risers, tread: CLIMB.tread,
    };
  });
}

/** How far up a flight a point lies (0 at its foot), and how far across it from its middle. */
const alongFlight = (f: Flight, x: number, z: number) => (x - f.foot.x) * f.up.x + (z - f.foot.z) * f.up.z;
const acrossFlight = (f: Flight, x: number, z: number) => (x - f.foot.x) * f.across.x + (z - f.foot.z) * f.across.z;
/** How far up a flight its last riser stands (a tread for every riser but the last). */
export const headOf = (f: Flight) => (f.risers - 1) * f.tread;

/** The top of the stair's stones `s` up a flight: a tread's top, or its head's landing past its last riser. */
export function treadTop(f: Flight, s: number) {
  if (s < 0) return f.y0 + LIFT;
  const i = Math.min(f.risers, Math.floor(s / f.tread) + 1);
  return f.y0 + LIFT + i * f.riser;
}

/**
 * The ground laid under a flight's cells, `j` cells up from its foot: just under the line through the
 * backs of its treads (the ground runs straight from one cell edge to the next, so it never shows
 * through a tread), its foot level with the ground it rises from. Units walk on it, at most a riser
 * under the stone.
 */
export function flightGround(f: Flight, j: number) {
  return j === 0 ? f.y0 : f.y0 + (j * f.riser) / f.tread - 0.02;
}

/** The line a flight's walls take their copings from: its foot's level up to its head's at the last riser. */
const walkLine = (f: Flight, s: number) => f.y0 + (f.y1 - f.y0) * Math.max(0, Math.min(1, s / headOf(f)));

/** The level a wall's coping stands COPING over at a point on the stair (a flight or a landing), or null off it. */
function stairLevel(x: number, z: number): number | null {
  for (const f of climbFlights()) {
    const s = alongFlight(f, x, z);
    if (s >= -0.01 && s <= f.run + 0.01 && Math.abs(acrossFlight(f, x, z)) <= f.width / 2 + 0.01) return walkLine(f, s);
  }
  for (const l of CLIMB.landings) if (inBox(x, z, [l.rect[0] - 0.01, l.rect[1] - 0.01, l.rect[2] + 0.01, l.rect[3] + 0.01])) return l.y;
  return null;
}

/**
 * The approach's levels (laid before the rock is cut, so the cliffs form round them and never on
 * them): the ledge, the gate terrace, the landing and the lookout paved at the crown's level; the
 * climb's flights and landings at their own levels; the ground at the foot of the bastion and of the
 * stair's walls kept clear of rock.
 */
export function levels(s: Site) {
  for (const box of [APPROACH.ledgeRoad, APPROACH.ledgeWalk, APPROACH.gateTerrace]) s.ground(box, CROWN_Y, Ground.Stone);
  for (const poly of [APPROACH.landing, APPROACH.lookout]) s.within(poly, (i) => s.open(i, CROWN_Y, Ground.Stone));
  // The bridge's cells: the moat skips them, and bridge() lays its water under the arches afterwards.
  s.ground([BRIDGE.x0 - 0.5, CURTAIN.south + CURTAIN.T / 2 - 0.1, BRIDGE.x1 + 0.5, BRIDGE.z1], CROWN_Y, Ground.Cave);
  s.pave([BRIDGE.deck[0], CURTAIN.south, BRIDGE.deck[1], BRIDGE.z1]);
  // The crown runs on solid under every wall along the brink (the cliff starts a cell beyond its
  // outer face), clear of the stair's flights and landings and of the bastion.
  const P = APPROACH.parapets, stair = [...CLIMB.flights.map((f) => f.rect), ...CLIMB.landings.map((l) => l.rect)];
  const b = APPROACH.bastion, [bx0, , bx1, bz1] = b.rect, spread = CROWN_Y * b.batter + 0.5;
  for (const run of [P.outerWest, P.outerEast, P.landing]) for (let k = 0; k < run.length - 1; k++) {
    const [ax, az] = run[k], [qx, qz] = run[k + 1];
    s.cells([Math.min(ax, qx) - 2, Math.min(az, qz) - 2, Math.max(ax, qx) + 2, Math.max(az, qz) + 2], (i, x, z) => {
      const px = x + 0.5, pz = z + 0.5, L2 = (qx - ax) ** 2 + (qz - az) ** 2, t = Math.max(0, Math.min(1, ((px - ax) * (qx - ax) + (pz - az) * (qz - az)) / L2));
      if (Math.hypot(px - ax - (qx - ax) * t, pz - az - (qz - az) * t) > 1.3 || s.G.l.cells[i] === Cell.Void) return;
      if (stair.some(([x0, z0, x1, z1]) => x >= x0 - 1 && x < x1 + 1 && z >= z0 - 1 && z < z1 + 1)) return;
      if (px > bx0 - spread && px < bx1 + spread && pz > b.rect[1]) return;
      if (s.G.reserved[i] !== 1) s.open(i, CROWN_Y, Ground.Grass);
    });
  }
  // The climb: each flight's cells under its treads (see flightGround), its landings level.
  for (const f of climbFlights()) {
    for (let j = 0; j < f.run; j++) for (let k = 0; k < f.width; k++) {
      const u = j + 0.5, v = k + 0.5 - f.width / 2;
      s.open(s.G.idx(Math.floor(f.foot.x + f.up.x * u + f.across.x * v), Math.floor(f.foot.z + f.up.z * u + f.across.z * v)), flightGround(f, j), Ground.Stone);
    }
  }
  for (const l of CLIMB.landings) s.ground(l.rect, l.y, Ground.Stone);
  // The ore lane past the stair's foot and the lane between the stair and the smelter stay open, and
  // so does the ground at the foot of the stair's outer walls (no rock heaped against them) and round
  // the rock's corner east of the turning landing (no lone column of rock left standing there).
  s.ground([148, 159, 154, 173], 0, Ground.Grass);
  s.ground([134, 159, 148, 165], 0, Ground.Grass);
  s.ground([161, 150, 165, 173], 0, Ground.Grass);
  // The bastion stands on the rock at the cliff's foot: its top is the terrace's edge, and its battered
  // faces and their footing take the cells round it down to the foot, kept clear of rock, the pool and
  // the stream.
  s.ground(b.rect, CROWN_Y, Ground.Stone);
  s.cells([bx0 - spread, b.rect[1], bx1 + spread, bz1 + spread], (i, x, z) => {
    if (inBox(x + 0.5, z + 0.5, b.rect)) return;
    s.open(i, 0, Ground.Cave);
    s.block(i);
  });
}

/**
 * Everything the approach builds: the climb (its flights, landings, walls, piers and buttresses and
 * the dressed rock face over it), the bastion with the culvert's arch, the bridge on its arches with
 * the moat running under it, and the crown-level parapets along the moat's outer bank, round the
 * bridge's foot and the bastion and along the brink, a capped pier at every angle and end; lanterns,
 * benches and the banners at the bridge's foot.
 */
export function walls(s: Site) {
  climb(s);
  bastion(s);
  bridge(s);
  parapets(s);
  for (const [x, z, rot] of APPROACH.benches) s.prop('stone_bench', x, z, rot, 1.2, { y: CROWN_Y, s: GROW });
  for (const [x, z] of APPROACH.banners) s.prop('banner_pole', x, z, 0, 0.35, { y: CROWN_Y });
}

/** Does one of the climb's short landings (one pier reaches over it) lie at a wall's point? */
const shortLanding = (x: number, z: number) =>
  CLIMB.landings.some(({ rect: [x0, z0, x1, z1] }) => {
    if (Math.min(x1 - x0, z1 - z0) >= 2) return false;
    return x1 - x0 < 2 ? x > x0 && x < x1 + 0.6 && z > z0 && z < z1 + 1 : z > z0 && z < z1 + 0.6 && x > x0 - 1 && x < x1 + 1;
  });

/** The height of the battered talus the tall south wall of the climb stands on. */
const TALUS = 3;
/** The line of the tall south wall along the outer side of the upper flights (its walls' corner on the west run). */
const SOUTH_WALL = CLIMB.walls[0][2][1] - 0.5;

/** The climb's stone: its flights, landings, walls and their piers, buttresses and the rock face over it. */
function climb(s: Site) {
  const flights = climbFlights();
  for (const f of flights) {
    s.prop('stair_flight', f.foot.x, f.foot.z, Math.atan2(-f.up.x, -f.up.z), 0, { y: f.y0, opt: { w: f.width, run: f.run, n: f.risers, r: f.riser, g: f.tread, lift: LIFT } });
  }
  // The landings, flagged in the stair's stone, and a sill stone at its foot on the lane.
  // (The head's landing is flagged as far as the rock face; beyond it the ledge's paving runs on.)
  for (const { rect: [x0, z0, x1, z1], y } of CLIMB.landings) paving(s, [x0, Math.max(z0, CLIMB.face.z + 0.5), x1, z1], y);
  const f1 = flights[0];
  paving(s, [f1.foot.x - f1.width / 2, f1.foot.z, f1.foot.x + f1.width / 2, f1.foot.z + 0.45], f1.y0);
  // The walls: a run between each two piers, its coping COPING over the stair beside it, raking with a
  // flight and level over a landing; a pier wherever a coping changes, standing on the lane (the west
  // run's last ends in the ledge road's pier at the stair's head).
  type Pier = { x: number; z: number; xRun: boolean; zRun: boolean; lx: number; lz: number; top: number; end: boolean; crown: boolean };
  const piers = new Map<string, Pier>(), key = (p: number[]) => `${p[0]},${p[1]}`;
  for (const [w, pts] of CLIMB.walls.entries()) pts.forEach(([x, z], k) => {
    const nb = [pts[k - 1], pts[k + 1]].filter(Boolean);
    const p: Pier = piers.get(key([x, z])) ?? { x, z, xRun: false, zRun: false, lx: 0, lz: 0, top: 0, end: k === 0 || k === pts.length - 1, crown: w === 0 && k === pts.length - 1 };
    for (const q of nb) (q[1] === z ? (p.xRun = true) : (p.zRun = true));
    // (Along its walls a pier is 1.2 long, 1.8 over a short landing; across them the wall's own thickness.)
    const len = p.crown ? 0.6 : shortLanding(x, z) ? 1.8 : 1.2;
    p.lx = p.xRun && !p.zRun ? len : p.crown ? 0.6 : 1;
    p.lz = p.zRun && !p.xRun ? len : p.crown ? 0.6 : 1;
    piers.set(key([x, z]), p);
  });
  for (const pts of CLIMB.walls) for (let k = 0; k + 1 < pts.length; k++) {
    const a = piers.get(key(pts[k]))!, b = piers.get(key(pts[k + 1]))!;
    const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z);
    // The run between its piers' faces.
    const pa = { x: a.x + (dx * a.lx) / 2, z: a.z + (dz * a.lz) / 2 }, pb = { x: b.x - (dx * b.lx) / 2, z: b.z - (dz * b.lz) / 2 };
    // (The stair lies to one side: the coping is read a metre into it.)
    const m = { x: (pa.x + pb.x) / 2, z: (pa.z + pb.z) / 2 }, side = stairLevel(m.x - dz, m.z + dx) !== null ? 1 : -1;
    const lv = (p: Vec2) => (stairLevel(p.x - dz * side, p.z + dx * side) ?? CROWN_Y) + COPING;
    const ta = lv(pa), tb = lv(pb);
    a.top = Math.max(a.top, ta);
    b.top = Math.max(b.top, tb);
    const rot = runRot(pa, pb, { x: m.x - dz * side, z: m.z + dx * side });
    // (Local X runs from pa to pb, or back where the turn puts the outer face on local +Z.)
    const fwd = Math.abs(rot - Math.atan2(-(pb.z - pa.z), pb.x - pa.x)) < 1e-6, L = Math.hypot(pb.x - pa.x, pb.z - pa.z);
    const [l, r] = fwd ? [ta, tb] : [tb, ta];
    // The tall south wall along the outer side of the upper flights stands on a battered talus.
    const talus = dz === 0 && a.z > SOUTH_WALL;
    // (Its talus stops short of a corner's inside, where the wall turning there stands on the lane.)
    const corner = (q: Pier) => q.xRun && q.zRun && !q.crown, trim: [number, number] = fwd ? [corner(a) ? 0.1 : 0, corner(b) ? 0.1 : 0] : [corner(b) ? 0.1 : 0, corner(a) ? 0.1 : 0];
    s.prop('climb_wall', m.x, m.z, rot, 0, { y: 0, opt: { pts: [[-L / 2, 0, l], [L / 2, 0, r]], w: 1, base: true, talus: talus ? TALUS : 0, trim } });
    blockLine(s, pa, pb);
    // (A talus's foot takes the row of cells outside the wall too.)
    if (talus) blockLine(s, { x: pa.x, z: pa.z + 1 }, { x: pb.x, z: pb.z + 1 });
  }
  for (const p of piers.values()) {
    if (p.crown) continue;
    // (Flush with its walls' faces on the stair's side and where a wall runs on from it, a hand
    // proud of their outer faces.)
    const outer = (ox: number, oz: number) => stairLevel(p.x + ox * 1.2, p.z + oz * 1.2) === null && !(oz < 0 && p.z < CLIMB.face.z + 1.2) &&
      ![...piers.values()].some((q) => q !== p && Math.sign(q.x - p.x) === ox && Math.sign(q.z - p.z) === oz && (ox === 0 ? q.x === p.x : q.z === p.z));
    const out = (outer(-1, 0) ? 1 : 0) | (outer(1, 0) ? 2 : 0) | (outer(0, -1) ? 4 : 0) | (outer(0, 1) ? 8 : 0);
    // (Against the rock face its cap stops flush.)
    const flush = p.z - p.lz / 2 <= CLIMB.face.z + 0.51 ? 4 : 0;
    s.prop('climb_pier', p.x, p.z, 0, 0, { y: 0, v: p.end ? 2 : 0, opt: { lx: p.lx, lz: p.lz, top: p.top + 0.3, out, flush, talus: p.xRun && p.z > SOUTH_WALL ? TALUS : 0 } });
    // (Its cells, out to its outer faces and the foot of its talus, are its own.)
    const reach = (bit: number) => (out & bit ? (bit === 8 && p.xRun && p.z > SOUTH_WALL ? 0.85 : 0.15) : 0);
    s.cells([p.x - p.lx / 2 - reach(1), p.z - p.lz / 2 - reach(4), p.x + p.lx / 2 + reach(2), p.z + p.lz / 2 + reach(8)], (i) => {
      s.block(i, 0);
      s.G.l.ground[i] = Ground.Cave;
    });
  }
  // Buttresses on the tall south wall's outer face, each rising to a weathering under its coping.
  for (const x of CLIMB.buttresses) {
    const top = (stairLevel(x, SOUTH_WALL - 2.5) ?? CROWN_Y) + COPING;
    s.prop('climb_buttress', x, SOUTH_WALL + 1, 0, 0, { y: 0, opt: { h: top - 1.6 } });
    s.cells([x - 0.6, SOUTH_WALL + 1, x + 0.6, SOUTH_WALL + 2.6], (i) => s.block(i, 0));
  }
  // The rock face over the last two flights and the turning landing is dressed straight: a wall a
  // cell thick from just under the treads up to the crown, its foot following the stair.
  {
    const F = CLIMB.face, foot: [number, number][] = [];
    for (const f of flights.filter((q) => q.up.x !== 0)) {
      const h = headOf(f), xh = f.foot.x + f.up.x * h;
      // (Under the treads, the line through their backs; under a landing, its level.)
      foot.push([f.foot.x, f.y0 + LIFT - 0.1], [xh + 0.0005, f.y0 + LIFT + (f.risers - 1) * f.riser - 0.1], [xh - 0.0005, f.y1 + LIFT - 0.1]);
    }
    // (Over the turning landing to the east wall, then down to the lane over the wall's outer half.)
    const east = CLIMB.walls[1][0][0] - 0.5;
    foot.push([east, flights[1].y1 + LIFT - 0.1], [east + 0.001, 0], [F.x1, 0]);
    const pts = foot.filter(([x]) => x >= F.x0 - 0.001 && x <= F.x1 + 0.001).sort((a, b) => b[0] - a[0]);
    const cx = (F.x0 + F.x1) / 2;
    s.prop('climb_wall', cx, F.z, Math.PI, 0, { y: 0, opt: { pts: pts.map(([x, y]) => [cx - x, y, CROWN_Y]), w: 1, base: false, talus: 0 } });
    // (The cells under it step down to the treads below, so the treads run level to its foot.)
    s.cells([F.x0, F.z - 0.5, F.x1, F.z + 0.5], (i) => {
      s.block(i, s.level[i + s.w]);
      s.G.l.elev[i] = 0;
      s.G.l.ground[i] = Ground.Cave;
    });
  }
}

/** The cells a wall stands on, along its centre line: blocked, brought down to the lane off the crown. */
function blockLine(s: Site, a: Vec2, b: Vec2) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25);
  for (let j = 0; j <= n; j++) {
    const x = Math.floor(a.x + ((b.x - a.x) * j) / n), z = Math.floor(a.z + ((b.z - a.z) * j) / n);
    if (!s.G.inside(x, z)) continue;
    const i = s.G.idx(x, z);
    s.block(i, s.level[i] < CROWN_Y || s.G.l.cells[i] === Cell.Ground ? 0 : undefined);
    s.G.l.elev[i] = 0;
    s.G.l.ground[i] = Ground.Cave;
  }
}

/** A landing's flagstones over a rectangle, their top LIFT over its level. */
function paving(s: Site, [x0, z0, x1, z1]: Box, y: number) {
  s.prop('stair_landing', (x0 + x1) / 2, (z0 + z1) / 2, 0, 0, { y, opt: { lx: x1 - x0, lz: z1 - z0, lift: LIFT } });
}

/** The gate terrace's bastion: its battered faces from the rock at the cliff's foot up to the terrace's edge, the culvert's arch in its south face. */
function bastion(s: Site) {
  const b = APPROACH.bastion, [x0, z0, x1, z1] = b.rect;
  s.prop('gate_bastion', (x0 + x1) / 2, z1, 0, 0, { y: 0, opt: { w: x1 - x0, d: z1 - z0, h: CROWN_Y, batter: b.batter, arch: b.culvert } });
}

/**
 * The bridge: its two arches on the pier in the moat's middle, between abutments against the gate's
 * threshold and the terrace's bank. The moat runs on under its arches as it lies beside it (its water
 * and its level read from the moat's cells beside the bridge), and its deck is walked at the crown's
 * level over it (the layout's decks).
 */
function bridge(s: Site) {
  const { G } = s, a0 = BRIDGE.arches[0][0], a1 = BRIDGE.arches[BRIDGE.arches.length - 1][1];
  const x0 = Math.floor(BRIDGE.x0 - 0.5), x1 = Math.ceil(BRIDGE.x1 + 0.5), z0 = CURTAIN.south + CURTAIN.T / 2;
  for (let z = Math.floor(z0); z < BRIDGE.z1; z++) {
    // The moat as it lies beside the bridge in this row (at whatever level the moat is laid: the
    // deck is walked at the crown's level over it).
    const side = G.idx(x0 - 1, z), wet = !!G.l.fluid[side];
    for (let x = x0; x < x1; x++) {
      const i = G.idx(x, z);
      // (The deck's cells stay walkable over the water; the parapets' stand blocked.)
      if (x >= BRIDGE.deck[0] && x < BRIDGE.deck[1]) G.l.cells[i] = Cell.Ground;
      if (!wet) continue;
      if (z >= a0 && z < a1) G.l.fluid[i] = G.l.fluid[side];
      s.level[i] = s.level[side];
      G.l.ground[i] = Ground.Cave;
      G.l.elev[i] = 0;
    }
  }
  (G.l.decks ??= []).push({ box: [BRIDGE.x0 - 0.5, z0, BRIDGE.x1 + 0.5, BRIDGE.z1], y: CROWN_Y });
  const cx = (BRIDGE.x0 + BRIDGE.x1) / 2, cz = (z0 + BRIDGE.z1) / 2;
  // (Founded on the moat's bed, its foot on a course line of the crown's, so its courses run on level with the gate's.)
  const foot = CROWN_Y - COURSE * Math.ceil((CROWN_Y - MOAT.bed) / COURSE);
  s.prop('castle_bridge', cx, cz, 0, 0, {
    y: foot,
    opt: { hw: (BRIDGE.x1 - BRIDGE.x0) / 2 + 0.45, z0: z0 - cz, z1: BRIDGE.z1 - cz, arches: BRIDGE.arches.map(([p, q]) => [p - cz, q - cz]), spring: BRIDGE.spring - foot, deck: CROWN_Y - foot },
  });
}

/**
 * The crown-level parapets along the moat's outer bank, round the bridge's foot, round the bastion
 * and along the brink, a capped pier at every angle and end and at least every 8 m, lanterns on the
 * piers nearest the plan's lamps (and at the stair's head, where the climb's west wall ends in one).
 */
function parapets(s: Site) {
  /** Every pier: where it stands, and the ways the runs ending in it leave it (radians). */
  const piers: { x: number; z: number; v: number; dirs: number[] }[] = [];
  const pier = (x: number, z: number, dir: number) => {
    const at = piers.find((q) => Math.hypot(q.x - x, q.z - z) < 0.45);
    if (at) at.dirs.push(dir);
    else piers.push({ x, z, v: 0, dirs: [dir] });
  };
  const dirOf = (a: number[], b: number[]) => Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
  const P = APPROACH.parapets, deck = (BRIDGE.deck[0] + BRIDGE.deck[1]) / 2;
  // (Each run's outer face looks away from the paving it guards: the bridge's deck, the gate
  // terrace, the lookout, the landing, or the ledge's middle beside it.)
  const ledge = (m: Vec2): Vec2 =>
    m.x > 72 && m.x < 100 && m.z > 151 ? { x: 86, z: 150.4 } : m.x < 31.4 ? { x: 28.6, z: 146.6 } : m.x > 136.4 ? { x: 145.8, z: 143.6 } : { x: m.x, z: 145.6 };
  const runs: { pts: [number, number][]; inside: (m: Vec2) => Vec2 }[] = [
    { pts: P.innerWest, inside: ledge },
    { pts: P.innerEast, inside: ledge },
    { pts: [[BRIDGE.x0, BRIDGE.z0], [BRIDGE.x0, P.innerWest[1][1]]], inside: () => ({ x: deck, z: 138 }) },
    { pts: [[BRIDGE.x1, BRIDGE.z0], [BRIDGE.x1, P.innerEast[0][1]]], inside: () => ({ x: deck, z: 138 }) },
    { pts: P.outerWest, inside: ledge },
    { pts: P.outerEast, inside: ledge },
    { pts: P.landing, inside: ledge },
  ];
  for (const { pts, inside } of runs) {
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      // At least a pier every 8 m: a long run is broken into equal lengths.
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 8));
      for (let j = 0; j < n; j++) {
        const p = [a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n], q = [a[0] + ((b[0] - a[0]) * (j + 1)) / n, a[1] + ((b[1] - a[1]) * (j + 1)) / n];
        parapet(s, { x: p[0], z: p[1] }, { x: q[0], z: q[1] }, inside({ x: (p[0] + q[0]) / 2, z: (p[1] + q[1]) / 2 }));
        pier(p[0], p[1], dirOf(p, q));
        pier(q[0], q[1], dirOf(q, p));
      }
    }
  }
  const head = CLIMB.walls[0][CLIMB.walls[0].length - 1];
  for (const [x, z] of [...APPROACH.lamps, head]) {
    let best = piers[0];
    for (const p of piers) if (Math.hypot(p.x - x, p.z - z) < Math.hypot(best.x - x, best.z - z)) best = p;
    best.v = 2;
  }
  for (const p of piers) {
    // (Turned square to the run it ends, or halfway between the two runs it joins.)
    let rot = p.dirs[0];
    if (p.dirs.length >= 2) {
      const d = p.dirs[1] - p.dirs[0], turn = d - Math.round(d / (Math.PI / 2)) * (Math.PI / 2);
      rot = p.dirs[0] + turn / 2;
    }
    s.prop('parapet_pier', p.x, p.z, rot, 0.6, { y: CROWN_Y, v: p.v || undefined });
  }
}

/** A parapet from a to b on the crown, its outer face (local +Z) away from `inside`, the cells under it blocked. */
function parapet(s: Site, a: Vec2, b: Vec2, inside: Vec2) {
  const L = Math.hypot(b.x - a.x, b.z - a.z), rot = runRot(a, b, inside), cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
  // (Running from the middle of one pier to the middle of the next, its ends buried in both.)
  s.prop('parapet', cx, cz, rot, 0, { len: Math.max(0.2, L - 0.02), y: CROWN_Y });
  // (The cells under it are its own: blocked, and no road under it.)
  s.G.rect(cx, cz, L / 2, 0.45, rot, (i) => {
    s.block(i);
    s.G.l.ground[i] = Ground.Cave;
  });
}
