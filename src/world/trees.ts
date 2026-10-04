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
import { growTree, leafGeometry, MAGIC, MAPLE, OAK, TREE, WILLOW, woodGeometry, YEW, type Species } from './treeGrowth';
import { grownStandIns } from './treeStandIns';

/**
 * Tree models for the world's instanced forests.
 *
 * - 'natural' (the game's style): grown trees (treeGrowth.ts), true to size, each one continuous
 *   grown trunk, roots and limbs under a crown of leaf sprays: the woodcutting ladder's six species
 *   (GROWN), each in three or four shapes. A zone's woods (ZoneTheme.woods) say which species grow
 *   in place of each of its tree kinds; any kind a zone gives no species keeps its block model. The
 *   dead ash and the bushes are grown too (TreeSet.grown): a dead ash is a tree grown and then
 *   killed (bare, its top and limbs snapped off, weathered silver-grey wood charred at its foot), a
 *   bush is grown from the ground up (several stems out of one root crown under a dome of leaf
 *   sprays).
 * - 'block': stepped block canopies. Each broadleaf is a crown of bevelled
 *   blocks of mixed proportions, tiers stepping in and shifting as they rise, a few small blocks
 *   stepping out at the edges and small tufts breaking the flat tops, every block tilted a little
 *   so the crown reads hand-built. Four distinct crowns (round, tall, broad twin-topped, lopsided)
 *   so a forest never repeats one tree. Pines are three or four square slab tiers getting smaller
 *   upward, each turned 45° from the one below, with a vertical brim (a lit ledge and a dark
 *   underside) under a sloping top.
 * - 'faceted': the earlier trees (icosahedron canopies, cone pines), kept as a fallback.
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
export const TREE_STYLE: { value: TreeStyle } = { value: 'natural' };

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
  /** Its colours where its zone wears autumn (ZoneTheme.woods), if it turns. */
  autumn?: number[];
  /** It grows by water: far likelier near it, rarer away from it. */
  waterside?: boolean;
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
  /** The zone's woods grow grown trees (GROWN) in place of its tree kinds (the 'natural' style). */
  natural: boolean;
  /** The 'natural' style's grown dead ash and bushes, standing in for the block ones (`trunk.ash`, `canopy.ash` and `bush`). */
  grown?: { ash: GrownStandIn; bush: GrownStandIn };
}

/** A grown model standing in for a block one: each of its shapes' wood and leaves (a dead ash has none), and how it looks. */
export interface GrownStandIn {
  trunk: THREE.BufferGeometry[];
  canopy: THREE.BufferGeometry[];
  look: GrownLook;
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
    natural: false,
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
    natural: false,
  };
}

/** The grown kinds: the woodcutting ladder, in its order. */
export type GrownKind = 'tree' | 'oak' | 'willow' | 'maple' | 'yew' | 'magic';
export const GROWN_KINDS: GrownKind[] = ['tree', 'oak', 'willow', 'maple', 'yew', 'magic'];

/**
 * A grown kind: the species it grows from, its shapes (each a seed, and how that tree departs from
 * the species: a leaning one, a tall narrow one, one forking low) and its look.
 */
interface Grown {
  species: Species;
  seeds: number[];
  forms?: Partial<Species>[];
  look: GrownLook;
}

/** An oak's bark: long, deep furrows between warm grey-brown ridges. */
const OAK_BARK: BarkLook = { kind: 'oak', tile: 1.1, relief: 1.2, gain: 1.6, moss: [0.12, 0.16, 0.06] };
/** The common tree's bark: shallower, finer furrows in a smoother, lighter grey-brown. */
const TREE_BARK: BarkLook = { kind: 'tree', tile: 0.8, relief: 1.0, gain: 1.6, moss: [0.13, 0.17, 0.07] };
/** A willow's bark: deep ridges criss-crossing in long diamonds, grey-brown and mossy. */
const WILLOW_BARK: BarkLook = { kind: 'willow', tile: 1.0, relief: 1.25, gain: 1.6, moss: [0.11, 0.15, 0.05] };
/** A maple's bark: grey, in long shallow plates. */
const MAPLE_BARK: BarkLook = { kind: 'maple', tile: 1.0, relief: 1.0, gain: 1.55, moss: [0.12, 0.15, 0.07] };
/** A yew's bark: thin red-brown scales flaking off redder bark. */
const YEW_BARK: BarkLook = { kind: 'yew', tile: 0.85, relief: 1.0, gain: 1.45, moss: [0.1, 0.12, 0.05] };
/** The magic tree's bark: pale silver-blue flowing ridges, faintly glowing blue veins between them. */
const MAGIC_BARK: BarkLook = { kind: 'magic', tile: 1.2, relief: 0.8, gain: 1.2, moss: [0.3, 0.36, 0.44], glow: 0.5 };

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
    look: { trunk: (m, w) => grownBark(m, w, OAK_BARK), canopy: (m, w) => grownLeaves(m, w, 'oak'), size: [0.9, 1.08], spacing: 7.5, palette: [0x557f41, 0x5b8643, 0x4c763d, 0x737f3d, 0xa88c45], autumn: [0x9a7a3a, 0xa8823c, 0x8a6a34, 0xb0603a, 0x6f7a3c] },
  },
  // Willows in light, silvery yellow-greens, by the water: a broad curtain, one leaning out, one
  // forking low into several stems, one taller and narrower.
  willow: {
    species: WILLOW,
    seeds: [72, 65, 89, 70],
    forms: [{}, { lean: 1.3, spread: [10.8, 12.2] }, { fork: [1.4, 1.8], limbs: [5, 6] }, { height: [9.6, 10.4], spread: [8.6, 9.6], lean: 0.3 }],
    look: { trunk: (m, w) => grownBark(m, w, WILLOW_BARK), canopy: (m, w) => grownLeaves(m, w, 'willow'), size: [0.92, 1.06], spacing: 8.5, palette: [0x86a04f, 0x8fa853, 0x7c9649, 0x9fa64c, 0xb2a64e], waterside: true },
  },
  // Maples in rich summer greens, now and then one turning red or orange; where the zone wears its
  // autumn, all in reds, oranges and golds. A broad dome, an upright oval, one leaning, a wide spreader.
  maple: {
    species: MAPLE,
    seeds: [31, 32, 33, 34],
    forms: [{}, { height: [10.8, 11.6], spread: [7.6, 8.4], crownBase: 0.28 }, { lean: 0.9, limbs: [4, 5] }, { height: [9.4, 10.2], spread: [10.4, 11.2], rise: [0.42, 0.95] }],
    look: { trunk: (m, w) => grownBark(m, w, MAPLE_BARK), canopy: (m, w) => grownLeaves(m, w, 'maple'), size: [0.92, 1.06], spacing: 7, palette: [0x5b8c3f, 0x63943f, 0x56843c, 0xa8563a, 0xb8843c], autumn: [0xb04e30, 0xc0702e, 0xa8402c, 0xc49a3c, 0x9a3a2c] },
  },
  // Yews in deep, dark blue-greens: a broad dome, a tall cone, a squat one splitting low into many stems.
  yew: {
    species: YEW,
    seeds: [71, 70, 70],
    forms: [{}, { taper: 0.65, height: [9.0, 9.8], spread: [6.6, 7.4] }, { fork: [1.2, 1.5], limbs: [7, 8], spread: [8.6, 9.6], height: [7.6, 8.4], taper: 0.1 }],
    look: { trunk: (m, w) => grownBark(m, w, YEW_BARK), canopy: (m, w) => grownLeaves(m, w, 'yew'), size: [0.92, 1.06], spacing: 6.5, palette: [0x3c5e34, 0x426636, 0x375731, 0x4a6a38, 0x465f35] },
  },
  // Magic trees glowing teal: graceful and upright, one leaning, a wide vase, a tall slender one.
  magic: {
    species: MAGIC,
    seeds: [63, 64, 65, 66],
    forms: [{}, { lean: 1.1 }, { rise: [0.95, 1.3], spread: [9.2, 10.4], fill: [0.3, 0.5] }, { height: [11.4, 12.2], spread: [7.0, 7.8] }],
    look: { trunk: (m, w) => grownBark(m, w, MAGIC_BARK), canopy: (m, w) => grownLeaves(m, w, 'magic', 0.32), size: [0.94, 1.06], spacing: 7.5, palette: [0x3aa88a, 0x42b294, 0x369c80, 0x4cbc9c, 0x5ab8b0] },
  },
};

/** The species one shape of a grown kind grows from: the kind's species with that shape's departures. */
export const grownSpecies = (kind: GrownKind, v: number): Species => ({ ...GROWN[kind].species, ...GROWN[kind].forms?.[v] });

const grownSets = new Map<GrownKind, { trunk: THREE.BufferGeometry[]; canopy: THREE.BufferGeometry[] }>();

/** A grown kind's shapes: each one's wood and its leaves (built once, shared). */
export function grownTrees(kind: GrownKind) {
  let set = grownSets.get(kind);
  if (!set) {
    const { seeds } = GROWN[kind];
    const grown = seeds.map((seed, v) => growTree(grownSpecies(kind, v), seed));
    set = { trunk: grown.map(woodGeometry), canopy: grown.map((sk, i) => leafGeometry(sk, seeds[i])) };
    for (const g of [...set.trunk, ...set.canopy]) shareResource(g);
    grownSets.set(kind, set);
  }
  return set;
}

/** Which grown species stand in a zone in place of each of its tree kinds (weights), and which of them wear autumn there. */
export interface Woods {
  kinds: Partial<Record<TreeKind, Partial<Record<GrownKind, number>>>>;
  autumn?: GrownKind[];
}

/** A zone's woods when its theme names none: broadleaves are oaks and common trees, conifers yews. */
export const DEFAULT_WOODS: Woods = { kinds: { grove: { oak: 1, tree: 1 }, pine: { yew: 1 } } };

/**
 * The grown species of one tree from its kind's weights: `n` (0..1, a smooth noise, so species stand
 * in groves) picks it. By water a waterside species is four times likelier, away from it a third as likely.
 */
export function pickGrown(weights: Partial<Record<GrownKind, number>>, n: number, wet: boolean): GrownKind | null {
  const kinds = GROWN_KINDS.filter((k) => (weights[k] ?? 0) > 0);
  if (!kinds.length) return null;
  const w = kinds.map((k) => weights[k]! * (GROWN[k].look.waterside ? (wet ? 4 : 0.35) : 1));
  let v = Math.min(0.999999, Math.max(0, n)) * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < kinds.length; i++) {
    v -= w[i];
    if (v < 0) return kinds[i];
  }
  return kinds[kinds.length - 1];
}

function naturalSet(): TreeSet {
  // (The kinds no grown species stands in for keep the block models, shared with the block style;
  // the dead ash and the bushes are grown.)
  return { ...treeSet('block'), natural: true, grown: grownStandIns() };
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

/** Triangles per tree (its trunk and canopy, the heaviest variant) of every kind in a style (the natural style's grown trees: grownTriangles). */
export function treeTriangles(style: TreeStyle): Record<TreeKind, number> {
  const s = treeSet(style);
  const per = (k: TreeKind) => Math.max(...s.canopy[k].map((c, v) => triangles(s.trunk[k][Math.min(v, s.trunk[k].length - 1)]) + triangles(c)));
  return { grove: per('grove'), pine: per('pine'), ash: per('ash') };
}

/** Triangles per tree of a grown kind (its trunk and canopy), each shape. */
export function grownTriangles(kind: GrownKind) {
  const set = grownTrees(kind);
  return set.canopy.map((c, v) => triangles(set.trunk[v]) + triangles(c));
}

/** Which of `at` stand clear of every stone (its reach `r`, and `room` m more): a grown dead ash is not planted with its foot in a boulder. */
export function clearOfStones(at: { x: number; z: number }[], stones: { x: number; z: number; r: number }[], room: number) {
  return at.map((p) => stones.every((s) => Math.hypot(s.x - p.x, s.z - p.z) >= s.r + room));
}

/**
 * Thin a wood for grown trees, which need far more room than block trees laid one to a cell. The
 * grown trees (those with a `spacing`, in metres) are taken in an order hashed from their positions
 * (so no scan-line pattern), those marked `first` (dead ash, standing in their own small patches)
 * before the rest, and one stays only where no grown tree already kept stands within its spacing or
 * the kept one's, whichever is wider; then every other tree, and every piece of undergrowth, under a
 * kept crown (within half its spacing) goes. Returns which stay.
 */
export function thinWood(trees: { x: number; z: number; spacing?: number; first?: boolean }[], under: { x: number; z: number }[] = []) {
  const kept: { x: number; z: number; r: number }[] = [];
  const keep = trees.map(() => true);
  const grown = trees.map((_, i) => i).filter((i) => trees[i].spacing !== undefined);
  grown.sort((a, b) => Number(!trees[a].first) - Number(!trees[b].first) || hash01(trees[a].x, trees[a].z, 7) - hash01(trees[b].x, trees[b].z, 7));
  for (const i of grown) {
    const p = trees[i], r = p.spacing!;
    keep[i] = kept.every((q) => Math.hypot(p.x - q.x, p.z - q.z) >= Math.max(r, q.r));
    if (keep[i]) kept.push({ x: p.x, z: p.z, r });
  }
  const clear = (p: { x: number; z: number }) => kept.every((q) => Math.hypot(p.x - q.x, p.z - q.z) >= q.r * 0.5);
  trees.forEach((p, i) => p.spacing === undefined && (keep[i] = clear(p)));
  return { trees: keep, under: under.map(clear) };
}
