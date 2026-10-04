import * as THREE from 'three';
import { clamp, mulberry32 } from '../../core/rng';
import { crownDepth, crownNormal, narrow, reach, toEnvelope, type Crown } from './crown';
import { compact, pipeModel, sway, trim } from './grow';
import { planJoints } from './joints';
import { arcAtHeight, around, crooked, frames, lengthOf, limb, pointOn, range, smoothPath, sphere, tangentOn, UP, type Limb, type Skeleton, type Spray } from './skeleton';
import type { Species } from './species';
import { TRUNK_FOOT } from './trunkFoot';

/**
 * Growing a bush (the natural style's undergrowth, trees.ts) the way the trees grow, from the ground
 * up: a low dome it fills, a root crown under the soil with several stems rising out of the ground
 * round a middle one and fanning up and out, side shoots reaching to the dome all over it (and a
 * shoot grown into any part of it left bare), leaf sprays clothing every shoot's outer part right
 * down to the ground, and radii by the pipe model, from the root crown to every twig.
 */

/**
 * A broadleaf bush about 1.6 m tall and 2.1 m across at its own size (the woods set them at half to
 * full size): five to seven stems leaving its root crown under the ground, a dome of leaf sprays
 * reaching down to the grass.
 */
export const BUSH: Species = {
  height: [1.45, 1.7],
  spread: [1.9, 2.3],
  crownBase: -0.12,
  trunk: 0.075,
  tip: 0.006,
  fork: [-0.46, -0.06],
  limbs: [5, 7],
  rise: [0.92, 1.32],
  crook: 0.3,
  every: 0.24,
  fan: [0.7, 1.2],
  spray: [0.42, 0.55],
  sprayEvery: 0.13,
  fill: [0.42, 0.5],
  roots: 0,
  bark: 0.12,
  leaf: 'bush',
  clear: 0.05,
  head: 0.02,
  arch: 0.02,
};

/** Grow one bush of a species from a seed (Species as for the trees: `fork` is where its stems leave the root crown, under the ground). */
export function growShrub(sp: Species, seed: number): Skeleton {
  const rng = mulberry32(seed * 6271 + 5);
  const H = range(rng, sp.height), R = range(rng, sp.spread) / 2;
  // (The dome's foot lies under the ground, so it sits broad on the grass rather than on a point.)
  const top = H - 0.06, bottom = H * sp.crownBase, cy = bottom + (top - bottom) * 0.42;
  const crown: Crown = {
    centre: new THREE.Vector3((rng() - 0.5) * 0.2, cy, (rng() - 0.5) * 0.2),
    r: R, up: top - cy, down: cy - bottom,
    lumps: [[0.13, 3, 0.8, rng() * 6.28], [0.08, 5, -1.1, rng() * 6.28], [0.06, 2, 2.2, rng() * 6.28]],
    taper: sp.taper ?? 0,
  };
  const limbs: Limb[] = [];
  // The middle stem: up out of the root crown, leaning a little, through the dome to under its top.
  const leanA = rng() * Math.PI * 2, lean = new THREE.Vector3(Math.cos(leanA), 0, Math.sin(leanA)).multiplyScalar(sp.lean ?? 0.12);
  const bole = [new THREE.Vector3(0, TRUNK_FOOT, 0), new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(lean.x * 0.3, 0.12, lean.z * 0.3)];
  const rise = crooked(rng, bole[2], lean.clone().add(UP).normalize(), Math.max(0.4, top - 0.35 - 0.12), 0.24, sp.crook * 0.6, 0.03, crown, -1);
  limbs.push(limb(0, -1, 0, smoothPath([...bole, ...rise.slice(1)], 0.05)));
  const trunk = limbs[0];
  frames(trunk, new THREE.Vector3(1, 0, 0));

  // The stems: leaving the root crown under the ground round it by the golden angle, rising steeply
  // and fanning out, each reaching most of the way to the dome from where it comes out of the ground.
  const n = Math.round(range(rng, sp.limbs)), a0 = rng() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const at = arcAtHeight(trunk, sp.fork[0] + (sp.fork[1] - sp.fork[0]) * t + (rng() - 0.5) * 0.04);
    const az = a0 + i * 2.39996 + (rng() - 0.5) * 0.5, up = range(rng, sp.rise);
    const base = pointOn(trunk, at), dir = new THREE.Vector3(Math.cos(az) * Math.cos(up), Math.sin(up), Math.sin(az) * Math.cos(up));
    const ground = base.clone().addScaledVector(dir, (0.05 - base.y) / dir.y);
    const len = ground.distanceTo(base) + Math.max(0.35, toEnvelope(crown, ground, dir) * range(rng, [0.72, 0.9]));
    limbs.push(limb(1, 0, at, smoothPath(crooked(rng, base, dir, len, 0.2, sp.crook, 0.02, null, -1), 0.05)));
  }
  for (let i = 1; i < limbs.length; i++) frames(limbs[i], tangentOn(trunk, limbs[i].at));

  // Side shoots off the stems and the middle one, spiralling round each, reaching to the dome.
  const shoot = (pi: number, s0: number, s1: number) => {
    const P = limbs[pi];
    let phi = rng() * Math.PI * 2;
    for (let s = s0 + rng() * sp.every * 0.5; s < s1; s += sp.every * (0.75 + rng() * 0.5)) {
      phi += 2.39996 + (rng() - 0.5) * 0.7;
      const base = pointOn(P, s), T = tangentOn(P, s), fan = range(rng, sp.fan);
      if (base.y < 0.1) continue;
      const out = base.clone().sub(crown.centre).setY(0);
      if (out.lengthSq() > 1e-6) out.normalize();
      const d = T.clone().multiplyScalar(Math.cos(fan)).addScaledVector(around(T, UP, phi), Math.sin(fan)).addScaledVector(out, 0.35).addScaledVector(UP, 0.05).normalize();
      if (d.y < -0.45) continue;
      const len = toEnvelope(crown, base, d) * range(rng, [0.9, 1.04]);
      if (len < 0.22) continue;
      limbs.push(limb(2, pi, s, smoothPath(crooked(rng, base, d, len, 0.15, 0.4, sp.arch ?? 0.02, null, -1), 0.04)));
    }
  };
  shoot(0, arcAtHeight(trunk, 0.25), lengthOf(trunk) * 0.95);
  for (let i = 1; i <= n; i++) shoot(i, lengthOf(limbs[i]) * 0.3, lengthOf(limbs[i]) * 0.9);

  // Bare parts of the dome: wherever no shoot ends near the envelope, one grows to it from the
  // nearest point of a stem.
  const outer = () => limbs.flatMap((L) => (L.order === 2 ? L.path.filter((_, i) => L.arc[i] > lengthOf(L) * 0.4) : L.path.slice(Math.floor(L.path.length * 0.7))));
  let ends = outer();
  for (const u of sphere(120)) {
    if (u.y < -0.7) continue;
    const far = reach(crown, u) * 0.88, k = narrow(crown, u.y * far);
    const goal = new THREE.Vector3(u.x * R * k, u.y * (u.y > 0 ? crown.up : crown.down), u.z * R * k).multiplyScalar(far).add(crown.centre);
    if (goal.y < 0.12 || ends.some((p) => p.distanceToSquared(goal) < 0.42 * 0.42)) continue;
    let best: { li: number; s: number; d: number } | null = null;
    for (let li = 0; li <= n; li++) {
      const L = limbs[li], s0 = li === 0 ? arcAtHeight(trunk, 0.3) : lengthOf(L) * 0.3;
      const taken = limbs.filter((c) => c.parent === li).map((c) => c.at);
      for (let i = 0; i < L.path.length; i += 2) {
        if (L.arc[i] < s0 || L.arc[i] > lengthOf(L) * 0.92 || L.path[i].y < 0.1 || taken.some((a) => Math.abs(a - L.arc[i]) < 0.1)) continue;
        const d = L.path[i].distanceTo(goal);
        if (d < 1.6 && (!best || d < best.d)) best = { li, s: L.arc[i], d };
      }
    }
    if (!best) continue;
    const base = pointOn(limbs[best.li], best.s), d = goal.clone().sub(base).normalize();
    if (d.y < -0.45) continue;
    limbs.push(limb(2, best.li, best.s, smoothPath(crooked(rng, base, d, best.d, 0.15, 0.26, sp.arch ?? 0.02, null, -1), 0.04)));
    ends = outer();
  }

  // Leaf sprays: pairs along the outer part of every shoot and stem and a pair over each tip (the
  // middle stem's too), facing out of the dome; none deep inside it, where the stems show.
  const sprays: Spray[] = [];
  const cn = new THREE.Vector3();
  limbs.forEach((L, li) => {
    if (L.order > 0 && !L.tangent.length) frames(L, tangentOn(limbs[L.parent], L.at));
    const len = lengthOf(L);
    let phi = rng() * Math.PI * 2;
    for (let s = len * (L.order === 2 ? 0.15 : 0.45) + rng() * 0.05; s < len - 0.06; s += sp.sprayEvery * (0.8 + rng() * 0.4)) {
      phi += 2.39996;
      for (const turn of [0, Math.PI + (rng() - 0.5) * 0.8]) {
        const T = tangentOn(L, s), radial = around(T, UP, phi + turn);
        const at = pointOn(L, s).addScaledVector(radial, range(rng, [0.02, 0.06]));
        const depth = crownDepth(crown, at);
        if (depth < (at.y > crown.centre.y ? sp.fill[0] : sp.fill[1]) || at.y < (sp.clear ?? 3)) continue;
        const dir = T.clone().addScaledVector(radial, 0.75).addScaledVector(crownNormal(crown, at, cn), 0.5).addScaledVector(UP, 0.1).normalize();
        sprays.push({ at, dir, size: range(rng, sp.spray) * (0.85 + 0.2 * clamp(depth, 0, 1)), sway: 0, limb: li, s });
      }
    }
    const T = tangentOn(L, len), tip = pointOn(L, len);
    for (const turn of [0, 2.3]) {
      const dir = T.clone().addScaledVector(around(T, UP, phi + turn), 0.35).addScaledVector(crownNormal(crown, tip, cn), 0.35).normalize();
      sprays.push({ at: tip.clone().addScaledVector(T, -0.05), dir, size: sp.spray[1] * (0.9 + rng() * 0.15), sway: 0, limb: li, s: len });
    }
  });

  // Radii from the root crown (under the ground, below where the stems leave it), and the sway (a
  // bush's twigs move less than a tree's).
  pipeModel(limbs, sprays, sp, sp.fork[0] - 0.12);
  sway(limbs, sprays, 0);
  for (const L of limbs) L.sway = L.sway.map((w) => w * 0.45);
  for (const q of sprays) q.sway *= 0.45;
  // (Its root crown round enough for the stems' collars; stems and shoots, mostly under leaves, thin.)
  for (const L of limbs) {
    L.sides = L.order === 0 ? 11 : L.order === 1 ? 4 : 3;
    const i = L.order === 1 ? L.radius.findIndex((r) => r < L.radius[0] * 0.55) : -1;
    if (i > 0) L.step = { s: L.arc[i], sides: 3 };
  }
  const placed = planJoints(limbs, sprays);
  // A shoot with no leaves along it is left off; one whose outer stretch is bare is cut back to its leaves.
  const bare = limbs.flatMap((L, i) => (L.order === 2 && !sprays.some((q) => q.limb === i && q.s < lengthOf(L) - 1e-6) ? [i] : []));
  const gone = new Set([...placed.dead, ...bare]);
  // A stem that found no room on the root crown under the ground (slid up it to fit) is left off, with its shoots.
  const subtree = (i: number): number[] => [i, ...limbs.flatMap((c, k) => (c.parent === i ? subtree(k) : []))];
  limbs.forEach((L, i) => L.order === 1 && L.path[0].y > 0.05 && subtree(i).forEach((k) => gone.add(k)));
  limbs.forEach((L, i) => {
    if (L.order < 1 || gone.has(i)) return;
    const len = lengthOf(L), mine = sprays.filter((q) => q.limb === i);
    const ends = mine.filter((q) => q.s >= len - 1e-6), sprung = mine.filter((q) => q.s < len - 1e-6).map((q) => q.s);
    if (!ends.length || !sprung.length) return;
    const keep = Math.max(Math.max(...sprung) + 0.12, ...limbs.filter((c) => c.parent === i).map((c) => c.at + 0.2));
    if (keep < len - 0.12) trim(L, keep, ends);
  });
  return compact({ limbs, dead: gone }, sprays, crown, [], H, sp, placed.dead.size);
}
