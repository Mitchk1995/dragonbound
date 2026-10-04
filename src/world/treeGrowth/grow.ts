import * as THREE from 'three';
import { clamp, mulberry32 } from '../../core/rng';
import { crownDepth, crownNormal, narrow, reach, toEnvelope, type Crown } from './crown';
import { planJoints } from './joints';
import { along, arcAtHeight, around, crooked, frames, lengthOf, limb, perpendicular, pointOn, range, seg, sidesFor, smoothPath, sphere, tangentOn, UP, type Limb, type Root, type Skeleton, type Spray } from './skeleton';
import type { Species } from './species';
import { footFlare, TRUNK_FOOT } from './trunkFoot';

/** Growing a tree from a seed: its crown, trunk, limbs, branches, roots and leaf sprays, and their radii and sway. */

/** Grow one tree of a species from a seed. */
export function growTree(sp: Species, seed: number): Skeleton {
  const rng = mulberry32(seed * 7919 + 13);
  const H = range(rng, sp.height), R = range(rng, sp.spread) / 2;
  // (The envelope's top stands a little under the tree's height: the topmost sprays reach past it.)
  const top = H - 0.9, bottom = H * sp.crownBase, cy = bottom + (top - bottom) * 0.5;
  const crown: Crown = {
    centre: new THREE.Vector3((rng() - 0.5) * 0.9, cy, (rng() - 0.5) * 0.9),
    r: R, up: top - cy, down: cy - bottom,
    lumps: [[0.09, 3, 0.7, rng() * 6.28], [0.06, 5, -1.2, rng() * 6.28], [0.05, 2, 2.4, rng() * 6.28]],
    taper: sp.taper ?? 0,
  };
  const limbs: Limb[] = [];

  // The trunk: up from below the ground to the fork, leaning a little, then on through the crown as
  // a crooked leader ending under its top.
  const fork = range(rng, sp.fork);
  const leanA = rng() * Math.PI * 2, lean = new THREE.Vector3(Math.cos(leanA), 0, Math.sin(leanA));
  // (A leaning tree's crown leans over with it.)
  const leans = (sp.lean ?? 0.24) / 0.24;
  if (sp.lean !== undefined) crown.centre.addScaledVector(lean, (sp.lean - 0.24) * 1.6);
  const bole = [new THREE.Vector3(0, TRUNK_FOOT, 0), new THREE.Vector3(0, 0.6, 0), new THREE.Vector3(lean.x * 0.1 * leans, fork * 0.6, lean.z * 0.1 * leans), new THREE.Vector3(lean.x * 0.24 * leans, fork, lean.z * 0.24 * leans)];
  const leaderDir = lean.clone().multiplyScalar(0.28 * leans).add(UP).normalize();
  const leader = crooked(rng, bole[3], leaderDir, H - 1.8 - rng() * 0.8 - fork, 1.0, 0.2, 0.08, crown);
  limbs.push(limb(0, -1, 0, smoothPath([...bole, ...leader.slice(1)])));
  const trunk = limbs[0];
  frames(trunk, new THREE.Vector3(1, 0, 0));

  // Main limbs, spiralling up round the fork by the golden angle, the lowest the flattest.
  const n = Math.round(range(rng, sp.limbs)), a0 = rng() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const at = arcAtHeight(trunk, fork - 0.7 + t * 1.6 + (rng() - 0.5) * 0.15);
    const az = a0 + i * 2.39996 + (rng() - 0.5) * 0.45, rise = sp.rise[0] + (sp.rise[1] - sp.rise[0]) * t + (rng() - 0.5) * 0.12;
    const base = pointOn(trunk, at);
    const dir = new THREE.Vector3(Math.cos(az) * Math.cos(rise), Math.sin(rise), Math.sin(az) * Math.cos(rise));
    const len = Math.max(3.5, toEnvelope(crown, base, dir) * range(rng, [0.74, 0.86]));
    // (A weeping tree's limbs arch over as they spread.)
    limbs.push(limb(1, 0, at, smoothPath(crooked(rng, base, dir, len, 1.0, sp.crook, sp.weep ? -0.03 : 0.05, crown))));
  }
  for (let i = 1; i < limbs.length; i++) frames(limbs[i], tangentOn(trunk, limbs[i].at));

  // Side branches off the limbs and the leader, spiralling round each by the golden angle, every
  // one reaching out to the envelope; those that would turn down into the shade never grow.
  const branchOff = (pi: number, s0: number, s1: number) => {
    const P = limbs[pi];
    let phi = rng() * Math.PI * 2;
    for (let s = s0 + rng() * sp.every * 0.5; s < s1; s += sp.every * (0.75 + rng() * 0.5)) {
      phi += 2.39996 + (rng() - 0.5) * 0.7;
      const base = pointOn(P, s), T = tangentOn(P, s);
      const fan = range(rng, sp.fan);
      const out = base.clone().sub(crown.centre).setY(0);
      if (out.lengthSq() > 1e-6) out.normalize();
      const d = T.clone().multiplyScalar(Math.cos(fan)).addScaledVector(around(T, UP, phi), Math.sin(fan)).addScaledVector(UP, 0.14).addScaledVector(out, 0.25).normalize();
      if (d.y < -0.3) continue;
      const len = toEnvelope(crown, base, d) * range(rng, [0.92, 1.04]);
      if (len < 0.6) continue;
      limbs.push(limb(2, pi, s, smoothPath(crooked(rng, base, d, len, 0.6, 0.36, sp.arch ?? 0.03, null))));
    }
  };
  branchOff(0, arcAtHeight(trunk, fork + 0.7), lengthOf(trunk) * 0.97);
  // (A limb's last stretch carries no side branch: its own end sprays clothe it.)
  for (let i = 1; i <= n; i++) branchOff(i, lengthOf(limbs[i]) * 0.26, lengthOf(limbs[i]) * 0.85);

  // Bare parts of the dome: wherever the envelope has no branch end near it, a branch grows to it
  // from the nearest point of a limb or the leader.
  const outer = () => limbs.flatMap((L) => (L.order === 2 ? L.path.filter((_, i) => L.arc[i] > lengthOf(L) * 0.4) : L.order === 1 ? L.path.slice(Math.floor(L.path.length * 0.7)) : []));
  let ends = outer();
  for (const u of sphere(160)) {
    if (u.y < -0.55) continue;
    const far = reach(crown, u) * 0.9, k = narrow(crown, u.y * far);
    const goal = new THREE.Vector3(u.x * R * k, u.y * (u.y > 0 ? crown.up : crown.down), u.z * R * k).multiplyScalar(far).add(crown.centre);
    if (ends.some((p) => p.distanceToSquared(goal) < 1.7 * 1.7)) continue;
    let best: { li: number; s: number; d: number } | null = null;
    for (let li = 0; li <= n; li++) {
      const L = limbs[li], s0 = li === 0 ? arcAtHeight(trunk, fork + 0.5) : lengthOf(L) * 0.25;
      // (Never right beside a branch already there: their collars would crowd each other.)
      const taken = limbs.filter((c) => c.parent === li).map((c) => c.at);
      for (let i = 0; i < L.path.length; i += 2) {
        if (L.arc[i] < s0 || L.arc[i] > lengthOf(L) * 0.95 || taken.some((a) => Math.abs(a - L.arc[i]) < 0.32)) continue;
        const d = L.path[i].distanceTo(goal);
        if (d < 6 && (!best || d < best.d)) best = { li, s: L.arc[i], d };
      }
    }
    if (!best) continue;
    const base = pointOn(limbs[best.li], best.s), d = goal.clone().sub(base).normalize();
    if (d.y < -0.3) continue;
    limbs.push(limb(2, best.li, best.s, smoothPath(crooked(rng, base, d, best.d, 0.7, 0.22, sp.arch ?? 0.03, null))));
    ends = outer();
  }

  // Roots: ridges of the trunk's own foot (woodGeometry), each swelling out of the bark and running
  // down and out into the ground, round the trunk at about even angles. (They draw from a sequence
  // of their own; the leaves go on with the draws they have always been grown with.)
  const rr = mulberry32(seed * 3571 + 29), g = sp.trunk / 0.55, ra0 = rr() * Math.PI * 2;
  for (let k = 0; k < 1 + 3 * sp.roots; k++) rng();
  const roots: Root[] = Array.from({ length: sp.roots }, (_, k) => ({
    a: ra0 + ((k + (rr() - 0.5) * 0.5) / sp.roots) * Math.PI * 2,
    reach: range(rr, [0.45, 0.75]) * g,
    width: range(rr, [0.45, 0.6]) * sp.trunk,
    top: range(rr, [0.7, 1.0]) * Math.min(1, 0.4 + 0.6 * g),
  }));

  // Leaf clusters along the outer part of every branch and at the limbs' ends: at each station a
  // pair of sprays leaving the branch either way, and a pair closing over its tip, so the leaves
  // clothe the branch ends and hide them, as an oak's foliage masses on its outer shoots. None deep
  // inside the crown, where only the wood shows.
  const sprays: Spray[] = [];
  const out = new THREE.Vector3();
  /** A hanging strand from `at` down to the hem: a chain of cards, each a little over its share long (they overlap). */
  const strand = (at: THREE.Vector3, li: number, s: number, weep: NonNullable<Species['weep']>) => {
    const len = at.y - range(rng, weep.hem);
    const away = crownNormal(crown, at, new THREE.Vector3()).setY(0);
    if (len < 0.8 || away.lengthSq() < 1e-4) return false;
    const dir = new THREE.Vector3(0, -1, 0).addScaledVector(away.normalize(), 0.1).addScaledVector(perpendicular(UP, rng), 0.05).normalize();
    const n = Math.max(1, Math.round(len / weep.card)), step = len / n / -dir.y, top = at.clone();
    for (let k = 0; k < n; k++) sprays.push({ at: at.clone().addScaledVector(dir, step * k), dir: dir.clone(), size: step * 1.08, sway: 0, limb: li, s, hang: { drop: k, of: n, hem: at.y - len, top: top.clone() } });
    return true;
  };
  limbs.forEach((L, li) => {
    if (L.order < 1) return;
    if (!L.tangent.length) frames(L, tangentOn(limbs[L.parent], L.at));
    const len = lengthOf(L);
    let phi = rng() * Math.PI * 2;
    // (A weeping tree's limbs are clothed from a third of the way out.)
    for (let s = len * (L.order === 2 ? 0.22 : sp.weep ? 0.35 : 0.6) + rng() * 0.15; s < len - 0.25; s += sp.sprayEvery * (0.8 + rng() * 0.4)) {
      phi += 2.39996;
      for (const turn of [0, Math.PI + (rng() - 0.5) * 0.8]) {
        const T = tangentOn(L, s), radial = around(T, UP, phi + turn);
        const at = pointOn(L, s).addScaledVector(radial, range(rng, [0.04, 0.16]));
        const depth = crownDepth(crown, at);
        // None deep in the lower crown, where the wood shows from the side; the upper crown fills in
        // further (sp.fill), so from the play camera above it reads as one leafy dome. None hang low
        // enough to brush the hero's head.
        if (depth < (at.y > crown.centre.y ? sp.fill[0] : sp.fill[1]) || at.y < (sp.clear ?? 3)) continue;
        // A weeping tree's outer branches let fall strands of leaves (its upper crown keeps sprays too).
        if (sp.weep && depth > 0.55 && strand(at, li, s, sp.weep) && at.y < crown.centre.y + crown.up * 0.35) continue;
        const dir = T.clone().addScaledVector(radial, 0.75).addScaledVector(crownNormal(crown, at, out), 0.4).addScaledVector(UP, 0.15).normalize();
        sprays.push({ at, dir, size: range(rng, sp.spray) * (0.85 + 0.2 * clamp(depth, 0, 1)), sway: 0, limb: li, s });
      }
    }
    const T = tangentOn(L, len), tip = pointOn(L, len);
    for (const turn of [0, 2.3]) {
      const dir = T.clone().addScaledVector(around(T, UP, phi + turn), 0.35).addScaledVector(crownNormal(crown, tip, out), 0.3).normalize();
      sprays.push({ at: tip.clone().addScaledVector(T, -0.15), dir, size: sp.spray[1] * (0.9 + rng() * 0.15), sway: 0, limb: li, s: len });
    }
  });

  pipeModel(limbs, sprays, sp);
  sway(limbs, sprays, fork);
  for (const L of limbs) {
    L.sides = L.order === 0 ? clamp(Math.round(8 + sp.trunk * 13), 10, 15) : sidesFor(L.radius[0]);
    // The trunk above its fork and each main limb's outer half go on with fewer sides.
    const clear = L.order === 0 ? Math.max(...limbs.filter((c) => c.order === 1).map((c) => c.at)) + 1.2 : 0;
    const i = L.order === 0 ? L.radius.findIndex((r, k) => L.arc[k] > clear && r < sp.trunk * 0.5) : L.order === 1 ? L.radius.findIndex((r) => r < L.radius[0] * 0.6) : -1;
    if (i > 0 && sidesFor(L.radius[i]) < L.sides) L.step = { s: L.arc[i], sides: sidesFor(L.radius[i]) };
  }
  const placed = planJoints(limbs, sprays);
  // (A strand whose branch was turned down near its hem is left off.)
  const hung = sprays.filter((q) => !q.hang || q.hang.top.y > q.hang.hem + 0.6);
  // A branch that carries no leaves but the pair at its tip (it runs under the leaves' lowest reach,
  // or deep in the crown) is a bare stick with a lone tuft, poking out of the crown's side: it is
  // left off (once every branch is placed, so the rest stand as they grew).
  const bare = limbs.flatMap((L, i) => (L.order === 2 && !hung.some((q) => q.limb === i && q.s < lengthOf(L) - 1e-6) ? [i] : []));
  // One whose outer stretch carries none (it ran on under them) is cut back to just past its last
  // leaves, its tip's pair carried in with it, so no bare twig reaches out to a lone tuft.
  const gone = new Set([...placed.dead, ...bare]), live = hung.filter((q) => !gone.has(q.limb));
  limbs.forEach((L, i) => {
    if (L.order < 1 || gone.has(i)) return;
    const len = lengthOf(L), tip = L.path[L.path.length - 1], mine = live.filter((q) => q.limb === i);
    const ends = mine.filter((q) => q.s >= len - 1e-6), sprung = mine.filter((q) => q.s < len - 1e-6).map((q) => q.s);
    // (A strand's cards are counted at its top: they are hung plumb from there later.)
    if (!ends.length || !sprung.length || live.some((q) => !ends.includes(q) && (q.hang?.drop ?? 0) === 0 && q.at.distanceTo(tip) < 1.2)) return;
    const keep = Math.max(Math.max(...sprung) + 0.35, ...limbs.filter((c) => c.parent === i).map((c) => c.at + 0.5));
    if (keep < len - 0.3) trim(L, keep, ends);
  });
  // And a branch whose few leaves stand off on their own, clear of the rest of the crown, is a stray
  // twig with a tuft at its end: it is left off too.
  limbs.forEach((L, i) => {
    if (L.order !== 2 || gone.has(i)) return;
    const mine = live.filter((q) => q.limb === i);
    if (mine.length <= 8 && mine.every((q) => live.every((o) => o.limb === i || gone.has(o.limb) || (o.hang?.drop ?? 0) > 0 || o.at.distanceTo(q.at) > 1))) gone.add(i);
  });
  // (Only the branches that found no place count as dropped.)
  const sk = compact({ limbs, dead: gone }, hung, crown, roots, H, sp, placed.dead.size);
  // Strands hang plumb from wherever their branch was set (planJoints may have turned it).
  for (const s of sk.sprays) {
    if (!s.hang) continue;
    const { drop, of, hem, top } = s.hang, d = s.dir, out = Math.hypot(d.x, d.z);
    d.set(out > 1e-6 ? (d.x / out) * 0.1 : 0, -1, out > 1e-6 ? (d.z / out) * 0.1 : 0).normalize();
    const step = Math.max(0.5, top.y - hem) / of / -d.y;
    s.at.copy(top).addScaledVector(d, step * drop);
    s.size = step * 1.08;
  }
  return sk;
}

/**
 * Radii by the pipe model: at any point a limb carries the leaf sprays beyond it (and its own
 * tip), and its radius grows as a power of that load, the power set so the trunk is the species'
 * girth at breast height (`breast` m up; a bush's at its root crown). Steps where branches leave
 * are smoothed into a continuous taper, and the trunk flares toward its foot.
 */
export function pipeModel(limbs: Limb[], sprays: Spray[], sp: Species, breast = 1.3) {
  const total = new Array(limbs.length).fill(0);
  const kids: number[][] = limbs.map(() => []);
  limbs.forEach((L, i) => L.parent >= 0 && kids[L.parent].push(i));
  const load: number[][] = limbs.map(() => []);
  for (let li = limbs.length - 1; li >= 0; li--) {
    const L = limbs[li];
    const own = sprays.filter((s) => s.limb === li).map((s) => s.s);
    load[li] = L.arc.map((a) => 1 + own.filter((x) => x >= a).length + kids[li].filter((k) => limbs[k].at >= a).reduce((t, k) => t + total[k], 0));
    total[li] = load[li][0];
  }
  const trunk = limbs[0];
  const held = load[0][seg(trunk.arc, arcAtHeight(trunk, breast))[0]];
  const q = Math.log(sp.trunk / sp.tip) / Math.log(Math.max(2, held));
  limbs.forEach((L, li) => {
    const raw = load[li].map((x) => sp.tip * Math.pow(x, q));
    // Smoothed over about two radii either way, so forks thin the limb gradually.
    L.radius = raw.map((r, i) => {
      const w = Math.max(0.15, r * 2);
      let sum = 0, wt = 0;
      for (let j = i; j >= 0 && L.arc[i] - L.arc[j] <= w; j--) { sum += raw[j]; wt++; }
      for (let j = i + 1; j < raw.length && L.arc[j] - L.arc[i] <= w; j++) { sum += raw[j]; wt++; }
      return Math.max(sp.tip, sum / wt);
    });
    if (L.order === 0) L.radius = L.radius.map((r, i) => r * footFlare(L.path[i].y));
  });
}

/**
 * Sway weights: the trunk stands still to the fork and its leader barely moves; limbs move a little
 * more toward their ends, branches more again toward their tips, and leaf sprays most.
 */
export function sway(limbs: Limb[], sprays: Spray[], fork: number) {
  limbs.forEach((L) => {
    const len = lengthOf(L);
    if (L.order === 0) L.sway = L.path.map((p) => clamp((p.y - fork) / 12, 0, 1) * 0.3);
    else {
      const base = along(limbs[L.parent].sway, limbs[L.parent], L.at);
      L.sway = L.arc.map((a) => base + (L.order === 1 ? 0.45 : 0.6) * (a / len) + (L.order === 2 ? 0.1 : 0.03));
    }
  });
  for (const s of sprays) s.sway = along(limbs[s.limb].sway, limbs[s.limb], s.s) + 0.15 + (s.hang ? 0.2 + s.hang.drop * 0.25 : 0);
}

/** Cut a limb back to arc length `s`, carrying its tip's sprays in to its new tip. */
export function trim(L: Limb, s: number, tipSprays: Spray[]) {
  const [i, f] = seg(L.arc, s), end = pointOn(L, s), shift = end.clone().sub(L.path[L.path.length - 1]);
  const cut = <T>(a: T[], last: T) => [...a.slice(0, i + 1), last];
  const at = (a: number[]) => a[i] + (a[i + 1] - a[i]) * f;
  L.radius = cut(L.radius, at(L.radius));
  L.sway = cut(L.sway, at(L.sway));
  L.tangent = cut(L.tangent, tangentOn(L, s));
  L.frame = cut(L.frame, L.frame[i + 1].clone());
  L.path = cut(L.path, end);
  L.arc = cut(L.arc, s);
  for (const q of tipSprays) {
    q.at.add(shift);
    q.s = s;
  }
}

/** Drop the limbs that found no place or were left off (and their leaves), renumbering the rest; `dropped` counts those that found no place. */
export function compact({ limbs, dead }: { limbs: Limb[]; dead: Set<number> }, sprays: Spray[], crown: Crown, roots: Root[], height: number, species: Species, dropped: number): Skeleton {
  const map = new Map<number, number>();
  const kept = limbs.filter((_, i) => !dead.has(i));
  limbs.forEach((L, i) => !dead.has(i) && map.set(i, map.size));
  for (const L of kept) if (L.parent >= 0) L.parent = map.get(L.parent)!;
  return {
    species,
    limbs: kept,
    sprays: sprays.filter((s) => !dead.has(s.limb)).map((s) => ({ ...s, limb: map.get(s.limb)! })),
    crown,
    roots,
    height,
    dropped,
  };
}
