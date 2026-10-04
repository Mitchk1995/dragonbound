import * as THREE from 'three';
import { clamp } from '../../core/rng';
import { along, frames, lengthOf, normalOn, pointOn, sidesAt, tangentOn, type Joint, type Limb, type Spray } from './skeleton';

/** Where each branch joins its parent: the hole it cuts there, placed clear of its neighbours (grow.ts). */

interface Hole extends Joint {
  /** Where the branch now leaves its parent's axis, and how far it is turned round the parent (radians). */
  at: number;
  turn: number;
}

/**
 * Place every branch's hole in its parent, top-down so a parent's frame is final before its
 * branches are set on it. A hole spans the branch's footprint on the parent's surface (longer
 * along the parent the shallower the branch leaves it) and must keep at least one quad clear of
 * every other hole; a branch whose hole would crowd another's is slid along its parent or turned
 * round it a side or two (carrying its whole subtree and leaves), and dropped only if nothing fits.
 */
export function planJoints(limbs: Limb[], sprays: Spray[]) {
  const kids: number[][] = limbs.map(() => []);
  limbs.forEach((L, i) => L.parent >= 0 && kids[L.parent].push(i));
  const dead = new Set<number>();
  const subtree = (i: number): number[] => [i, ...kids[i].flatMap(subtree)];
  const queue = [0];
  while (queue.length) {
    const pi = queue.shift()!;
    const P = limbs[pi], placed: Hole[] = [];
    for (const ci of [...kids[pi]].sort((a, b) => limbs[b].radius[0] - limbs[a].radius[0])) {
      const C = limbs[ci];
      let hole: Hole | null = null;
      // (A hole as wide as the branch where it stands, or a main limb's turned a side round; failing that a narrower one, moved as far as it must be.)
      search: for (const narrow of [false, true]) {
        for (const ds of [0, 0.12, -0.12, 0.25, -0.25, 0.45, -0.45, 0.7, -0.7, 1.0, -1.0, 1.4, -1.4]) {
          for (const dj of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
            if (!narrow && (ds !== 0 || Math.abs(dj) > (C.order > 1 ? 0 : 1))) continue;
            // (Turned at most about 50 degrees: a branch is never swung round to grow down.)
            if (Math.abs(dj) * ((Math.PI * 2) / sidesAt(P, C.at + ds)) > 0.9) continue;
            const h = footprint(P, C, ds, dj, narrow);
            if (h && placed.every((o) => apart(o, h, sidesAt(P, h.s)))) {
              hole = h;
              break search;
            }
          }
        }
      }
      if (!hole) {
        for (const i of subtree(ci)) dead.add(i);
        continue;
      }
      moveSubtree(limbs, sprays, subtree(ci), P, C, hole);
      C.at = hole.at;
      C.joint = { s: hole.s, h: hole.h, side: hole.side, b: hole.b, ring: hole.ring };
      frames(C, tangentOn(P, C.at));
      placed.push(hole);
      queue.push(ci);
    }
  }
  return { limbs, dead };
}

/**
 * The hole a branch would cut in its parent if slid ds along it and turned dj sides round it (null
 * if it would not fit on the parent): as wide as the branch where it meets the parent's surface (a
 * narrower hole pinches the branch's foot into a ring), or `narrow`, as wide as the branch against
 * the parent's girth at its axis (lower down, where the parent is thicker).
 */
function footprint(P: Limb, C: Limb, ds: number, dj: number, narrow: boolean): Hole | null {
  const len = lengthOf(P), at = C.at + ds;
  const d0 = tangentOn(C, Math.min(0.25, lengthOf(C) * 0.3));
  const T0 = tangentOn(P, C.at), N0 = normalOn(P, C.at, T0), B0 = new THREE.Vector3().crossVectors(T0, N0);
  const ct = d0.dot(T0), sinA = Math.max(0.35, Math.sqrt(Math.max(0, 1 - ct * ct)));
  const girth = (x: number) => along(P.radius, P, x);
  const rp = girth(at), rc = C.radius[0];
  const exit = rp / sinA, s = at + exit * ct, h = clamp((rc * 1.12) / sinA, rc, rc * 4);
  const start = P.joint ? P.joint.ring + 0.05 : 0.05, end = len - Math.max(0.12, along(P.radius, P, len) * 3);
  if (s - h < start || s + h > end) return null;
  // (A hole never spans the place where its parent drops to fewer sides.)
  if (P.step && s - h < P.step.s + 0.05 && s + h > P.step.s - 0.05) return null;
  const S = sidesAt(P, s), step = (Math.PI * 2) / S;
  const phi = Math.atan2(d0.dot(B0), d0.dot(N0)) + dj * step;
  const side = (((Math.round(phi / step) % S) + S) % S);
  // Half-width in sides: a little over the branch's radius, rounded up (or, narrow, to the nearest side).
  const across = (k: number, r: number) => Math.asin(Math.min(0.92, (rc * k) / r)) / step;
  const b = clamp(narrow ? Math.round(across(1.15, rp)) : Math.ceil(across(1.03, girth(s)) - 0.1), 1, Math.max(1, Math.floor(S / 3)));
  // The first own ring stands clear of the whole rim (a shallow branch's rim runs far along its parent).
  return { at, s, h, side, b, ring: exit + h * Math.abs(ct) + rc * 0.35, turn: dj * step };
}

/** Two holes on one parent keep at least one quad of bark between them. */
function apart(a: Hole, b: Hole, sides: number) {
  if (Math.max(a.s - a.h, b.s - b.h) - Math.min(a.s + a.h, b.s + b.h) > 0.03) return true;
  const d = Math.abs(a.side - b.side) % sides;
  return Math.min(d, sides - d) >= a.b + b.b + 1;
}

/** Carry a branch's subtree (and its leaves) to where its hole was placed: slid along the parent and turned round it. */
function moveSubtree(limbs: Limb[], sprays: Spray[], ids: number[], P: Limb, C: Limb, hole: Hole) {
  const T0 = tangentOn(P, C.at), N0 = normalOn(P, C.at, T0), B0 = new THREE.Vector3().crossVectors(T0, N0);
  const T1 = tangentOn(P, hole.at), N1 = normalOn(P, hole.at, T1), B1 = new THREE.Vector3().crossVectors(T1, N1);
  const from = new THREE.Matrix4().makeBasis(N0, B0, T0).setPosition(pointOn(P, C.at));
  const to = new THREE.Matrix4().makeBasis(N1, B1, T1).setPosition(pointOn(P, hole.at));
  const m = to.multiply(new THREE.Matrix4().makeRotationZ(hole.turn)).multiply(from.invert());
  const rot = new THREE.Matrix3().setFromMatrix4(m);
  const set = new Set(ids);
  for (const i of ids) {
    const L = limbs[i];
    for (const p of L.path) p.applyMatrix4(m);
    for (const v of [...L.tangent, ...L.frame]) v.applyMatrix3(rot).normalize();
  }
  for (const s of sprays) {
    if (!set.has(s.limb)) continue;
    s.at.applyMatrix4(m);
    s.dir.applyMatrix3(rot).normalize();
    s.hang?.top.applyMatrix4(m);
  }
}
