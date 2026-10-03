import { CURTAIN_WALL, GATEHOUSE } from '../../data/castle';
import type { Vec2 } from '../../types';
import { blockDisc, Cell } from '../layout';
import { CROWN_Y, CURTAIN, CURTAIN_CORNERS, CURTAIN_RUNS, GATE, TOWERS } from './plan';
import type { Site } from './site';

/**
 * The curtain, its twelve towers and the gatehouse: each run of wall cut where a
 * tower or the gatehouse stands on it (the wall dying into the drum, its walk at a doorway), every
 * tower opening onto the walks that reach it.
 */

type Tower = (typeof TOWERS)[number];
/** Half the gatehouse's length along the curtain: the curtain runs into its drums as into any tower's. */
const GATE_HALF = GATEHOUSE.cx + Math.sqrt(GATEHOUSE.R ** 2 - (CURTAIN_WALL.T / 2) ** 2) - 0.08;

export function curtain(s: Site) {
  const { G } = s;
  /** Where the curtain's wall walks come to each tower: [bearing, offset] of each doorway onto them. */
  const walks = new Map<Tower, [number, number][]>();
  /** The outward normals of the faces each tower stands on (it looks out between them). */
  const outward = new Map<Tower, Vec2>();
  /** A tower's foot, or a drum's: its disc blocked, on the crown. */
  const footing = (x: number, z: number, r: number) => {
    blockDisc(G.l, x, z, r);
    G.blob(x, z, r, 0, (i) => {
      s.level[i] = CROWN_Y;
      G.reserved[i] = 1;
    });
  };
  /**
   * A straight stretch of curtain from a to b; `ends` flags what it meets (1 / 2 a tower at a / b; 16 /
   * 32 the curtain's corner at a / b, where its walk turns onto the next run's).
   */
  const nearCorner = (p: Vec2) => CURTAIN_CORNERS.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < 6);
  const wallSeg = (a: Vec2, b: Vec2, ends: number) => {
    const L = Math.hypot(b.x - a.x, b.z - a.z), rot = Math.atan2(-(b.z - a.z), b.x - a.x);
    if (L < 0.2) return;
    const p = G.prop('castle_wall', (a.x + b.x) / 2, (a.z + b.z) / 2, rot);
    p.len = L;
    p.v = ends | (nearCorner(a) ? 16 : 0) | (nearCorner(b) ? 32 : 0);
  };
  for (const [a, b] of CURTAIN_RUNS) {
    const L = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / L, uz = (b.z - a.z) / L, rot = Math.atan2(-uz, ux);
    const pt = (t: number) => ({ x: a.x + ux * t, z: a.z + uz * t });
    const along = (p: Vec2) => (p.x - a.x) * ux + (p.z - a.z) * uz;
    /** How far a point stands out from the wall's line, away from the bailey (whose side is (-uz, ux)). */
    const out = (p: Vec2) => -((p.x - a.x) * -uz + (p.z - a.z) * ux);
    const towers = TOWERS.filter((tw) => out(tw) >= -0.01 && out(tw) < tw.r && along(tw) > -tw.r && along(tw) < L + tw.r);
    const gate = Math.abs(out(GATE)) < 0.01 && along(GATE) > 0 && along(GATE) < L;
    // Every end dies into a drum, cut where the wall's inner face meets it (at a corner, the corner
    // tower's, the two runs meeting inside it and in the corner's angle).
    const cuts = [
      ...(gate ? [{ t: along(GATE), half: GATE_HALF, tower: null as Tower | null }] : []),
      ...towers.map((tw) => ({ t: along(tw), half: Math.sqrt(tw.r * tw.r - (out(tw) + CURTAIN.T / 2) ** 2) - 0.08, tower: tw })),
    ].sort((p, q) => p.t - q.t);
    const corner = (p: Vec2) => CURTAIN_CORNERS.some((c) => c.x === p.x && c.z === p.z);
    // (A north run runs a hair into the keep's flank: its end buried in the keep's wall, and too
    // little of it in there for any of its faces to lie over one of the keep's.)
    const cross = Math.abs(uz) < 0.5, lo = corner(a) ? (cross ? CURTAIN.T / 2 : 0) : -0.09, hi = corner(b) ? (cross ? L - CURTAIN.T / 2 : L) : L + 0.09;
    // (At a corner the north or south run is built against the inner face of the west or east run,
    // which dies into the corner tower's drum; its walk opens into the tower, theirs turns the corner
    // onto it.)
    const opens = (tw: Tower | null) => !!tw && !(tw.corner && cross);
    let t0 = lo, prev = 0;
    /** A tower's doorway onto the walk of the run leaving it along `sgn` × the run (the walk on the bailey side). */
    const walkFrom = (tw: Tower, sgn: number) => {
      const bearing = Math.atan2(ux * sgn, uz * sgn);
      // (The walk's middle, CURTAIN_WALL.walkOff toward the bailey from the wall's line, measured
      // across the doorway from the drum's centre.)
      const wx = a.x - uz * CURTAIN_WALL.walkOff - tw.x, wz = a.z + ux * CURTAIN_WALL.walkOff - tw.z;
      walks.set(tw, [...(walks.get(tw) ?? []), [bearing, wx * Math.cos(bearing) - wz * Math.sin(bearing)]]);
    };
    /** The tower the stretch being laid starts in (its walk opens into it), if any. */
    let from: Tower | null = null;
    for (const c of cuts) {
      const e = Math.min(hi, c.t - c.half), into = e === c.t - c.half;
      if (e > t0 + 0.2) {
        wallSeg(pt(t0), pt(e), prev | (into && (!c.tower || opens(c.tower)) ? 2 : 0));
        if (opens(from)) walkFrom(from!, 1);
        if (into && opens(c.tower)) walkFrom(c.tower!, -1);
      }
      if (!c.tower) {
        const m = pt(c.t), gp = G.prop('outer_gatehouse', m.x, m.z, rot);
        gp.len = GATE.pass;
        gp.opt = { ...GATEHOUSE };
        for (const sx of [-1, 1]) {
          const j = pt(c.t + sx * (GATE.pass / 2 + (c.half - GATE.pass / 2) / 2));
          s.blockRect(j.x, j.z, (c.half - GATE.pass / 2) / 2, 1.1, rot);
          footing(GATE.x + ux * sx * GATEHOUSE.cx, GATE.z + uz * sx * GATEHOUSE.cx, GATEHOUSE.R);
        }
      }
      if (c.t + c.half > t0) {
        t0 = c.t + c.half;
        prev = !c.tower || opens(c.tower) ? 1 : 0;
        from = c.tower;
      }
    }
    if (hi - t0 > 0.2) {
      // (A north run ends in the keep's flank, square, with no tower.)
      wallSeg(pt(t0), pt(hi), prev);
      if (opens(from)) walkFrom(from!, 1);
    }
    for (const tw of towers) {
      const o = outward.get(tw) ?? { x: 0, z: 0 };
      outward.set(tw, { x: o.x + uz, z: o.z - ux });
    }
    // The wall's footprint: the cells within reach of its base course, on the crown and closed off
    // (save the gate's passage).
    G.rect((a.x + b.x) / 2, (a.z + b.z) / 2, L / 2, CURTAIN.T / 2 + 0.5, rot, (i, x) => {
      if (gate && Math.abs(x + 0.5 - GATE.x) < GATE.pass / 2) return;
      G.l.cells[i] = Cell.Blocked;
      G.l.fluid[i] = 0;
      s.level[i] = CROWN_Y;
      G.reserved[i] = 1;
    });
  }
  for (const t of TOWERS) {
    const p = G.prop(t.corner ? 'corner_tower' : 'round_tower', t.x, t.z);
    p.len = t.r;
    p.v = t.H;
    const o = outward.get(t)!;
    p.opt = { walks: walks.get(t) ?? [], out: Math.atan2(o.x, o.z) };
    footing(t.x, t.z, t.r);
  }
  // The gate front's flags: the gatehouse's own, and one on each of the south face's wall towers
  // either side of it, flying outward.
  for (const t of TOWERS.filter((tw) => !tw.corner && tw.z > GATE.z)) {
    const p = G.prop('tower_flag', t.x, t.z);
    p.len = Math.sign(t.x - GATE.x);
    p.v = t.H;
  }
}
