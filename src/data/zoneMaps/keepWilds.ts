import { distToPoly } from '../../world/gen';
import { Cell, Ground } from '../../world/layout';
import { FARM } from '../../world/castle/plan';
import { inPoly, P } from './helpers';
import { ISLAND, type KeepBuild } from './keepPlan';
import { nearCastle } from './keepCastle';

/** Rock outcrops, buttresses and crags along the tear faces; then the woods. */
export function growWilds({ G, level, site, w, h }: KeepBuild, outline: number[][]) {
  // ─── Rock: outcrops, and crags along the fresh tear faces ─────────────────────
  // Rock rises only on open, unclaimed ground (never a road, yard, building or lawn kept open), and
  // never on the castle's crown or by its stair.
  const rock = (i: number, height: number) => {
    if (G.l.cells[i] !== Cell.Ground || G.l.fluid[i] || G.reserved[i] === 1 || G.reserved[i] === 3) return;
    if (nearCastle((i % w) + 0.5, Math.floor(i / w) + 0.5)) return;
    G.l.cells[i] = Cell.Cliff;
    G.l.ground[i] = Ground.Cave;
    G.l.elev[i] = Math.max(0.9, height);
  };
  for (const [x, z, r, hgt] of [[268, 190, 3.0, 2.2], [262, 226, 2.4, 1.8], [26.2, 151.5, 2.6, 2.0], [292, 160, 2.6, 2.4], [204, 222, 2.2, 1.6]]) {
    G.blob(x, z, r, 1.0, (i, _x, _z, t) => rock(i, hgt * (1.1 - t * 0.5)));
  }
  // Buttresses: at irregular intervals along the foot of every tall face (the castle rock, the
  // upland's scarps), a spur of the same rock runs out over the ground below, high where it leaves
  // the face and stepping down toward its nose, so the cliffs stand on great roots of rock and their
  // foot wanders in and out instead of running straight. None reaches a road, a kept lawn, the
  // pool, the castle's stair or the farm.
  {
    const tallFace = (i: number) => G.l.cells[i] === Cell.Cliff && G.l.elev[i] > 4.5;
    const taken = new Set<string>();
    const spurs: number[][] = [];
    for (let z = 2; z < h - 2; z++) for (let x = 2; x < w - 2; x++) {
      const i = G.idx(x, z);
      if (G.l.cells[i] !== Cell.Ground || G.l.fluid[i] || G.reserved[i]) continue;
      let ox = 0, oz = 0, hi = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const j = G.idx(x + dx, z + dz);
        if (!tallFace(j)) continue;
        ox -= dx;
        oz -= dz;
        hi = Math.max(hi, level[j] + G.l.elev[j] - level[i]);
      }
      const ol = Math.hypot(ox, oz);
      if (hi < 5 || ol < 0.5) continue;
      if (nearCastle(x + 0.5, z + 0.5)) continue;
      const key = `${Math.floor((x + G.noise(z * 0.2, 3) * 6) / 11)},${Math.floor((z + G.noise(x * 0.2, 7) * 6) / 11)}`;
      if (taken.has(key)) continue;
      taken.add(key);
      if (G.rng() < 0.3) continue;
      spurs.push([x + 0.5, z + 0.5, ox / ol, oz / ol, hi]);
    }
    for (const [x, z, ox, oz, hi] of spurs) {
      const len = 2.5 + G.rng() * 4, wide = 1.4 + G.rng() * 1.4, bend = (G.rng() - 0.5) * 0.6;
      for (let t = 0; t <= len; t += 0.5) {
        const f = t / len, a = bend * f;
        const dx = ox * Math.cos(a) - oz * Math.sin(a), dz = ox * Math.sin(a) + oz * Math.cos(a);
        G.blob(x + dx * t, z + dz * t, wide * (1 - f * 0.55), 0.4, (i) => rock(i, hi * (0.85 - 0.6 * f) - 1));
      }
    }
  }
  // The tear faces are fresh rock: a broken lip of crags along the north and west edges; the old
  // weathered edges keep only the odd crag between the woods.
  const voidD = G.distance((i) => G.l.cells[i] === Cell.Void);
  const tears: number[][][] = [];
  for (let k = 0; k < outline.length; k++) {
    const [, , kind] = ISLAND.outline[k];
    if (kind === 't') tears.push([outline[k], outline[(k + 1) % outline.length]]);
  }
  const nearTear = (x: number, z: number) => tears.some(([a, b]) => distToPoly(x, z, P([a, b])).d < 7);
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const i = G.idx(x, z), d = voidD[i];
    if (d === 0 || d > 6) continue;
    const clump = G.noise(x * 0.09 + 50, z * 0.09 + 50);
    const tear = nearTear(x + 0.5, z + 0.5);
    if (clump < (tear ? 0.38 : 0.62)) continue;
    const band = 1 + (clump - 0.38) * 10;
    if (d < band) rock(i, Math.min(2.0, (1.3 + (clump - 0.4) * 5 - d * 0.25) * (tear ? 1 : 0.7)));
  }

  // ─── Woods ─────────────────────────────────────────────────────────────────
  // Block-canopy woods on the rim belts and toward the edges; small groves break up the lawns.
  const belts = [
    [[266, 52], [278, 70], [290, 96], [296, 120], [288, 136], [276, 110], [264, 72]],
    [[262, 206], [276, 206], [272, 230], [260, 238], [240, 236], [232, 228], [250, 218]],
    [[122, 230], [150, 232], [162, 238], [138, 240], [124, 236]],
    [[22, 166], [36, 168], [46, 174], [40, 188], [28, 184]],
  ];
  for (const [gx, gz, r] of [[202, 152, 3.4], [212, 200, 3.0], [150, 216, 2.8], [218, 226, 3.2], [296, 180, 3.0], [256, 180, 3.4],
    [166, 152, 2.6], [208, 142, 2.8], [222, 172, 3.2], [230, 206, 2.8], [194, 226, 3.0], [154, 230, 2.4], [80, 202, 3.0], [94, 206, 2.6], [238, 156, 2.6], [270, 160, 2.8], [186, 74, 2.6], [240, 84, 3.0]]) {
    G.blob(gx, gz, r, 1, (i) => {
      if (G.l.cells[i] === Cell.Ground && !G.reserved[i] && G.rng() < 0.6) G.l.cells[i] = Cell.Tree;
    });
  }
  G.scatter((x, z) => {
    if (nearCastle(x, z)) return 0;
    const d = voidD[G.idx(Math.floor(x), Math.floor(z))];
    const near = Math.max(0, 1 - (d - 3) / 9);
    const belt = belts.some((b) => inPoly(x, z, b)) ? 0.5 : 0;
    return near * 0.4 * (0.4 + G.noise(x * 0.07 + 20, z * 0.07) * 1.1) + belt + (G.noise(x * 0.08, z * 0.08) > 0.68 ? 0.07 : 0);
  }, 0);
  // The farm's hay paddock stays open grass inside its fence (no tree or bush seeded in it).
  site.cells(FARM.fence, (i) => {
    if (G.l.cells[i] === Cell.Tree) G.l.cells[i] = Cell.Ground;
  });
  // No fins or needles: a rock cell standing more than a few metres above the ground on both
  // opposite sides of it (a one-cell ridge between two lower places) is cut down to just above the
  // higher of them, so every crag has a body behind it.
  for (let pass = 0; pass < 3; pass++) for (let z = 1; z < h - 1; z++) for (let x = 1; x < w - 1; x++) {
    const i = G.idx(x, z);
    if (G.l.cells[i] !== Cell.Cliff) continue;
    const top = (j: number) => (G.l.cells[j] === Cell.Void ? -Infinity : level[j] + (G.l.cells[j] === Cell.Cliff ? G.l.elev[j] : 0));
    const t = top(i);
    let cap = Infinity;
    for (const [a, b] of [[i - 1, i + 1], [i - w, i + w]]) if (top(a) < t - 3 && top(b) < t - 3) cap = Math.min(cap, Math.max(top(a), top(b), level[i]) + 1.2);
    if (cap < t) G.l.elev[i] = Math.max(0.9, cap - level[i]);
  }
}
