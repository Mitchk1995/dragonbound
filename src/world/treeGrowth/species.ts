import type { LeafKind } from '../../render/foliage';

/** The grown trees' species: the shape of each kind, which a seed grows one tree of (grow.ts). */

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
  /** Roots: ridges swelling out of the trunk's foot and running down and out into the ground. */
  roots: number;
  /** Girth (m) one bark tile wraps round: a limb takes as many whole tiles as fit its girth at its foot, so its ridges converge as it tapers. */
  bark: number;
  /** The leaves its sprays carry (foliage.ts). */
  leaf: LeafKind;
  /** The lowest a leaf spray springs from (m; 3 when left out), so none hangs low enough to brush the hero's head. */
  clear?: number;
  /** The lowest a leaf card reaches (m; 2.15 when left out, clear of the hero's head; a bush's reach down to the ground). */
  head?: number;
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
