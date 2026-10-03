import * as THREE from 'three';
import { clamp, mulberry32, type Rng } from '../core/rng';
import { SPRAY_CELLS, sprayCell, type LeafKind } from '../render/foliage';

/**
 * Grown trees (the 'natural' tree style, trees.ts): a tree is grown from a seed, never assembled
 * from primitives.
 *
 * - Growth (pure and seeded): a crown envelope (an irregular dome), a trunk rising through it as
 *   its leader, a few crooked main limbs leaving the trunk low, many side branches reaching out to
 *   the envelope (with a pass that grows a branch into any part of the dome left bare), roots
 *   spreading over the ground at the foot, and radii by the pipe model: a limb is as thick as the
 *   leaf sprays it carries, so the wood tapers naturally from the trunk to every tip.
 * - Wood: every limb is a ring-section tube along its smoothed centreline. Where a branch leaves
 *   its parent, the parent's quads under the branch are cut out and the branch's first ring is
 *   stitched to the rim of that hole, so each fork is a real collar flowing out of the parent and
 *   the trunk, roots, limbs and branches are one connected surface.
 * - Leaves: two crossed cards per spray (now and then a third), set facing the sky and the outside
 *   of the crown, each carrying a spray of the species' leaves (foliage.ts) whose twig springs from
 *   the branch; none hang low enough to brush the hero's head. A weeping tree (the willow) also
 *   lets fall strands from its outer branches: chains of cards hanging plumb to a hem, each strand
 *   swaying as one from its top. Their normals swell out of each
 *   branch's leaf mass and out of the crown, so it lights in soft masses, and their vertex colour
 *   carries a painted shade: a darker inner crown, a cool underside and a warm top.
 */

// ─── Species ────────────────────────────────────────────────────────────────

/** The shape of one kind of grown tree; a seed picks one tree of it. */
export interface Species {
  /** Overall height and crown diameter (m): ranges a seed picks from. */
  height: [number, number];
  spread: [number, number];
  /** Height of the crown's lower edge, as a share of the tree's height. */
  crownBase: number;
  /** Trunk radius at breast height, and the radius every branch tip ends at (m). */
  trunk: number;
  tip: number;
  /** Height round which the main limbs leave the trunk (m), and how many there are. */
  fork: [number, number];
  limbs: [number, number];
  /** The lowest and the highest main limb's rise above the horizontal (radians). */
  rise: [number, number];
  /** How crooked limbs grow: the most a limb turns at each step (radians). */
  crook: number;
  /** Side branches: their spacing along a limb (m) and their angle off it (radians). */
  every: number;
  fan: [number, number];
  /** Leaf sprays: their size (m) and their spacing along a branch (m). */
  spray: [number, number];
  sprayEvery: number;
  /** How deep in the crown sprays still grow above and below its middle (crown depth: 0 its centre, 1 its envelope). */
  fill: [number, number];
  /** Roots spreading over the ground at the foot. */
  roots: number;
  /** Girth (m) one bark tile wraps round: a limb takes as many whole tiles as fit its girth at its foot, so its ridges converge as it tapers. */
  bark: number;
  /** The leaves its sprays carry (foliage.ts). */
  leaf: LeafKind;
  /** The lowest a leaf spray springs from (m; 3 when left out), so none hangs low enough to brush the hero's head. */
  clear?: number;
  /** How far the trunk leans off upright by the fork (m; 0.24 when left out), its crown carried over with it. */
  lean?: number;
  /** How much the crown narrows above its middle (0 or left out: a dome; toward 1: a cone). */
  taper?: number;
  /** How far up the trunk its buttresses run, as a multiple of an oak's (1 when left out): a yew's fluted bole. */
  flute?: number;
  /** How side branches bend as they grow (radians a step; 0.03 when left out, a little upward): below 0 they arch over. */
  arch?: number;
  /**
   * A weeping tree's curtain: from the outer branches, strands of leaves hang straight down to a hem
   * (m above the ground, a range), each strand a chain of cards about `card` m long and `width` m wide.
   */
  weep?: { hem: [number, number]; card: number; width: number };
}

/**
 * A mature, open-grown oak, true to size beside the 2 m hero: about 11 m tall with a crown wider
 * than it is tall, a short massive trunk flaring into its roots, and four or five crooked limbs
 * leaving it low and spreading wide, the lowest nearly level.
 */
export const OAK: Species = {
  height: [10.2, 11.4],
  spread: [10.6, 11.8],
  crownBase: 0.26,
  trunk: 0.55,
  tip: 0.03,
  fork: [3.0, 3.6],
  limbs: [4, 5],
  rise: [0.26, 0.92],
  crook: 0.38,
  every: 0.78,
  fan: [0.75, 1.25],
  spray: [1.15, 1.6],
  sprayEvery: 0.5,
  fill: [0.22, 0.45],
  roots: 5,
  bark: 0.7,
  leaf: 'oak',
};

/**
 * The common tree, the first rung of the woodcutting ladder: a young broadleaf about 7.5 m tall,
 * its slim straight trunk running on up through a rounded crown taller than it is wide, five or six
 * limbs climbing steeply out of it and its shoots carrying oval leaves.
 */
export const TREE: Species = {
  height: [7.2, 8.2],
  spread: [5.0, 5.8],
  crownBase: 0.3,
  trunk: 0.3,
  tip: 0.025,
  fork: [2.4, 2.9],
  limbs: [5, 6],
  rise: [0.62, 1.12],
  crook: 0.24,
  every: 0.45,
  fan: [0.6, 1.0],
  spray: [1.05, 1.35],
  sprayEvery: 0.3,
  fill: [0.08, 0.25],
  roots: 4,
  bark: 0.55,
  leaf: 'oval',
};

/**
 * The willow, the ladder's third rung: a weeping willow about 9 m tall with a crown wider than it is
 * tall, its stout, often leaning trunk forking low into a few great limbs that climb and spread, their
 * branches arching over, and from them a curtain of long strands of narrow leaves hanging straight
 * down to just above the hero's head.
 */
export const WILLOW: Species = {
  height: [8.6, 9.8],
  spread: [10.0, 11.6],
  crownBase: 0.34,
  trunk: 0.46,
  tip: 0.02,
  fork: [2.1, 2.7],
  limbs: [4, 5],
  rise: [0.6, 1.05],
  crook: 0.28,
  every: 0.55,
  fan: [0.55, 0.95],
  spray: [1.05, 1.3],
  sprayEvery: 0.38,
  fill: [0.15, 0.6],
  roots: 5,
  bark: 0.6,
  leaf: 'willow',
  lean: 0.55,
  arch: -0.06,
  weep: { hem: [2.35, 3.1], card: 1.55, width: 1.0 },
};

/**
 * The maple, the fourth rung: about 10.5 m tall, a straight grey trunk forking into five or six limbs
 * that climb steeply and spread into a broad, full, rounded dome of lobed leaves (green in summer,
 * red and orange where the zone wears its autumn).
 */
export const MAPLE: Species = {
  height: [10.0, 11.2],
  spread: [9.0, 10.2],
  crownBase: 0.25,
  trunk: 0.42,
  tip: 0.025,
  fork: [2.7, 3.2],
  limbs: [5, 6],
  rise: [0.58, 1.08],
  crook: 0.24,
  every: 0.58,
  fan: [0.65, 1.1],
  spray: [1.15, 1.45],
  sprayEvery: 0.4,
  fill: [0.14, 0.34],
  roots: 5,
  bark: 0.6,
  leaf: 'maple',
  clear: 3.6,
};

/**
 * The yew, the fifth rung: a dark, dense evergreen about 8.7 m tall, its massive fluted red-brown
 * trunk splitting low into many upright limbs under a broad, heavy crown of needle sprays that reaches
 * low and fills right through.
 */
export const YEW: Species = {
  height: [8.2, 9.2],
  spread: [7.6, 8.8],
  crownBase: 0.3,
  trunk: 0.5,
  tip: 0.025,
  fork: [1.7, 2.2],
  limbs: [6, 7],
  rise: [0.62, 1.2],
  crook: 0.3,
  every: 0.5,
  fan: [0.7, 1.15],
  spray: [1.1, 1.4],
  sprayEvery: 0.28,
  fill: [0.0, 0.12],
  roots: 7,
  bark: 0.5,
  leaf: 'yew',
  clear: 3.7,
  taper: 0.3,
  flute: 2.2,
};

/**
 * The magic tree, the top rung and the ladder's one fantasy: a tall, graceful tree about 10.7 m high
 * on a slim, gently leaning pale trunk, its few long limbs sweeping up and out in easy curves into an
 * open, airy crown of glowing teal leaves.
 */
export const MAGIC: Species = {
  height: [10.2, 11.2],
  spread: [8.0, 9.2],
  crownBase: 0.36,
  trunk: 0.34,
  tip: 0.022,
  fork: [3.1, 3.7],
  limbs: [4, 5],
  rise: [0.78, 1.18],
  crook: 0.18,
  every: 0.66,
  fan: [0.5, 0.88],
  spray: [1.1, 1.4],
  sprayEvery: 0.44,
  fill: [0.26, 0.45],
  roots: 5,
  bark: 0.55,
  leaf: 'magic',
  lean: 0.45,
};

// ─── Crown envelope ─────────────────────────────────────────────────────────

/** The crown's envelope: an irregular dome the branches grow to fill. */
export interface Crown {
  centre: THREE.Vector3;
  /** Horizontal radius, and the vertical radii above and below the centre (m). */
  r: number;
  up: number;
  down: number;
  /** Bays and bulges: [amplitude, waves round, tilt with elevation, phase]. */
  lumps: [number, number, number, number][];
  /** How much it narrows above its middle (Species.taper). */
  taper: number;
}

/** The envelope's horizontal radius at a height (dy: up its upper radius, 1 at the top) as a share of its widest. */
const narrow = (c: Crown, dy: number) => (c.taper ? 1 - c.taper * clamp(dy, 0, 1) : 1);

const UP = new THREE.Vector3(0, 1, 0);
const scratch = new THREE.Vector3();

/** How far the envelope reaches toward a unit direction, as a multiple of its ellipsoid. */
function reach(c: Crown, u: THREE.Vector3) {
  const az = Math.atan2(u.z, u.x), el = Math.asin(clamp(u.y, -1, 1));
  let k = 1;
  for (const [a, m, t, ph] of c.lumps) k += a * Math.sin(m * az + t * el + ph);
  return k;
}

/** Where a point sits in the crown: 0 at its centre, 1 on the envelope, more outside it. */
export function crownDepth(c: Crown, p: THREE.Vector3) {
  const dy = (p.y - c.centre.y) / (p.y > c.centre.y ? c.up : c.down), r = c.r * narrow(c, dy);
  const dx = (p.x - c.centre.x) / r, dz = (p.z - c.centre.z) / r;
  const d = Math.hypot(dx, dy, dz);
  return d < 1e-6 ? 0 : d / reach(c, scratch.set(dx, dy, dz).divideScalar(d));
}

/** The envelope's outward direction at a point (its ellipsoid's normal). */
export function crownNormal(c: Crown, p: THREE.Vector3, out = new THREE.Vector3()) {
  const ry = p.y > c.centre.y ? c.up : c.down, r = c.r * narrow(c, (p.y - c.centre.y) / ry);
  out.set((p.x - c.centre.x) / (r * r), (p.y - c.centre.y) / (ry * ry), (p.z - c.centre.z) / (r * r));
  return out.lengthSq() < 1e-12 ? out.set(0, 1, 0) : out.normalize();
}

/** Distance from p along the unit direction u to the envelope (0 when p is already outside it). */
function toEnvelope(c: Crown, p: THREE.Vector3, u: THREE.Vector3) {
  const q = new THREE.Vector3();
  if (crownDepth(c, p) >= 1) return 0;
  let lo = 0, hi = 0.25;
  while (hi < 40 && crownDepth(c, q.copy(p).addScaledVector(u, hi)) < 1) {
    lo = hi;
    hi += 0.25;
  }
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    if (crownDepth(c, q.copy(p).addScaledVector(u, mid)) < 1) lo = mid;
    else hi = mid;
  }
  return lo;
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

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
  /** -1 a root, 0 the trunk (rising through the crown as its leader), 1 a main limb, 2 a branch. */
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

export interface Skeleton {
  /** The species it was grown from. */
  species: Species;
  limbs: Limb[];
  sprays: Spray[];
  crown: Crown;
  /** The tree's height (m). */
  height: number;
  /** Branches that found no room on their parent and were left off. */
  dropped: number;
}

const range = (rng: Rng, [a, b]: [number, number]) => a + (b - a) * rng();

/** Cumulative arc length along a polyline. */
function arcsOf(path: THREE.Vector3[]) {
  const a = [0];
  for (let i = 1; i < path.length; i++) a.push(a[i - 1] + path[i].distanceTo(path[i - 1]));
  return a;
}

/** The segment holding arc length s, and how far along it. */
function seg(arc: number[], s: number): [number, number] {
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

const lengthOf = (L: Limb) => L.arc[L.arc.length - 1];

function pointOn(L: Limb, s: number, out = new THREE.Vector3()) {
  const [i, f] = seg(L.arc, s);
  return out.copy(L.path[i]).lerp(L.path[i + 1], f);
}

function tangentOn(L: Limb, s: number, out = new THREE.Vector3()) {
  const [i, f] = seg(L.arc, s);
  return out.copy(L.tangent[i]).lerp(L.tangent[i + 1], f).normalize();
}

/** The bark frame's normal at s, square to the tangent. */
function normalOn(L: Limb, s: number, t: THREE.Vector3, out = new THREE.Vector3()) {
  const [i, f] = seg(L.arc, s);
  out.copy(L.frame[i]).lerp(L.frame[i + 1], f);
  return out.addScaledVector(t, -out.dot(t)).normalize();
}

function along(values: number[], L: Limb, s: number) {
  const [i, f] = seg(L.arc, s);
  return values[i] + (values[i + 1] - values[i]) * f;
}

/** Sides of a tube of radius r: round enough up close, cheap where thin. */
const sidesFor = (r: number) => clamp(Math.round(2.4 + r * 22), 3, 12);

/** Sides of a limb's tube at arc length s. */
const sidesAt = (L: Limb, s: number) => (L.step && s >= L.step.s ? L.step.sides : L.sides);

/** A random unit vector square to d. */
function perpendicular(d: THREE.Vector3, rng: Rng) {
  const v = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).cross(d);
  return v.lengthSq() < 1e-8 ? new THREE.Vector3(1, 0, 0).cross(d).normalize() : v.normalize();
}

/** A unit vector square to d, turned `a` radians round d from the one nearest `ref`. */
function around(d: THREE.Vector3, ref: THREE.Vector3, a: number) {
  const n = ref.clone().addScaledVector(d, -ref.dot(d));
  if (n.lengthSq() < 1e-8) n.set(1, 0, 0).addScaledVector(d, -d.x);
  return n.normalize().applyAxisAngle(d, a);
}

/**
 * A crooked growth path from `from` along `dir`: steps of about `step` m, each turning by up to
 * `crook` radians about a random axis and lifted a little by `pull`. Inside a crown, a step that
 * would leave the envelope turns back toward its centre instead.
 */
function crooked(rng: Rng, from: THREE.Vector3, dir: THREE.Vector3, len: number, step: number, crook: number, pull: number, crown: Crown | null) {
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
    if (next.y < 2.8 && d.y < 0) {
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
function smoothPath(nodes: THREE.Vector3[], gap = 0.1) {
  if (nodes.length === 2) {
    const n = Math.max(2, Math.ceil(nodes[0].distanceTo(nodes[1]) / gap));
    return Array.from({ length: n + 1 }, (_, i) => nodes[0].clone().lerp(nodes[1], i / n));
  }
  const curve = new THREE.CatmullRomCurve3(nodes, false, 'centripetal');
  return curve.getSpacedPoints(Math.max(3, Math.ceil(curve.getLength() / gap)));
}

function limb(order: number, parent: number, at: number, path: THREE.Vector3[]): Limb {
  const n = path.length;
  return { order, parent, at, path, arc: arcsOf(path), radius: new Array(n).fill(0), sway: new Array(n).fill(0), tangent: [], frame: [], sides: 4, step: null, joint: null };
}

/** Tangents along a limb's centreline, and a bark frame carried along it without twisting from `ref`. */
function frames(L: Limb, ref: THREE.Vector3) {
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
function arcAtHeight(L: Limb, y: number) {
  for (let i = 1; i < L.path.length; i++) {
    if (L.path[i].y >= y) {
      const f = (y - L.path[i - 1].y) / Math.max(1e-6, L.path[i].y - L.path[i - 1].y);
      return L.arc[i - 1] + (L.arc[i] - L.arc[i - 1]) * clamp(f, 0, 1);
    }
  }
  return lengthOf(L);
}

/** Even directions over a sphere (Fibonacci lattice). */
function sphere(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = i * 2.39996323;
    return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  });
}

/** The trunk's buttresses at height y: how far the trunk swells toward a root, as a multiple of its radius (`flute`: Species.flute). */
const buttressSwell = (y: number, flute = 1) => 1 + 0.32 * (1 - THREE.MathUtils.smoothstep(y, -0.1, 1.1 * flute));

/** The trunk's flare toward its foot: its radius there as a multiple of the pipe model's. */
const footFlare = (y: number) => 1 + 0.5 * (1 - THREE.MathUtils.smoothstep(y, -0.2, 1.6));

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
  const bole = [new THREE.Vector3(0, -0.6, 0), new THREE.Vector3(0, 0.6, 0), new THREE.Vector3(lean.x * 0.1 * leans, fork * 0.6, lean.z * 0.1 * leans), new THREE.Vector3(lean.x * 0.24 * leans, fork, lean.z * 0.24 * leans)];
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

  // Roots: leaving the foot a little above the ground, running out over it half buried, then
  // diving under it.
  const rootAt = arcAtHeight(trunk, 0.55), ra0 = rng() * Math.PI * 2;
  for (let k = 0; k < sp.roots; k++) {
    const az = ra0 + (k / sp.roots) * Math.PI * 2 + (rng() - 0.5) * 0.25;
    const out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az)), side = new THREE.Vector3(-out.z, 0, out.x);
    // (Sized by the trunk's girth: an oak's run 1.4 to 2.2 m out from 0.95 m off its axis.)
    const g = sp.trunk / 0.55, base = pointOn(trunk, rootAt), len = range(rng, [1.4, 2.2]) * g, bend = (rng() - 0.5) * 0.5 * g, foot = 0.95 * g;
    limbs.push(limb(-1, 0, rootAt, smoothPath([
      base,
      base.clone().addScaledVector(out, foot).setY(0.16 * g),
      base.clone().addScaledVector(out, foot + len * 0.5).addScaledVector(side, bend * 0.5).setY(-0.02),
      base.clone().addScaledVector(out, foot + len).addScaledVector(side, bend).setY(-0.42),
    ])));
    frames(limbs[limbs.length - 1], tangentOn(trunk, rootAt));
  }

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
    L.sides = L.order === 0 ? clamp(Math.round(8 + sp.trunk * 13), 10, 15) : L.order === -1 ? 5 : sidesFor(L.radius[0]);
    // The trunk above its fork and each main limb's outer half go on with fewer sides.
    const clear = L.order === 0 ? Math.max(...limbs.filter((c) => c.order === 1).map((c) => c.at)) + 1.2 : 0;
    const i = L.order === 0 ? L.radius.findIndex((r, k) => L.arc[k] > clear && r < sp.trunk * 0.5) : L.order === 1 ? L.radius.findIndex((r) => r < L.radius[0] * 0.6) : -1;
    if (i > 0 && sidesFor(L.radius[i]) < L.sides) L.step = { s: L.arc[i], sides: sidesFor(L.radius[i]) };
  }
  const sk = compact(planJoints(limbs, sprays, sp.flute ?? 1), sprays, crown, H, sp);
  // Strands hang plumb from wherever their branch was set (planJoints may have turned it), and one
  // whose branch was turned down near the hem is left off.
  sk.sprays = sk.sprays.filter((s) => !s.hang || s.hang.top.y > s.hang.hem + 0.6);
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
 * girth at breast height. Steps where branches leave are smoothed into a continuous taper; the
 * trunk flares toward its foot, and roots taper by hand.
 */
function pipeModel(limbs: Limb[], sprays: Spray[], sp: Species) {
  const total = new Array(limbs.length).fill(0);
  const kids: number[][] = limbs.map(() => []);
  limbs.forEach((L, i) => L.parent >= 0 && kids[L.parent].push(i));
  const load: number[][] = limbs.map(() => []);
  for (let li = limbs.length - 1; li >= 0; li--) {
    const L = limbs[li];
    if (L.order < 0) continue;
    const own = sprays.filter((s) => s.limb === li).map((s) => s.s);
    load[li] = L.arc.map((a) => 1 + own.filter((x) => x >= a).length + kids[li].filter((k) => limbs[k].order >= 0 && limbs[k].at >= a).reduce((t, k) => t + total[k], 0));
    total[li] = load[li][0];
  }
  const trunk = limbs[0];
  const breast = load[0][seg(trunk.arc, arcAtHeight(trunk, 1.3))[0]];
  const q = Math.log(sp.trunk / sp.tip) / Math.log(Math.max(2, breast));
  limbs.forEach((L, li) => {
    if (L.order < 0) {
      const len = lengthOf(L);
      L.radius = L.arc.map((a) => sp.trunk * 0.44 * (1 - 0.74 * (a / len)));
      return;
    }
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
function sway(limbs: Limb[], sprays: Spray[], fork: number) {
  limbs.forEach((L) => {
    const len = lengthOf(L);
    if (L.order < 0) L.sway = L.arc.map(() => 0);
    else if (L.order === 0) L.sway = L.path.map((p) => clamp((p.y - fork) / 12, 0, 1) * 0.3);
    else {
      const base = along(limbs[L.parent].sway, limbs[L.parent], L.at);
      L.sway = L.arc.map((a) => base + (L.order === 1 ? 0.45 : 0.6) * (a / len) + (L.order === 2 ? 0.1 : 0.03));
    }
  });
  for (const s of sprays) s.sway = along(limbs[s.limb].sway, limbs[s.limb], s.s) + 0.15 + (s.hang ? 0.2 + s.hang.drop * 0.25 : 0);
}

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
function planJoints(limbs: Limb[], sprays: Spray[], flute: number) {
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
            const h = footprint(P, C, ds, dj, narrow, flute);
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
function footprint(P: Limb, C: Limb, ds: number, dj: number, narrow: boolean, flute: number): Hole | null {
  const len = lengthOf(P), at = C.at + ds;
  const d0 = tangentOn(C, Math.min(0.25, lengthOf(C) * 0.3));
  const T0 = tangentOn(P, C.at), N0 = normalOn(P, C.at, T0), B0 = new THREE.Vector3().crossVectors(T0, N0);
  const ct = d0.dot(T0), sinA = Math.max(0.35, Math.sqrt(Math.max(0, 1 - ct * ct)));
  // (A root leaves the trunk through the buttress swelling toward it.)
  const girth = (x: number) => along(P.radius, P, x) * (C.order < 0 ? buttressSwell(pointOn(P, x).y, flute) : 1);
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

/** Drop the limbs that found no place (and their leaves), renumbering the rest. */
function compact({ limbs, dead }: { limbs: Limb[]; dead: Set<number> }, sprays: Spray[], crown: Crown, height: number, species: Species): Skeleton {
  const map = new Map<number, number>();
  const kept = limbs.filter((_, i) => !dead.has(i));
  limbs.forEach((L, i) => !dead.has(i) && map.set(i, map.size));
  for (const L of kept) if (L.parent >= 0) L.parent = map.get(L.parent)!;
  return {
    species,
    limbs: kept,
    sprays: sprays.filter((s) => !dead.has(s.limb)).map((s) => ({ ...s, limb: map.get(s.limb)! })),
    crown,
    height,
    dropped: dead.size,
  };
}

// ─── Wood ───────────────────────────────────────────────────────────────────

/** The trunk's buttresses: swelling toward each root at its foot. */
function buttress(roots: number[], a: number, y: number, flute: number) {
  const k = buttressSwell(y, flute) - 1;
  if (k <= 0) return 1;
  let s = 0;
  for (const r of roots) s += Math.pow(Math.max(0, Math.cos(a - r)), 6);
  return 1 + k * Math.min(1, s);
}

/** A limb's bark: whole tiles round it, the offset round it (tiles), and its coordinate along it (bark metres: `v` at arc `s`, `k` per metre). */
interface Bark {
  tiles: number;
  u: number;
  v: number;
  s: number;
  k: number;
}

/**
 * The tree's wood as one connected mesh (see the file comment). Attributes besides position and
 * normal: `color` (a painted shade: the damp foot, the crotch of every fork and the shaded inner
 * crown darker), and where the bark lies for the bark shader (foliage.ts). Round each limb the
 * bark is wrapped in whole tiles: `aBarkA` = the cosine and sine of the point's angle round its
 * limb, the limb's tiles and its offset round (in tiles). Over a collar the branch's own wrap runs
 * right down to the rim of its hole, turned there so that the rim keeps the parent's bark (but in the crotch):
 * `aBarkB` = the same angle and tiles in the branch's wrap, and how far the rim point's offset is
 * turned from the branch's (0 on the branch's first ring; elsewhere `aBarkB` is a copy of
 * `aBarkA`). `aWood` = the wind's weight, the limb's radius, the bark's coordinate along the limb
 * (bark metres) and 1 on a branch's first ring, whose collar triangles (each drawn last from that
 * ring) take `aBarkB`.
 */
export function woodGeometry(sk: Skeleton): THREE.BufferGeometry {
  const { limbs, crown } = sk;
  const pos: number[] = [], col: number[] = [], wood: number[] = [], ba: number[] = [], bb: number[] = [], idx: number[] = [];
  const kids: number[][] = limbs.map(() => []);
  limbs.forEach((L, i) => L.parent >= 0 && kids[L.parent].push(i));
  /** Each limb's rings (vertex indices) and bark, and each branch's hole rim in its parent with the rim point its bark lines up on. */
  const rings: number[][][] = [];
  const barks: Bark[] = [];
  const rims: number[][] = [];
  const rimFoot: number[] = [];
  const P = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), D = new THREE.Vector3(), V = new THREE.Vector3();
  const vertex = (p: THREE.Vector3, a: number, bark: Bark, r: number, s: number, shade: number, w: number) => {
    pos.push(p.x, p.y, p.z);
    ba.push(Math.cos(a), Math.sin(a), bark.tiles, bark.u);
    bb.push(Math.cos(a), Math.sin(a), bark.tiles, bark.u);
    // The damp foot, and the inner crown in the shade of the leaves.
    const foot = 0.68 + 0.32 * THREE.MathUtils.smoothstep(p.y, -0.3, 1.1);
    const inner = 1 - 0.38 * (1 - THREE.MathUtils.smoothstep(crownDepth(crown, p), 0.35, 0.9)) * THREE.MathUtils.smoothstep(p.y, crown.centre.y - crown.down, crown.centre.y);
    const c = foot * inner * shade;
    col.push(c, c, c);
    wood.push(w, r, bark.v + (s - bark.s) * bark.k, 0);
    return pos.length / 3 - 1;
  };
  /** A vertex's place round its limb's bark (tiles). */
  const uOf = (vi: number) => (Math.atan2(ba[vi * 4 + 1], ba[vi * 4]) / (Math.PI * 2)) * ba[vi * 4 + 2] + ba[vi * 4 + 3];
  const rootSides = kids[0].filter((k) => limbs[k].order < 0).map((k) => (limbs[k].joint!.side / limbs[0].sides) * Math.PI * 2);

  limbs.forEach((L, li) => {
    const len = lengthOf(L);
    const holes = kids[li].map((k) => limbs[k].joint!);
    const start = L.joint ? L.joint.ring : 0, tipLen = Math.min(len * 0.2, Math.max(0.06, L.radius[L.radius.length - 1] * 2.5));
    const st = stations(L, holes, start, len - tipLen);
    const sides = st.map((s) => sidesAt(L, s));
    // Bark tiles round the limb: as many as fit its girth at its foot (the trunk's at breast height),
    // each as long up it as it is wide there, so a thin limb wears the trunk's bark in small.
    const girth = Math.PI * 2 * (L.order === 0 ? along(L.radius, L, arcAtHeight(L, 1.3)) : L.radius[0]);
    const tiles = Math.max(1, Math.round(girth / sk.species.bark));
    const bark: Bark = { tiles, u: 0, v: 0, s: start, k: clamp((sk.species.bark * tiles) / girth, 0.75, 4) };
    if (L.parent >= 0) {
      // The collar: the branch's wrap carried down to its hole's rim. Its furrows run on from the
      // parent's at the rim's foot, and each rim point keeps the parent's bark, its offset unwound
      // round the rim both ways from the foot (the two meet in the crotch).
      const pb = barks[L.parent], j = L.joint!, rim = rims[li], n = rim.length, i0 = rimFoot[li];
      bark.v = pb.v + (j.s + j.h * 0.5 - pb.s) * pb.k;
      pointOn(L, start, P);
      tangentOn(L, start, T);
      normalOn(L, start, T, N);
      B.crossVectors(T, N);
      const th = rim.map((vi) => {
        V.set(pos[vi * 3] - P.x, pos[vi * 3 + 1] - P.y, pos[vi * 3 + 2] - P.z);
        return Math.atan2(V.dot(B), V.dot(N));
      });
      const d = rim.map((vi, i) => uOf(vi) - (th[i] / (Math.PI * 2)) * tiles);
      const off = new Array<number>(n);
      off[i0] = d[i0];
      const half = Math.floor(n / 2);
      for (let t = 1; t < n; t++) {
        const i = t <= half ? (i0 + t) % n : (i0 - (t - half) + n) % n;
        const prev = t <= half ? (i0 + t - 1) % n : (i0 - (t - half) + 1 + n) % n;
        off[i] = d[i] - Math.round(d[i] - off[prev]);
      }
      // Where the two meet, in the crotch, the branch's wrap has gone a whole turn of tiles further
      // than the parent's bark: over the crotch's half of the rim the branch keeps its own wrap
      // (meeting the parent's bark in the crease of the fork, as a branch's bark ridge does), not
      // packing that turn into one sliver of bark.
      const iF = (i0 + half) % n, iB = (i0 + half + 1) % n, m = Math.max(1, Math.floor(half / 2));
      const turn = Math.round(off[iB] - off[iF] - (d[iB] - d[iF] - Math.round(d[iB] - d[iF])));
      for (let t = 0; t < 2 * m; t++) off[(iF - m + 1 + t + n) % n] += (turn * (t + 0.5)) / (2 * m) - (t >= m ? turn : 0);
      rim.forEach((vi, i) => bb.splice(vi * 4, 4, Math.cos(th[i]), Math.sin(th[i]), tiles, off[i] - d[i0]));
      bark.u = d[i0];
    }
    barks[li] = bark;
    // Rings.
    rings[li] = st.map((s, k) => {
      const S = sides[k];
      pointOn(L, s, P);
      tangentOn(L, s, T);
      normalOn(L, s, T, N);
      B.crossVectors(T, N);
      const r = along(L.radius, L, s), w = along(L.sway, L, s);
      return Array.from({ length: S }, (_, j) => {
        const a = (j / S) * Math.PI * 2;
        const rr = r * (L.order === 0 ? buttress(rootSides, a, P.y, sk.species.flute ?? 1) : 1);
        D.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
        return vertex(V.copy(P).addScaledVector(D, rr), a, bark, rr, s, 1, w);
      });
    });
    const ring = rings[li];
    // Holes: which quads each branch cuts out, and the rim it is stitched to.
    const nearest = (s: number) => st.reduce((bi, x, i) => (Math.abs(x - s) < Math.abs(st[bi] - s) ? i : bi), 0);
    const cut = kids[li].map((k) => {
      const j = limbs[k].joint!;
      return { k, j, k0: nearest(j.s - j.h), k1: Math.max(nearest(j.s - j.h) + 1, nearest(j.s + j.h)), j0: j.side - j.b, w: 2 * j.b, S: sidesAt(L, j.s) };
    });
    const inHole = (k: number, j: number) => cut.some((c) => k >= c.k0 && k < c.k1 && (((j - c.j0) % c.S) + c.S) % c.S < c.w);
    for (let k = 0; k < st.length - 1; k++) {
      const S = sides[k];
      if (sides[k + 1] !== S) {
        // Where the limb drops to fewer sides, the two rings are stitched into one band.
        tangentOn(L, st[k + 1], T);
        stitch(ring[k], ring[k + 1], pos, idx, T, normalOn(L, st[k + 1], T, N), pointOn(L, st[k + 1], P));
        continue;
      }
      for (let j = 0; j < S; j++) {
        if (inHole(k, j)) continue;
        // (Each triangle is drawn last from the upper ring, never from a branch's first: see aWood.)
        const a = ring[k][j], b = ring[k][(j + 1) % S], c = ring[k + 1][(j + 1) % S], d = ring[k + 1][j];
        idx.push(a, b, c, a, c, d);
      }
    }
    for (const c of cut) {
      const at = (k: number, j: number) => ring[k][(((c.j0 + j) % c.S) + c.S) % c.S];
      const rim: number[] = [];
      for (let t = 0; t <= c.w; t++) rim.push(at(c.k0, t));
      for (let k = c.k0 + 1; k < c.k1; k++) rim.push(at(k, c.w));
      for (let t = c.w; t >= 0; t--) rim.push(at(c.k1, t));
      for (let k = c.k1 - 1; k > c.k0; k--) rim.push(at(k, 0));
      rims[c.k] = rim;
      // The branch's bark lines up on the middle of the rim's edge its parent's bark runs in from:
      // the lower edge under a branch, the upper edge over a root (the trunk runs down into it).
      const C = limbs[c.k], up = tangentOn(C, C.joint!.ring, D).dot(tangentOn(L, c.j.s, T)) >= 0;
      rimFoot[c.k] = up ? c.j.b : 2 * c.w + c.k1 - c.k0 - c.j.b;
      // The crotch: the rim sits in the shadow of the fork.
      for (const vi of rim) for (let e = 0; e < 3; e++) col[vi * 3 + e] *= 0.84;
    }
    // The tip closes on one point.
    const tip = vertex(pointOn(L, len, P), 0, bark, 0.001, len, 1, along(L.sway, L, len));
    const last = ring[ring.length - 1];
    for (let j = 0; j < last.length; j++) idx.push(last[j], last[(j + 1) % last.length], tip);
    // The collar: this branch's first ring stitched to its hole's rim in the parent.
    if (L.parent >= 0) {
      stitch(rims[li], ring[0], pos, idx, tangentOn(L, start, T), normalOn(L, start, T, N), pointOn(L, start, P));
      for (const vi of ring[0]) {
        wood[vi * 4 + 3] = 1;
        bb[vi * 4 + 3] = 0;
      }
    }
  });

  // Only the vertices the surface uses (the bark inside each hole goes).
  const keep = new Int32Array(pos.length / 3).fill(-1);
  let used = 0;
  for (const i of idx) if (keep[i] < 0) keep[i] = used++;
  const pick = (src: number[], k: number) => {
    const a = new Float32Array(used * k);
    keep.forEach((to, i) => to >= 0 && a.set(src.slice(i * k, i * k + k), to * k));
    return new THREE.Float32BufferAttribute(a, k);
  };
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', pick(pos, 3));
  g.setAttribute('color', pick(col, 3));
  g.setAttribute('aWood', pick(wood, 4));
  g.setAttribute('aBarkA', pick(ba, 4));
  g.setAttribute('aBarkB', pick(bb, 4));
  g.setIndex(idx.map((i) => keep[i]));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * Ring stations along a limb from `start` to `end`: spaced by the limb's girth and closer where
 * it bends, plus the two edges of every branch's hole (stations inside a hole are dropped: the
 * collar replaces that bark).
 */
function stations(L: Limb, holes: Joint[], start: number, end: number) {
  const base = [start];
  const t0 = new THREE.Vector3(), t1 = new THREE.Vector3();
  for (let s = start; ;) {
    const r = along(L.radius, L, s);
    let ds = clamp(r * 5, r < 0.08 ? 0.6 : 0.24, 0.9);
    tangentOn(L, s, t0);
    for (let k = 0; k < 3 && t0.angleTo(tangentOn(L, s + ds, t1)) > 0.4; k++) ds *= 0.65;
    s += ds;
    if (s >= end - ds * 0.35) break;
    base.push(s);
  }
  base.push(end);
  if (L.step && L.step.s > start && L.step.s < end) base.push(L.step.s);
  const inside = (x: number) => holes.some((j) => x > j.s - j.h + 1e-4 && x < j.s + j.h - 1e-4);
  const all = [...base.filter((x) => !inside(x)), ...holes.flatMap((j) => [j.s - j.h, j.s + j.h])].sort((a, b) => a - b);
  const out: number[] = [];
  for (const x of all) if (!out.length || x - out[out.length - 1] > 0.012) out.push(x);
  return out;
}

/**
 * Stitch a hole's rim (vertex indices round it) to a branch's first ring: both are walked round
 * the branch's axis in angle, one triangle at a time from whichever is behind, so rims and rings
 * of any vertex count close into one band.
 */
function stitch(rim: number[], ring: number[], pos: number[], idx: number[], t: THREE.Vector3, n: THREE.Vector3, c: THREE.Vector3) {
  const b = new THREE.Vector3().crossVectors(t, n), w = new THREE.Vector3();
  const angle = (vi: number) => {
    w.set(pos[vi * 3] - c.x, pos[vi * 3 + 1] - c.y, pos[vi * 3 + 2] - c.z);
    const a = Math.atan2(w.dot(b), w.dot(n));
    return a < 0 ? a + Math.PI * 2 : a;
  };
  let L = rim.slice();
  // Walked counter-clockwise round the branch (as its rings are), from the vertex nearest angle 0.
  const turning = L.reduce((sum, vi, i) => {
    let d = angle(L[(i + 1) % L.length]) - angle(vi);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return sum + d;
  }, 0);
  if (turning < 0) L.reverse();
  const first = L.reduce((bi, vi, i) => (angle(vi) < angle(L[bi]) ? i : bi), 0);
  L = [...L.slice(first), ...L.slice(0, first)];
  const aL = L.map(angle), aR = ring.map((_, j) => (j / ring.length) * Math.PI * 2);
  aL.push(aL[0] + Math.PI * 2);
  aR.push(Math.PI * 2);
  // (A rim that doubles back a little round a tight fork is held level rather than wrapped a full turn.)
  for (let i = 1; i < aL.length; i++) aL[i] = Math.max(aL[i], aL[i - 1]);
  let i = 0, j = 0;
  const n0 = L.length, m0 = ring.length;
  while (i < n0 || j < m0) {
    if (j >= m0 || (i < n0 && aL[i + 1] <= aR[j + 1])) {
      idx.push(L[i], L[(i + 1) % n0], ring[j % m0]);
      i++;
    } else {
      idx.push(L[i % n0], ring[(j + 1) % m0], ring[j]);
      j++;
    }
  }
}

// ─── Leaves ─────────────────────────────────────────────────────────────────

/** No leaf card reaches lower than this (m): it would brush the 2 m hero's head. */
const HEAD = 2.15;

/**
 * The crown's leaf cards (see the file comment). Attributes besides position, normal and uv:
 * `color` (the crown's painted shade), `aWind` (the spray's anchor on its twig and its sway weight:
 * the whole card moves with its twig), `aFlutter` (0 at the card's foot, 1 at its far edge), and
 * `aCard` and `aSpine` (the card's face and the point on its midline level with the vertex: seen
 * edge on, the leaf shader narrows a card onto its midline).
 */
export function leafGeometry(sk: Skeleton, seed: number): THREE.BufferGeometry {
  const rng = mulberry32(seed * 104729 + 7);
  const { crown } = sk;
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], col: number[] = [], wind: number[] = [], flutter: number[] = [], card3: number[] = [], spine: number[] = [], idx: number[] = [];
  const out = new THREE.Vector3(), cn = new THREE.Vector3(), n = new THREE.Vector3(), p = new THREE.Vector3(), tmp = new THREE.Vector3();
  // Leaf masses: the sprays of one branch light together as one soft lobe of the crown, lit on top
  // and shaded under, the way a painter blocks in a tree's masses before its leaves.
  const masses = new Map<number, { c: THREE.Vector3; r: number; n: number }>();
  for (const s of sk.sprays) {
    const m = masses.get(s.limb) ?? { c: new THREE.Vector3(), r: 0, n: 0 };
    m.c.add(s.at);
    m.n++;
    masses.set(s.limb, m);
  }
  for (const m of masses.values()) m.c.divideScalar(m.n);
  for (const s of sk.sprays) {
    const m = masses.get(s.limb)!;
    m.r = Math.max(m.r, s.at.distanceTo(m.c) + s.size * 0.5);
  }
  const card = (s: Spray, foot: THREE.Vector3, up: THREE.Vector3, face: THREE.Vector3, w: number, h: number) => {
    const side = new THREE.Vector3().crossVectors(up, face).normalize();
    // (A card that would reach down past the hero's head is lifted clear.)
    const base = foot.clone();
    base.y += Math.max(0, HEAD - (base.y + Math.min(0, up.y * h) - Math.abs(side.y) * w * 0.5));
    const { u0, u1, v0, v1 } = sprayCell(Math.floor(rng() * SPRAY_CELLS * SPRAY_CELLS));
    const flip = rng() < 0.5, pad = 0.003;
    // The spray's own tone: lighter or darker, warmer or cooler, than its neighbours.
    const tone = 0.86 + rng() * 0.28, warm = (rng() - 0.5) * 0.1;
    const mass = masses.get(s.limb)!;
    const first = pos.length / 3;
    for (const [sx, sy] of [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]] as const) {
      p.copy(base).addScaledVector(up, sy * h);
      spine.push(p.x, p.y, p.z);
      card3.push(face.x, face.y, face.z);
      p.addScaledVector(side, sx * w);
      pos.push(p.x, p.y, p.z);
      // Normals swell out of the leaf mass (from a little under its middle) and the crown as a whole;
      // a hanging strand's out of the curtain and up, so the curtain lights as one soft, rounded face.
      crownNormal(crown, p, cn);
      tmp.copy(mass.c).addScaledVector(UP, -0.35 * mass.r);
      if (s.hang) n.set(face.x, 0, face.z).normalize().multiplyScalar(0.6).addScaledVector(UP, 0.55).addScaledVector(cn, 0.2).normalize();
      else n.subVectors(p, tmp).normalize().multiplyScalar(0.5).addScaledVector(cn, 0.35).addScaledVector(UP, 0.15).normalize();
      nrm.push(n.x, n.y, n.z);
      uv.push(u0 + pad + (flip ? 0.5 - sx : 0.5 + sx) * (u1 - u0 - 2 * pad), v0 + pad + sy * (v1 - v0 - 2 * pad));
      // The painted shade: darker deep in the crown, under it and under each mass, so the crown
      // reads as lit masses over shadowed hollows; the light warm and yellow, the shade cool and grey.
      const depth = crownDepth(crown, p);
      const inner = 1 - 0.45 * (1 - THREE.MathUtils.smoothstep(depth, 0.5, 1.0));
      const under = 0.68 + 0.32 * THREE.MathUtils.smoothstep(cn.y, -0.8, 0.35);
      const lobe = 0.74 + 0.32 * clamp((p.y - mass.c.y) / mass.r * 0.5 + 0.5, 0, 1);
      const top = THREE.MathUtils.smoothstep(cn.y, -0.2, 0.9) * THREE.MathUtils.smoothstep(0.55, 0.95, depth);
      // (A strand lit from its top, a little darker toward its hem.)
      const k = s.hang ? (0.98 - 0.22 * ((s.hang.drop + sy) / s.hang.of)) * Math.max(inner, 0.8) * tone : inner * under * lobe * tone;
      // (Shade drifts toward grey-blue: the green is strongest only where the light falls.)
      const grey = (1 - top) * 0.12;
      col.push(k * (0.92 + top * 0.16 + warm + grey * 0.2), k * (0.97 + top * 0.06 - grey * 0.15), k * (1.04 - top * 0.2 - warm + grey * 0.5));
      const anchor = s.hang?.top ?? s.at;
      wind.push(anchor.x, anchor.y, anchor.z, s.sway);
      flutter.push(sy);
    }
    idx.push(first, first + 1, first + 2, first, first + 2, first + 3);
  };
  const face = new THREE.Vector3(), up = new THREE.Vector3(), base = new THREE.Vector3();
  const weep = sk.species.weep;
  for (const s of sk.sprays) {
    crownNormal(crown, s.at, out);
    if (s.hang && weep) {
      // A strand's card hangs from its top, facing out of the crown, with a second crossing it; at
      // its top a spray arches out over the branch before the strand falls (so from above the
      // curtain's head is leafy too).
      face.set(out.x, 0, out.z).add(new THREE.Vector3(rng() - 0.5, 0, rng() - 0.5).multiplyScalar(0.6));
      if (face.lengthSq() < 1e-4) face.set(1, 0, 0);
      face.normalize();
      const away = face.clone();
      up.copy(s.dir).addScaledVector(face, -s.dir.dot(face)).normalize();
      face.crossVectors(new THREE.Vector3().crossVectors(up, face), up).normalize();
      const w = weep.width * range(rng, [0.8, 1.0]);
      base.copy(s.at).addScaledVector(face, 0.03);
      card(s, base, up, face, w, s.size);
      if (s.hang.drop === 0) {
        const arch = away.clone().multiplyScalar(0.8).addScaledVector(UP, -0.25).normalize();
        const lie = new THREE.Vector3().crossVectors(arch, new THREE.Vector3().crossVectors(UP, arch)).normalize();
        card(s, s.at.clone().addScaledVector(away, -0.35), arch, lie, w * 1.15, weep.card * 0.85);
      }
      card(s, base, up, face.clone().applyAxisAngle(up, (rng() < 0.5 ? 1 : -1) * range(rng, [1.1, 1.45])), w * 0.9, s.size * 0.97);
      continue;
    }
    // Sprays face the sky and the outside of the crown, as leaves turn to the light; each runs out
    // along its twig, laid into that face.
    face.copy(UP).multiplyScalar(0.75).addScaledVector(out, 0.55).add(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(0.5)).normalize();
    up.copy(s.dir).addScaledVector(face, -s.dir.dot(face));
    if (up.lengthSq() < 1e-4) up.copy(around(face, s.dir, 0));
    up.normalize();
    face.crossVectors(new THREE.Vector3().crossVectors(up, face), up).normalize();
    const w = s.size * range(rng, [0.85, 1.0]), h = s.size * range(rng, [1.0, 1.15]);
    // The card starts a little behind where the spray leaves its branch and lies just over the
    // branch, so its leaves cover the branch there (and a tip's pair closes over the tip).
    const L = sk.limbs[s.limb];
    base.copy(s.at).addScaledVector(up, -0.3 * h).addScaledVector(face, along(L.radius, L, s.s) + 0.04);
    card(s, base, up, face, w, h);
    // A second card crossing the first, so the spray has body from the side.
    const turn = (rng() < 0.5 ? 1 : -1) * range(rng, [0.95, 1.4]);
    card(s, base, up, face.clone().applyAxisAngle(up, turn), w * 0.92, h * 0.95);
    if (rng() < 0.06) {
      // Now and then a smaller one turned outward, filling the spray.
      const f3 = out.clone().addScaledVector(perpendicular(out, rng), 0.5).normalize();
      const u3 = up.clone().addScaledVector(f3, -up.dot(f3)).normalize();
      card(s, base.clone().addScaledVector(up, h * 0.25), u3, f3, w * 0.7, h * 0.7);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aWind', new THREE.Float32BufferAttribute(wind, 4));
  g.setAttribute('aFlutter', new THREE.Float32BufferAttribute(flutter, 1));
  g.setAttribute('aCard', new THREE.Float32BufferAttribute(card3, 3));
  g.setAttribute('aSpine', new THREE.Float32BufferAttribute(spine, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
