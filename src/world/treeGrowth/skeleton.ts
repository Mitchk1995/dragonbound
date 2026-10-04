import * as THREE from 'three';
import { clamp, type Rng } from '../../core/rng';
import { crownDepth, type Crown } from './crown';
import type { Species } from './species';

/**
 * A grown tree's skeleton (grow.ts): its limbs, leaf sprays and roots, and the geometry of walking
 * along a limb's centreline and growing a crooked one.
 */

export const UP = new THREE.Vector3(0, 1, 0);

/** Where a branch joins its parent (planJoints). */
export interface Joint {
  /** The hole cut in the parent: its centre (arc length along the parent) and half-height (m). */
  s: number;
  h: number;
  /** The parent's side the hole is centred on, and its half-width in sides. */
  side: number;
  b: number;
  /** Arc length along this branch where its first own ring stands, past the collar. */
  ring: number;
}

export interface Limb {
  /** 0 the trunk (rising through the crown as its leader), 1 a main limb, 2 a branch. */
  order: number;
  /** The limb it grows from (-1 for the trunk), and the arc length along it where its axis leaves the parent's. */
  parent: number;
  at: number;
  /** Dense smooth centreline, base first (a branch's base lies on its parent's axis), and the arc length at each point. */
  path: THREE.Vector3[];
  arc: number[];
  /** Radius, sway weight, unit tangent and bark frame (a normal carried along without twisting) at each point. */
  radius: number[];
  sway: number[];
  tangent: THREE.Vector3[];
  frame: THREE.Vector3[];
  /** Sides of its tube, and where it has thinned enough to go on with fewer (stitched like a collar). */
  sides: number;
  step: { s: number; sides: number } | null;
  joint: Joint | null;
  /** A dead tree's limb snapped off at its end (deadwood.ts): it ends in a jagged break, not a tapering tip; the number seeds its splinters. */
  broken?: number;
}

/** A spray of leaves: where it springs from, which way it grows, its size (m) and sway weight. */
export interface Spray {
  at: THREE.Vector3;
  dir: THREE.Vector3;
  size: number;
  sway: number;
  /** The limb carrying it, and the arc length along it. */
  limb: number;
  s: number;
  /**
   * A weeping tree's hanging strand (Species.weep): the card's place down its strand (0 the top) of its
   * cards, the hem it hangs to (m above the ground), and the strand's top, which every card of it sways
   * from (so the strand moves as one).
   */
  hang?: { drop: number; of: number; hem: number; top: THREE.Vector3 };
}

/**
 * A root: a ridge of the trunk's foot swelling out of the bark from `top` m above the ground and
 * running down and out, `reach` m beyond the bark where it meets the ground, then on down into it.
 * It leaves the trunk at angle `a` round it (in the trunk's bark frame), its flanks easing into the
 * bark `width` m either side of its crest.
 */
export interface Root {
  a: number;
  reach: number;
  width: number;
  top: number;
}

export interface Skeleton {
  /** The species it was grown from. */
  species: Species;
  limbs: Limb[];
  sprays: Spray[];
  crown: Crown;
  roots: Root[];
  /** The tree's height (m). */
  height: number;
  /** Branches that found no room on their parent and were left off. */
  dropped: number;
}

export const range = (rng: Rng, [a, b]: [number, number]) => a + (b - a) * rng();

/** Cumulative arc length along a polyline. */
function arcsOf(path: THREE.Vector3[]) {
  const a = [0];
  for (let i = 1; i < path.length; i++) a.push(a[i - 1] + path[i].distanceTo(path[i - 1]));
  return a;
}

/** The segment holding arc length s, and how far along it. */
export function seg(arc: number[], s: number): [number, number] {
  const n = arc.length;
  if (s <= 0) return [0, 0];
  if (s >= arc[n - 1]) return [n - 2, 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (arc[m] <= s) lo = m;
    else hi = m;
  }
  return [lo, (s - arc[lo]) / Math.max(1e-9, arc[lo + 1] - arc[lo])];
}

export const lengthOf = (L: Limb) => L.arc[L.arc.length - 1];

export function pointOn(L: Limb, s: number, out = new THREE.Vector3()) {
  const [i, f] = seg(L.arc, s);
  return out.copy(L.path[i]).lerp(L.path[i + 1], f);
}

export function tangentOn(L: Limb, s: number, out = new THREE.Vector3()) {
  const [i, f] = seg(L.arc, s);
  return out.copy(L.tangent[i]).lerp(L.tangent[i + 1], f).normalize();
}

/** The bark frame's normal at s, square to the tangent. */
export function normalOn(L: Limb, s: number, t: THREE.Vector3, out = new THREE.Vector3()) {
  const [i, f] = seg(L.arc, s);
  out.copy(L.frame[i]).lerp(L.frame[i + 1], f);
  return out.addScaledVector(t, -out.dot(t)).normalize();
}

export function along(values: number[], L: Limb, s: number) {
  const [i, f] = seg(L.arc, s);
  return values[i] + (values[i + 1] - values[i]) * f;
}

/** Sides of a tube of radius r: round enough up close, cheap where thin. */
export const sidesFor = (r: number) => clamp(Math.round(2.4 + r * 22), 3, 12);

/** Sides of a limb's tube at arc length s. */
export const sidesAt = (L: Limb, s: number) => (L.step && s >= L.step.s ? L.step.sides : L.sides);

/** A random unit vector square to d. */
export function perpendicular(d: THREE.Vector3, rng: Rng) {
  const v = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).cross(d);
  return v.lengthSq() < 1e-8 ? new THREE.Vector3(1, 0, 0).cross(d).normalize() : v.normalize();
}

/** A unit vector square to d, turned `a` radians round d from the one nearest `ref`. */
export function around(d: THREE.Vector3, ref: THREE.Vector3, a: number) {
  const n = ref.clone().addScaledVector(d, -ref.dot(d));
  if (n.lengthSq() < 1e-8) n.set(1, 0, 0).addScaledVector(d, -d.x);
  return n.normalize().applyAxisAngle(d, a);
}

/**
 * A crooked growth path from `from` along `dir`: steps of about `step` m, each turning by up to
 * `crook` radians about a random axis and lifted a little by `pull`. Inside a crown, a step that
 * would leave the envelope turns back toward its centre instead. Below `floor` (m) a step heading
 * down levels out (a tree's limbs never droop to the ground; a bush's arch over toward it).
 */
export function crooked(rng: Rng, from: THREE.Vector3, dir: THREE.Vector3, len: number, step: number, crook: number, pull: number, crown: Crown | null, floor = 2.8) {
  const nodes = [from.clone()];
  const d = dir.clone().normalize();
  const inward = new THREE.Vector3();
  for (let s = 0; s < len - 1e-3;) {
    const l = Math.min(len - s, step * (0.7 + rng() * 0.6));
    const last = nodes[nodes.length - 1];
    const next = last.clone().addScaledVector(d, l);
    if (crown && nodes.length > 1 && crownDepth(crown, next) > 1) {
      d.addScaledVector(inward.subVectors(crown.centre, next).normalize(), 0.7).normalize();
      next.copy(last).addScaledVector(d, l);
    }
    // Nothing droops to the ground: a limb sinking toward head height levels out instead.
    if (next.y < floor && d.y < 0) {
      d.y = 0.15;
      d.normalize();
      next.copy(last).addScaledVector(d, l);
    }
    nodes.push(next);
    s += l;
    d.applyAxisAngle(perpendicular(d, rng), (rng() * 2 - 1) * crook);
    d.y += pull;
    d.normalize();
  }
  return nodes;
}

/** Growth nodes smoothed into a dense centreline (points about `gap` m apart along it). */
export function smoothPath(nodes: THREE.Vector3[], gap = 0.1) {
  if (nodes.length === 2) {
    const n = Math.max(2, Math.ceil(nodes[0].distanceTo(nodes[1]) / gap));
    return Array.from({ length: n + 1 }, (_, i) => nodes[0].clone().lerp(nodes[1], i / n));
  }
  const curve = new THREE.CatmullRomCurve3(nodes, false, 'centripetal');
  return curve.getSpacedPoints(Math.max(3, Math.ceil(curve.getLength() / gap)));
}

export function limb(order: number, parent: number, at: number, path: THREE.Vector3[]): Limb {
  const n = path.length;
  return { order, parent, at, path, arc: arcsOf(path), radius: new Array(n).fill(0), sway: new Array(n).fill(0), tangent: [], frame: [], sides: 4, step: null, joint: null };
}

/** Tangents along a limb's centreline, and a bark frame carried along it without twisting from `ref`. */
export function frames(L: Limb, ref: THREE.Vector3) {
  const n = L.path.length;
  L.tangent = L.path.map((_, i) => new THREE.Vector3().subVectors(L.path[Math.min(n - 1, i + 1)], L.path[Math.max(0, i - 1)]).normalize());
  const N = around(L.tangent[0], ref, 0);
  const q = new THREE.Quaternion();
  L.frame = [N.clone()];
  for (let i = 1; i < n; i++) {
    q.setFromUnitVectors(L.tangent[i - 1], L.tangent[i]);
    N.applyQuaternion(q).addScaledVector(L.tangent[i], -N.dot(L.tangent[i])).normalize();
    L.frame.push(N.clone());
  }
}

/** The arc length along the trunk where it reaches height y. */
export function arcAtHeight(L: Limb, y: number) {
  for (let i = 1; i < L.path.length; i++) {
    if (L.path[i].y >= y) {
      const f = (y - L.path[i - 1].y) / Math.max(1e-6, L.path[i].y - L.path[i - 1].y);
      return L.arc[i - 1] + (L.arc[i] - L.arc[i - 1]) * clamp(f, 0, 1);
    }
  }
  return lengthOf(L);
}

/** Even directions over a sphere (Fibonacci lattice). */
export function sphere(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * 2.39996323;
    return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  });
}
