import type { Vec2 } from '../../types';
import { Cell, Ground } from '../layout';
import { APPROACH, BRIDGE, CLIMB, CROWN_Y, CURTAIN } from './plan';
import { runRot, type Site } from './site';

/**
 * The approach: from the ore lane the climb's four flights up the rock's south-east corner to the
 * ledge, then everything at the crown's level, the ledge road west between its walls to the gate
 * terrace and the bridge over the moat to the gate, the landing at the stair's head and the ledge
 * walk on west to the lookout on the knoll.
 */

/**
 * The approach's levels (laid before the rock is cut, so the cliffs form round them and never on
 * them): the ledge, the gate terrace with its bastion, the landing, the lookout and the bridge's deck
 * paved at the crown's level; the climb's flights graded at their own pitch between level landings.
 */
export function levels(s: Site) {
  for (const box of [APPROACH.ledgeRoad, APPROACH.ledgeWalk, APPROACH.gateTerrace]) s.ground(box, CROWN_Y, Ground.Stone);
  for (const poly of [APPROACH.landing, APPROACH.lookout]) s.within(poly, (i) => s.open(i, CROWN_Y, Ground.Stone));
  s.ground([BRIDGE.x0 - 0.5, CURTAIN.south + CURTAIN.T / 2 - 0.1, BRIDGE.x1 + 0.5, BRIDGE.z1], CROWN_Y, Ground.Cave);
  s.pave([BRIDGE.deck[0], CURTAIN.south, BRIDGE.deck[1], BRIDGE.z1]);
  // The crown runs on solid under every wall along the brink (the cliff starts a cell beyond its
  // outer face), clear of the stair's flights and landings.
  const P = APPROACH.parapets, stair = [...CLIMB.flights.map((f) => f.rect), ...CLIMB.landings.map((l) => l.rect)];
  for (const run of [P.outerWest, P.outerEast, P.landing]) for (let k = 0; k < run.length - 1; k++) {
    const [ax, az] = run[k], [bx, bz] = run[k + 1];
    s.cells([Math.min(ax, bx) - 2, Math.min(az, bz) - 2, Math.max(ax, bx) + 2, Math.max(az, bz) + 2], (i, x, z) => {
      const px = x + 0.5, pz = z + 0.5, L2 = (bx - ax) ** 2 + (bz - az) ** 2, t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / L2));
      if (Math.hypot(px - ax - (bx - ax) * t, pz - az - (bz - az) * t) > 1.3 || s.G.l.cells[i] === Cell.Void) return;
      if (stair.some(([x0, z0, x1, z1]) => x >= x0 - 1 && x < x1 + 1 && z >= z0 - 1 && z < z1 + 1)) return;
      if (s.G.reserved[i] !== 1) s.open(i, CROWN_Y, Ground.Grass);
    });
  }
  for (const f of CLIMB.flights) {
    const [x0, z0, x1, z1] = f.rect;
    s.cells(f.rect, (i, x, z) => {
      // How far up the flight this row is, foot (0) to head (1), at the cell's middle.
      const t = f.up === 'n' ? (z1 - (z + 0.5)) / (z1 - z0) : f.up === 's' ? (z + 0.5 - z0) / (z1 - z0) : f.up === 'w' ? (x1 - (x + 0.5)) / (x1 - x0) : (x + 0.5 - x0) / (x1 - x0);
      s.open(i, f.y0 + (f.y1 - f.y0) * t, Ground.Stone);
    });
  }
  for (const l of CLIMB.landings) s.ground(l.rect, l.y, Ground.Stone);
  // The ore lane past the stair's foot and the lane between the stair and the smelter stay open,
  // and so does the ground at the foot of the stair's outer walls (no rock heaped against them).
  s.ground([123, 120, 128, 131], 0, Ground.Grass);
  s.ground([112, 121, 123, 126], 0, Ground.Grass);
  s.ground([134, 116, 136, 131], 0, Ground.Grass);
}

/**
 * The walls of the approach: the climb's walls (a cell thick, their copings raking with the flights
 * and level over the landings, standing on the lane), and the crown-level parapets along the moat's
 * outer bank, round the bridge and along the brink, a capped pier at every angle and end.
 */
export function walls(s: Site) {
  /** Every pier: where it stands, its foot, and the ways the runs ending in it leave it (radians). */
  const piers: { x: number; z: number; y: number; v: number; dirs: number[] }[] = [];
  const pier = (x: number, z: number, y: number, dir: number, v = 0) => {
    const at = piers.find((q) => Math.hypot(q.x - x, q.z - z) < 0.45);
    if (at) at.dirs.push(dir);
    else piers.push({ x, z, y, v, dirs: [dir] });
  };
  const dirOf = (a: number[], b: number[]) => Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
  for (const [k, w] of CLIMB.walls.entries()) {
    s.wall(w, 0, false);
    // (A lantern on a pier at each foot on the lane, and at the head of the west run on the ledge;
    // the east run ends in the dressed rock face.)
    pier(w[0][0], w[0][1], 0, dirOf(w[0], w[1]), 2);
    const e = w[w.length - 1];
    if (k === 0) pier(e[0], e[1], CROWN_Y, dirOf(e, w[w.length - 2]), 2);
  }
  // The rock face over the last two flights and the turning landing is dressed straight: a wall a
  // cell thick from each flight's treads up to the landing's paving over it.
  {
    const face = CLIMB.face, cx = face.reduce((a, q) => a + q[0], 0) / face.length;
    const p = s.prop('ramp_wall', cx, face[0][1], 0, 0, { y: 0 });
    p.opt = { pts: face.map(([x, z]) => [x - cx, z - face[0][1]]), ys: face.map((q) => q[2]), tops: face.map(() => CROWN_Y), w: 1.0 };
    // (The cells under it step down to the treads below, so the treads run level to its foot.)
    s.cells([face[0][0], face[0][1] - 0.5, face[face.length - 1][0], face[0][1] + 0.5], (i) => {
      s.block(i, s.level[i + s.w]);
      s.G.l.elev[i] = 0;
      s.G.l.ground[i] = Ground.Cave;
    });
  }
  const P = APPROACH.parapets, deck = (BRIDGE.deck[0] + BRIDGE.deck[1]) / 2;
  // (Each run's outer face looks away from the paving it guards: the bridge's deck, the gate
  // terrace, the lookout, the landing, or the ledge's middle beside it.)
  const ledge = (m: Vec2): Vec2 =>
    m.x > 65 && m.x < 87 && m.z > 116 ? { x: 76, z: 114 } : m.x < 34 ? { x: 32, z: 113 } : m.x > 114 ? { x: 122, z: 111 } : { x: m.x, z: 112 };
  const runs: { pts: [number, number][]; inside: (m: Vec2) => Vec2 }[] = [
    { pts: P.innerWest, inside: ledge },
    { pts: P.innerEast, inside: ledge },
    { pts: [[BRIDGE.x0, BRIDGE.z0], [BRIDGE.x0, P.innerWest[1][1]]], inside: () => ({ x: deck, z: 105 }) },
    { pts: [[BRIDGE.x1, BRIDGE.z0], [BRIDGE.x1, P.innerEast[0][1]]], inside: () => ({ x: deck, z: 105 }) },
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
        pier(p[0], p[1], CROWN_Y, dirOf(p, q));
        pier(q[0], q[1], CROWN_Y, dirOf(q, p));
      }
    }
  }
  for (const p of piers) {
    // (Turned square to the run it ends, or halfway between the two runs it joins.)
    let rot = p.dirs[0];
    if (p.dirs.length >= 2) {
      const d = p.dirs[1] - p.dirs[0], turn = d - Math.round(d / (Math.PI / 2)) * (Math.PI / 2);
      rot = p.dirs[0] + turn / 2;
    }
    s.prop('parapet_pier', p.x, p.z, rot, 0.6, { y: p.y, v: p.v || undefined });
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
