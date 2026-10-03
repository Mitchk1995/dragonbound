import * as THREE from 'three';
import { shareResource } from '../render/resources';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/rng';
import type { ZoneTheme } from '../data/zones';
import { hash01 } from '../render/blocks';
import { grownBark, grownLeaves, type BarkLook, type WindClock } from '../render/foliage';
import type { PaintKind } from '../render/paint';
import type { Grade } from '../render/surface';
import { growTree, leafGeometry, OAK, TREE, woodGeometry, type Species } from './treeGrowth';

/**
 * Tree models for the world's instanced forests.
 *
 * - 'block' (the game's style): stepped block canopies. Each broadleaf is a crown of bevelled
 *   blocks of mixed proportions, tiers stepping in and shifting as they rise, a few small blocks
 *   stepping out at the edges and small tufts breaking the flat tops, every block tilted a little
 *   so the crown reads hand-built. Four distinct crowns (round, tall, broad twin-topped, lopsided)
 *   so a forest never repeats one tree. Pines are three or four square slab tiers getting smaller
 *   upward, each turned 45° from the one below, with a vertical brim (a lit ledge and a dark
 *   underside) under a sloping top.
 * - 'faceted': the earlier trees (icosahedron canopies, cone pines), kept as a fallback.
 * - 'natural': grown trees (treeGrowth.ts), true to size: the broadleaves are mature oaks, each one
 *   continuous grown trunk, roots and limbs under a crown of painted leaf sprays, in three seeded
 *   variants. Pines, dead ash and bushes keep their block models until grown kinds replace them.
 *
 * The grown kinds (GROWN) are the woodcutting ladder as it is built, rung by rung: so far the
 * common tree and the oak, each a species, its seeds and its look.
 *
 * Every block canopy carries a painted vertex shade under the painted leaf albedo: lighter top
 * faces, a lit lip on the upper bevels, each side face darkening toward its foot, dark undersides,
 * warmer blocks high in the crown and cooler ones low. Instance colour (green, pink blossom,
 * autumn gold) multiplies over it, so one geometry serves every colour.
 */

export type TreeKind = ZoneTheme['trees'];
export type TreeStyle = 'block' | 'faceted' | 'natural';
export const TREE_STYLES: TreeStyle[] = ['block', 'faceted', 'natural'];

/** The style the world builds its forests with (the inspect harness may switch it before a zone is built). */
export const TREE_STYLE: { value: TreeStyle } = { value: 'block' };

/** Turns the world's scenery material into a grown tree's own (wind: the world's wind clock). */
export type GrownSetup = (mat: THREE.MeshStandardMaterial, wind: WindClock) => void;

/** How a grown kind looks and stands: its bark and leaf materials, its size range and the room it needs. */
export interface GrownLook {
  trunk: GrownSetup;
  canopy: GrownSetup;
  /** Range an instance's size is drawn from (1 = the grown tree's own size). */
  size: [number, number];
  /** Metres between two grown trees' trunks; smaller trees are cleared from under its crown. */
  spacing: number;
  /** Its own leaf colours (as the world's palettes: three everyday tones, then two rarer ones). */
  palette: number[];
}

export interface TreeSet {
  /** Trunk variants per kind: one shared by every canopy variant, or one per canopy variant (a grown tree's leaves sit on its own branches). */
  trunk: Record<TreeKind, THREE.BufferGeometry[]>;
  /** Canopy variants per kind (instances alternate between them). */
  canopy: Record<TreeKind, THREE.BufferGeometry[]>;
  bush: THREE.BufferGeometry;
  /** Painted albedo per canopy kind. */
  paint: Record<TreeKind, PaintKind>;
  /** Canopy shade toward the foot (local heights). */
  grade: Grade;
  bushGrade: Grade;
  /** Canopies carry a painted vertex shade (multiplied with the instance colour). */
  shaded: boolean;
  /** Kinds that are grown trees. */
  grown: Partial<Record<TreeKind, GrownLook>>;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ─── Blocks ─────────────────────────────────────────────────────────────────

/**
 * A bevelled block, base on y = 0: footprint w × d, height h. Vertical edges are cut by `k` and
 * the top and bottom edges by a bevel `c`, so every block has a crisp lit lip and soft corners
 * from above.
 */
function block(w: number, h: number, d: number, c = 0.08, k = 0.12) {
  const pts: THREE.Vector3[] = [];
  const ring = (y: number, inset: number) => {
    const a = w / 2 - inset, b = d / 2 - inset, kk = Math.min(k, a * 0.45, b * 0.45);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pts.push(V(sx * (a - kk), y, sz * b), V(sx * a, y, sz * (b - kk)));
  };
  const cc = Math.min(c, h * 0.3, Math.min(w, d) * 0.3);
  ring(0, cc * 0.8);
  ring(cc * 0.8, 0);
  ring(h - cc, 0);
  ring(h, cc);
  return new ConvexGeometry(pts);
}

/**
 * A pine tier, base on y = 0: a square slab w wide with a vertical brim `brim` tall (a lit lip
 * along its top edge, a dark underside below), then a slope in to `top` × w at height h.
 */
function tier(w: number, h: number, brim: number, top: number) {
  const pts: THREE.Vector3[] = [];
  const ring = (y: number, hw: number) => {
    const kk = Math.min(0.1, hw * 0.3);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pts.push(V(sx * (hw - kk), y, sz * hw), V(sx * hw, y, sz * (hw - kk)));
  };
  ring(0, w / 2 - 0.06);
  ring(0.05, w / 2);
  ring(brim, w / 2);
  ring(brim + 0.05, w / 2 - 0.05);
  ring(h - 0.04, (w * top) / 2);
  ring(h, (w * top) / 2 - 0.04);
  return new ConvexGeometry(pts);
}

interface Part {
  geo: THREE.BufferGeometry;
  /** Per-block tone (painted variation between blocks). */
  tone: number;
}

/** Place a block: centre of its foot at (x, y, z), tilted (tx, tz) then turned `yaw`. */
function put(geo: THREE.BufferGeometry, x: number, y: number, z: number, yaw = 0, tone = 1, tx = 0, tz = 0): Part {
  return { geo: geo.clone().rotateX(tx).rotateZ(tz).rotateY(yaw).translate(x, y, z), tone };
}

/**
 * Painted vertex shade for a canopy built from blocks (see the file comment). `span` is the
 * canopy's height range, for the warm-top / cool-foot drift.
 */
function shadeParts(parts: Part[], span: [number, number]) {
  const out: THREE.BufferGeometry[] = [];
  for (const { geo, tone } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const pos = g.getAttribute('position'), nrm = g.getAttribute('normal');
    const col = new Float32Array(pos.count * 3);
    const hgt = Math.max(0.01, bb.max.y - bb.min.y);
    for (let i = 0; i < pos.count; i++) {
      const ny = nrm.getY(i), y = pos.getY(i);
      const t = (y - bb.min.y) / hgt;
      let v: number;
      if (ny > 0.85) v = 1.16;
      else if (ny > 0.3) v = 1.2;
      else if (ny >= -0.3) v = 0.64 + 0.42 * Math.pow(t, 0.8);
      else if (ny >= -0.85) v = 0.6;
      else v = 0.5;
      // Warm light high in the crown, cool shade low (multiplies the instance colour).
      const ch = Math.max(0, Math.min(1, (y - span[0]) / (span[1] - span[0])));
      const r = 0.93 + ch * 0.12, gg = 0.97 + ch * 0.05, b = 1.05 - ch * 0.12;
      col[i * 3] = v * tone * r;
      col[i * 3 + 1] = v * tone * gg;
      col[i * 3 + 2] = v * tone * b;
    }
    const clean = new THREE.BufferGeometry();
    clean.setAttribute('position', pos);
    clean.setAttribute('normal', nrm);
    clean.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.push(clean);
  }
  return mergeGeometries(out)!;
}

/** Strip everything but position and normal (so differently built parts merge). */
function plain(geo: THREE.BufferGeometry) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.BufferGeometry();
  c.setAttribute('position', g.getAttribute('position'));
  c.setAttribute('normal', g.getAttribute('normal'));
  return c;
}

// ─── Trunks ─────────────────────────────────────────────────────────────────

/** A limb from a to b, radius r0 at a tapering to r1 (flat shaded). */
function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, sides = 6) {
  const dir = b.clone().sub(a), len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1, true).translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.normalize()));
  g.translate(a.x, a.y, a.z);
  return plain(g);
}

/**
 * An organic trunk with a flared, rooted foot (squarish six-sided bark), rising into the canopy,
 * with a couple of forked limbs reaching out under it.
 */
function trunk(top: number, r: number, limbs: [number, number, number, number][] = []) {
  const parts = [
    limb(V(0, -0.1, 0), V(0.03, top * 0.55, 0.01), r * 1.15, r * 0.82),
    limb(V(0.03, top * 0.55, 0.01), V(-0.02, top, 0.03), r * 0.82, r * 0.6),
  ];
  // Root flare: three short buttresses splayed out at the foot.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    parts.push(limb(V(Math.cos(a) * r * 1.5, -0.05, Math.sin(a) * r * 1.5), V(Math.cos(a) * r * 0.3, 0.32, Math.sin(a) * r * 0.3), r * 0.62, r * 0.4, 4));
  }
  for (const [x, y, z, y0] of limbs) parts.push(limb(V(0, y0, 0), V(x, y, z), r * 0.55, r * 0.3, 5));
  return mergeGeometries(parts)!;
}

// ─── Canopies ───────────────────────────────────────────────────────────────

/** One block of a crown: size w × h × d, foot centre (x, y, z), turned `yaw`. */
type B = [w: number, h: number, d: number, x: number, y: number, z: number, yaw: number];

/**
 * A crown from its blocks. Each block takes its own small tilt and tone (seeded), so tiers
 * overlap like hand-stacked masses rather than machined slabs.
 */
function crown(seed: number, blocks: B[]) {
  const rng = mulberry32(seed);
  let lo = Infinity, hi = -Infinity;
  const parts = blocks.map(([w, h, d, x, y, z, yaw]) => {
    lo = Math.min(lo, y);
    hi = Math.max(hi, y + h);
    return put(block(w, h, d), x, y, z, yaw, 0.92 + rng() * 0.16, (rng() - 0.5) * 0.12, (rng() - 0.5) * 0.12);
  });
  return shadeParts(parts, [lo, hi]);
}

/** Four broadleaf crowns, each a different silhouette (instances alternate between them). */
function broadleaves() {
  return [
    // Round: a narrow foot, the widest tier over it (a shaded step under its overhang), an upper
    // tier and an off-centre cap with a tuft beside it; blocks step out at both sides.
    crown(101, [
      [1.6, 0.62, 1.5, 0, 1.38, 0, 0],
      [2.0, 0.76, 1.8, 0.12, 1.82, -0.06, 0.18],
      [1.35, 0.66, 1.22, -0.18, 2.44, 0.1, -0.14],
      [0.72, 0.5, 0.66, 0.3, 2.98, -0.22, 0.42],
      [0.5, 0.3, 0.46, -0.48, 2.98, 0.36, 0.2],
      [0.72, 0.62, 0.64, -1.1, 1.95, 0.3, -0.25],
      [0.58, 0.52, 0.55, 1.02, 2.48, 0.32, 0.3],
      [0.55, 0.46, 0.5, 0.95, 1.3, -0.45, 0.25],
    ]),
    // Tall: narrower tiers climbing higher, a small top block and tuft, side blocks set high.
    crown(202, [
      [1.3, 0.68, 1.25, 0, 1.42, 0, 0.1],
      [1.75, 0.8, 1.55, -0.08, 1.88, 0.05, 0.3],
      [1.4, 0.74, 1.28, 0.12, 2.5, -0.06, -0.06],
      [0.9, 0.56, 0.82, -0.06, 3.08, 0.1, 0.38],
      [0.44, 0.28, 0.4, 0.3, 3.55, -0.14, 0.1],
      [0.62, 0.7, 0.56, 0.98, 2.12, 0.24, 0.22],
      [0.55, 0.58, 0.5, -0.92, 2.66, -0.2, -0.3],
    ]),
    // Broad: a wide spreading tier carrying two tops side by side (no single cap), a block
    // stepping out low at each end.
    crown(303, [
      [1.5, 0.56, 1.4, 0, 1.46, 0, 0],
      [2.4, 0.68, 1.9, 0, 1.86, 0, 0.08],
      [1.15, 0.62, 1.1, -0.58, 2.46, 0.12, -0.22],
      [1.0, 0.74, 0.95, 0.62, 2.42, -0.22, 0.32],
      [0.5, 0.3, 0.45, 0.66, 3.1, -0.16, 0.1],
      [0.64, 0.52, 0.62, -1.32, 1.72, -0.26, -0.15],
      [0.58, 0.5, 0.52, 1.3, 1.98, 0.42, 0.36],
      [0.52, 0.42, 0.48, -0.72, 1.32, 0.62, 0.3],
    ]),
    // Lopsided: the crown leans to one side, a lower secondary lobe with its own small cap on the
    // other.
    crown(404, [
      [1.45, 0.64, 1.35, 0.2, 1.4, 0, 0],
      [1.75, 0.8, 1.6, 0.35, 1.88, -0.05, 0.16],
      [1.15, 0.7, 1.05, 0.55, 2.54, 0.02, -0.2],
      [0.62, 0.46, 0.58, 0.75, 3.1, -0.12, 0.36],
      [1.05, 0.7, 1.0, -0.85, 1.62, 0.25, -0.3],
      [0.62, 0.44, 0.56, -0.9, 2.22, 0.15, 0.1],
      [0.5, 0.48, 0.48, 1.36, 2.28, -0.3, 0.4],
    ]),
  ];
}

/**
 * A pine: square slab tiers getting smaller upward, each turned 45° from the one below so its
 * corners stand out between the corners above, each overhanging the slope of the tier below so a
 * lit ledge and a dark underside show on every tier, and a small square spire on top.
 */
function pine(tiers: [w: number, h: number][], y0: number, yaw0: number) {
  const parts: Part[] = [];
  let y = y0;
  tiers.forEach(([w, h], i) => {
    parts.push(put(tier(w, h, 0.18, 0.42), 0, y, 0, yaw0 + (i % 2) * (Math.PI / 4), 0.94 + i * 0.04));
    y += h * 0.7;
  });
  const top = y + tiers[tiers.length - 1][1] * 0.3 - 0.12;
  parts.push(put(block(0.24, 0.44, 0.24, 0.05, 0.06), 0, top, 0, yaw0, 1.1));
  return shadeParts(parts, [y0, top + 0.44]);
}

/** A low bush: a block with a smaller one stepped on top and one at its side. */
function bush() {
  return shadeParts([
    put(block(1.15, 0.5, 1.05), 0, 0, 0),
    put(block(0.75, 0.42, 0.7), 0.1, 0.45, -0.05, 0.25, 1.05),
    put(block(0.45, 0.38, 0.42), -0.55, 0.12, 0.3, -0.2, 0.96),
  ], [0, 0.9]);
}

// ─── Sets ───────────────────────────────────────────────────────────────────

/** Dead, charred tree: a snapped-off upper trunk and a few stout forked limbs with blunt ends. */
function ashLimbs() {
  return mergeGeometries([
    new THREE.CylinderGeometry(0.09, 0.13, 0.9, 5).translate(0.02, 1.62, 0),
    new THREE.CylinderGeometry(0.05, 0.1, 1.0, 5).rotateZ(0.85).translate(0.4, 1.62, 0),
    new THREE.CylinderGeometry(0.035, 0.06, 0.45, 4).rotateZ(0.2).translate(0.78, 2.0, 0.02),
    new THREE.CylinderGeometry(0.05, 0.09, 0.85, 5).rotateZ(-0.95).translate(-0.34, 1.82, 0.08),
    new THREE.CylinderGeometry(0.04, 0.07, 0.65, 4).rotateX(0.9).translate(0.02, 2.0, 0.28),
  ])!;
}

const facetedTrunk = () => new THREE.CylinderGeometry(0.12, 0.2, 1.2, 5).translate(0, 0.6, 0);

function facetedSet(): TreeSet {
  const t = facetedTrunk();
  return {
    trunk: { pine: [t], grove: [t], ash: [t] },
    canopy: {
      pine: [mergeGeometries([
        new THREE.ConeGeometry(0.95, 1.3, 6).translate(0, 1.5, 0),
        new THREE.ConeGeometry(0.75, 1.1, 6).translate(0, 2.2, 0),
        new THREE.ConeGeometry(0.5, 0.9, 6).translate(0, 2.8, 0),
      ])!],
      grove: [mergeGeometries([
        new THREE.IcosahedronGeometry(1.0, 0).translate(0, 2.1, 0),
        new THREE.IcosahedronGeometry(0.7, 0).translate(0.5, 2.6, 0.2),
        new THREE.IcosahedronGeometry(0.6, 0).translate(-0.5, 2.5, -0.3),
      ])!],
      ash: [ashLimbs()],
    },
    bush: new THREE.IcosahedronGeometry(0.7, 0).translate(0, 0.45, 0),
    paint: { pine: 'needles', grove: 'leaves', ash: 'bark' },
    grade: { low: 0.62, from: 1.0, to: 2.7 },
    bushGrade: { low: 0.7, from: 0, to: 0.9 },
    shaded: false,
    grown: {},
  };
}

function blockSet(): TreeSet {
  return {
    trunk: {
      grove: [trunk(1.75, 0.17, [[0.62, 1.55, 0.3, 0.9], [-0.55, 1.6, -0.25, 1.05]])],
      pine: [trunk(1.3, 0.14)],
      // Dead ash keeps its leafless trunk and limbs.
      ash: [facetedTrunk()],
    },
    canopy: {
      grove: broadleaves(),
      pine: [
        pine([[1.95, 0.8], [1.55, 0.75], [1.15, 0.7], [0.76, 0.62]], 0.95, 0.1),
        pine([[1.85, 0.92], [1.35, 0.86], [0.86, 0.78]], 1.0, 0.5),
      ],
      ash: [ashLimbs()],
    },
    bush: bush(),
    paint: { pine: 'needles', grove: 'foliage', ash: 'bark' },
    grade: { low: 0.8, from: 1.1, to: 2.6 },
    bushGrade: { low: 0.85, from: 0, to: 0.7 },
    shaded: true,
    grown: {},
  };
}

/** The grown kinds built so far: the woodcutting ladder's first two rungs. */
export type GrownKind = 'tree' | 'oak';
export const GROWN_KINDS: GrownKind[] = ['tree', 'oak'];

/** A grown kind: the species it grows from, the seeds of its variants (each a different tree) and its look. */
interface Grown {
  species: Species;
  seeds: number[];
  look: GrownLook;
}

/** An oak's bark: long, deep furrows between warm grey-brown ridges. */
const OAK_BARK: BarkLook = { kind: 'oak', width: OAK.bark, tile: 1.1, relief: 1.2, gain: 1.6, moss: [0.12, 0.16, 0.06] };
/** The common tree's bark: shallower, finer furrows in a smoother, lighter grey-brown. */
const TREE_BARK: BarkLook = { kind: 'tree', width: TREE.bark, tile: 0.8, relief: 1.0, gain: 1.6, moss: [0.13, 0.17, 0.07] };

export const GROWN: Record<GrownKind, Grown> = {
  // Fresh mid greens, now and then a yellower one or one turning gold.
  tree: {
    species: TREE,
    seeds: [11, 12, 13],
    look: { trunk: (m, w) => grownBark(m, w, TREE_BARK), canopy: (m, w) => grownLeaves(m, w, 'oval'), size: [0.92, 1.08], spacing: 5.5, palette: [0x648c45, 0x6b9347, 0x5c8541, 0x86923f, 0xb39a45] },
  },
  // Oaks in deep, slightly grey summer greens, now and then an olive one or one turning gold.
  oak: {
    species: OAK,
    seeds: [1, 2, 3],
    look: { trunk: (m, w) => grownBark(m, w, OAK_BARK), canopy: (m, w) => grownLeaves(m, w, 'oak'), size: [0.9, 1.08], spacing: 7.5, palette: [0x557f41, 0x5b8643, 0x4c763d, 0x737f3d, 0xa88c45] },
  },
};

const grownSets = new Map<GrownKind, { trunk: THREE.BufferGeometry[]; canopy: THREE.BufferGeometry[] }>();

/** A grown kind's variants: each one's wood and its leaves (built once, shared). */
export function grownTrees(kind: GrownKind) {
  let set = grownSets.get(kind);
  if (!set) {
    const { species, seeds } = GROWN[kind];
    const grown = seeds.map((seed) => growTree(species, seed));
    set = { trunk: grown.map(woodGeometry), canopy: grown.map((sk, i) => leafGeometry(sk, seeds[i])) };
    for (const g of [...set.trunk, ...set.canopy]) shareResource(g);
    grownSets.set(kind, set);
  }
  return set;
}

function naturalSet(): TreeSet {
  const block = blockSet();
  const oaks = grownTrees('oak');
  return {
    ...block,
    trunk: { ...block.trunk, grove: oaks.trunk },
    canopy: { ...block.canopy, grove: oaks.canopy },
    grown: { grove: GROWN.oak.look },
  };
}

const sets = new Map<TreeStyle, TreeSet>();

/** The trees of one style (built once, shared by every zone). */
export function treeSet(style: TreeStyle = TREE_STYLE.value): TreeSet {
  let s = sets.get(style);
  if (!s) {
    s = style === 'faceted' ? facetedSet() : style === 'natural' ? naturalSet() : blockSet();
    for (const geometries of [...Object.values(s.trunk), ...Object.values(s.canopy)]) for (const geometry of geometries) shareResource(geometry);
    sets.set(style, s);
  }
  return s;
}

/** Triangles in one geometry. */
export const triangles = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

/** Triangles per tree (its trunk and canopy, the heaviest variant) of every kind in a style. */
export function treeTriangles(style: TreeStyle): Record<TreeKind, number> {
  const s = treeSet(style);
  const per = (k: TreeKind) => Math.max(...s.canopy[k].map((c, v) => triangles(s.trunk[k][Math.min(v, s.trunk[k].length - 1)]) + triangles(c)));
  return { grove: per('grove'), pine: per('pine'), ash: per('ash') };
}

/**
 * Thin a wood for grown trees, which need far more room than block trees laid one to a cell: taken
 * in an order hashed from their positions (so no scan-line pattern), a grown tree stays only where
 * no grown tree already kept stands within its spacing; then every other tree, and every piece of
 * undergrowth, under a kept crown (within half that spacing) goes. Returns which stay.
 */
export function thinWood(at: Record<TreeKind, { x: number; z: number }[]>, grown: Partial<Record<TreeKind, GrownLook>>, under: { x: number; z: number }[] = []) {
  const kept: { x: number; z: number; r: number }[] = [];
  const keep: Record<TreeKind, boolean[]> = { pine: at.pine.map(() => true), grove: at.grove.map(() => true), ash: at.ash.map(() => true) };
  const kinds = Object.keys(keep) as TreeKind[];
  for (const k of kinds) {
    const look = grown[k];
    if (!look) continue;
    const order = at[k].map((_, i) => i).sort((a, b) => hash01(at[k][a].x, at[k][a].z, 7) - hash01(at[k][b].x, at[k][b].z, 7));
    for (const i of order) {
      const p = at[k][i];
      keep[k][i] = kept.every((q) => Math.hypot(p.x - q.x, p.z - q.z) >= Math.max(look.spacing, q.r));
      if (keep[k][i]) kept.push({ x: p.x, z: p.z, r: look.spacing });
    }
  }
  const clear = (p: { x: number; z: number }) => kept.every((q) => Math.hypot(p.x - q.x, p.z - q.z) >= q.r * 0.5);
  for (const k of kinds) if (!grown[k]) at[k].forEach((p, i) => (keep[k][i] = clear(p)));
  return { trees: keep, under: under.map(clear) };
}
