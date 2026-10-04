import * as THREE from 'three';
import { mulberry32 } from '../../core/rng';
import type { Crown } from './crown';
import { compact, trim } from './grow';
import { along, arcAtHeight, lengthOf, range, type Skeleton } from './skeleton';
import type { Species } from './species';

/**
 * Dead trees (the natural style's dead ash, trees.ts): a tree grown as the living ones are (grow.ts),
 * then killed. Its leaves are gone and its top has snapped off; some limbs have snapped partway out,
 * most of its small branches have fallen, and of those left some are broken off short and some have
 * lost their tips. It keeps the girth it grew to, so every break is a blunt, ragged end (breaks.ts),
 * and it stands stiff in the wind.
 */

/**
 * The ash as it grew, before it died: about 8.5 m, a straight trunk under an open crown of four or
 * five long crooked limbs climbing steeply, their shoots curving up at the tips.
 */
export const DEAD_ASH: Species = {
  height: [8.0, 9.0],
  spread: [6.0, 7.2],
  crownBase: 0.32,
  trunk: 0.34,
  tip: 0.022,
  fork: [2.6, 3.2],
  limbs: [4, 5],
  rise: [0.62, 1.12],
  crook: 0.4,
  every: 0.48,
  fan: [0.55, 1.05],
  spray: [1.0, 1.3],
  sprayEvery: 0.42,
  fill: [0.2, 0.4],
  roots: 5,
  // (Its bark laid as finely as the oak's and the common tree's: a tile 0.6 m round, DEAD_BARK's 0.9 m up.)
  bark: 0.6,
  leaf: 'oval',
  arch: 0.08,
};

/** How a dead tree has broken up. */
export interface Death {
  /** Where its leader snapped, as a share of its height. */
  top: [number, number];
  /** The chance each main limb snapped partway out, and where along it (a share of its length). */
  snap: number;
  snapAt: [number, number];
  /** The share of its branches still on it; of those, the share broken off short, and of the rest (and of its unsnapped limbs) the share that lost their tips. */
  keep: number;
  stubs: number;
  tips: number;
}

/** Wood with no crown over it (no leaves shade the inner wood: woodGeometry). */
const OPEN: Crown = { centre: new THREE.Vector3(0, -1e4, 0), r: 1e-3, up: 1e-3, down: 1e-3, lumps: [], taper: 0 };

/** Kill a grown tree as `death` says (seeded): it keeps its trunk, roots and girth; see the file comment. */
export function killTree(sk: Skeleton, seed: number, death: Death): Skeleton {
  const rng = mulberry32(seed * 3301 + 17);
  const { limbs } = sk;
  const kids: number[][] = limbs.map(() => []);
  limbs.forEach((L, i) => L.parent >= 0 && kids[L.parent].push(i));
  const dead = new Set<number>();
  const drop = (i: number) => {
    dead.add(i);
    kids[i].forEach(drop);
  };
  /** Snap limb i at arc length s (or lose it whole where too little of it would stand), its branches past the break falling with it. */
  const snap = (i: number, s: number) => {
    const L = limbs[i], start = L.joint ? L.joint.ring : 0.6;
    const r = along(L.radius, L, s), room = Math.max(0.05, r * 2) + 0.06;
    if (s < start + room) return drop(i);
    for (const c of kids[i]) if (!dead.has(c) && limbs[c].joint && limbs[c].joint!.s + limbs[c].joint!.h > s - room) drop(c);
    trim(L, s, []);
    L.broken = Math.floor(rng() * 1e6);
  };
  snap(0, arcAtHeight(limbs[0], sk.height * range(rng, death.top)));
  limbs.forEach((L, i) => {
    if (L.order !== 1 || dead.has(i)) return;
    if (rng() < death.snap) snap(i, lengthOf(L) * range(rng, death.snapAt));
    else if (rng() < death.tips) snap(i, lengthOf(L) * range(rng, [0.75, 0.92]));
  });
  limbs.forEach((L, i) => {
    if (L.order !== 2 || dead.has(i)) return;
    if (rng() > death.keep) return drop(i);
    const len = lengthOf(L), start = L.joint ? L.joint.ring : 0;
    if (rng() < death.stubs) snap(i, Math.min(len * 0.6, start + range(rng, [0.25, 0.6])));
    else if (rng() < death.tips) snap(i, len * range(rng, [0.55, 0.9]));
  });
  // Dead wood is stiff: it moves half as much in the wind.
  for (const L of limbs) L.sway = L.sway.map((w) => w * 0.5);
  const kept = limbs.filter((_, i) => !dead.has(i));
  const height = Math.max(...kept.flatMap((L) => L.path.map((p) => p.y)));
  return compact({ limbs, dead }, [], OPEN, sk.roots, height, sk.species, sk.dropped);
}
