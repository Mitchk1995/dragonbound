import * as THREE from 'three';
import { CURTAIN_WALL } from '../data/castle';
import { shareResource } from '../render/resources';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ModelKit, PAL, type V3 } from '../render/kit';
import { hasModel, makeModel } from '../render/registry';
import { applyFinish, studioEnv } from '../render/env';
import { applyPaint, type PaintKind } from '../render/paint';
import { KERB_W } from './kerbStones';
import { bondPhases, cleanBreaks, COURSE, drumStones, Laid, laidDrum, laidRun, masonGeometry, STONE as STONE_LEN, type DrumOpts, type LaidCorner, type MasonOpts } from '../render/masonry';
import { addPatch } from '../render/surface';
import { chamferBox, hash01, octagon, prism, rockBlock, slabBlock, taper, wedge } from '../render/blocks';
import { makePortal, type PortalSpec } from './portalFx';
import { arc, crossedRibbons, fallingWaterMaterial, mistTexture, planarReflection, pour, poolWater, type Impact } from './water';

export interface Prop {
  obj: THREE.Group;
  /** Per-frame animation (flames, portal swirl…). */
  tick?: (t: number) => void;
  light?: THREE.PointLight;
  /** Swap between states, e.g. ruined/restored or full/depleted. */
  setState?: (state: string) => void;
}

/**
 * World props are modular blocks: chamfered boxes, stacked stone courses, wedges and faceted
 * chunks (src/render/blocks.ts), in clean flat colours. Only effects stay organic (flames, the
 * portal column). Every prop is built facing +Z (its front) with its base on y = 0.
 */

// Masonry: close shades of one stone so walls read as blocks, never as stripes.
export const STONE = 0x8a8478, STONE_L = 0x969086, STONE_D = 0x6e685f, STONE_DD = 0x57524b;
/**
 * Dragonspire Castle's own stone (docs/CASTLE_DESIGN.md, "Colour and materials"): cream limestone
 * for every mass, its trim cut from the same stone (the owner's pick, October 3): the dressed stones
 * of string courses, copings, arches, jambs and sills a shade paler (DRESS), the deep base courses a
 * shade darker, weathered (BASE), and a grey deck for walks and platforms. Blue is kept for the slate
 * of roofs and spires, the doors and the livery. The rest of the world keeps STONE.
 */
export const ASHLAR = 0xc5b79b, ASHLAR_L = 0xd4c8b0, ASHLAR_W = 0xafa38a;
/** The buildings' (and the keep's) ivory, a clear step paler than the honey curtain and towers. */
export const ASHLAR_B = 0xefe3c8;
export const DRESS = ASHLAR_L, BASE = ASHLAR_W, DECK = 0x8a8478;
/** The dark slate inlaid in the wall towers' compass roses. */
const INLAY = 0x545e6c;
/** Kerbs and borders edging the castle's paving: the paving's own stone a shade darker. */
export const KERB = 0x736d66;
/** Flagstones laid as props (the round terrace's): the road's flagstone tone, and a little darker. */
const FLAG = 0x958f86, FLAG_D = 0x8a847b;
/** A road's flagstones laid as a prop (the climb's paving): the paved ground's own grey. */
const PAVE = 0x8c8780;
/** The spires: deep slate-navy (the castle's second blue, between the grey dressings and the royal livery). */
export const SLATE_BLUE = 0x34466a;
/** The castle buildings' flat roofs: lead in the spires' slate-navy, laid in a subtle two-tone diamond chequer. */
export const ROOF_BLUE = 0x34466a, ROOF_BLUE_L = 0x3c4f74, ROOF_ROLL = 0x4a5a7c;
/** Gilding laid on stone and slate (bands, friezes, fillets): matt gold leaf, not polished metal. */
export const GILT = 0xd6a646;
/** The lord's livery: royal blue cloth (field and shade) charged and edged in gold (PAL.gold). */
export const HERALD_BLUE = 0x2f5ad0, HERALD_BLUE_D = 0x2442a0;
export const BRICK = 0x9a5a42, BRICK_L = 0xa8664a, BRICK_D = 0x7e4836;
export const WOOD = PAL.wood, WOOD_D = 0x4a3020, WOOD_L = 0x8a6440;
export const SLATE = 0x4e5564, PLASTER = 0xd6cab0, DARK = 0x1c1612;
export const IRON = 0x4a4a52, IRON_L = 0x6e7280;
const BONE = 0xcbbd9c, BONE_D = 0xa8997a;
export const COAL = 0x161517, OBSIDIAN = 0x1a1418;
/** Old iron gone to rust (the cracked anvil): dull brown iron with a paler pitted face, rust streaks. */
const RUSTY = 0x5a4842, RUSTY_L = 0x6e5a50, RUST = 0x8a4a2a;
/** The Emberforge's stone: warm dressed sandstone, or soot-blackened while it lies cold. */
const SAND = [0xa89478, 0xb4a084, 0x9a876c], SOOT = [0x6a645c, 0x5a554f, 0x4c4742], BRICK_SOOT = [0x5a3a30, 0x4a3028, 0x6a4436];
/** Basalt (lair): cooled black rock with slightly lighter weathered tops. */
const BASALT = 0x2e2626, BASALT_L = 0x453a36, BASALT_D = 0x201a1a;
/** Standing water on a cave floor: dark and glossy (reflects like coal and obsidian). */
const PUDDLE = 0x1a3238;
/** Rock wet with spray behind and beside a waterfall: darker, with a glossy sheen. */
const ROCK_WET = 0x444a56;
/** The castle's lamp and lantern metal: dark navy-lacquered iron, picked out in gold. */
export const LAMP_NAVY = 0x27324a;
const METALS = new Set([IRON, IRON_L, PAL.gold, LAMP_NAVY]);
const GLOSSY = new Set([COAL, OBSIDIAN]);
/** Cut blocks built as geometry (walls of the tower, forge bricks): painted as chiselled rock, no mortar. */
export const BLOCKS = [0x8b8579, 0x979187, 0x6f6960];

/** Plot markers and restored buildings: each profession's colour. */
export const PLOT_MARK: Record<string, number> = { vault_expanded: PAL.gold, alchemy_lab: 0x5ad07a, rune_altar: 0x6aa8ff, hatchery: 0xffa050 };

/** Painted albedo per prop colour (explicit where known; judged by hue otherwise). */
const PAINT_OF = new Map<number, PaintKind>();
const paintAs = (kind: PaintKind, cols: number[]) => cols.forEach((c) => PAINT_OF.set(c, kind));
paintAs('masonry', [STONE, STONE_L, STONE_D, STONE_DD, 0x7e776c, 0x7a7870, 0x6a6860, 0x6e6a66]);
paintAs('rock', [RUSTY, RUSTY_L, RUST, ...BLOCKS, BASALT, BASALT_L, BASALT_D, 0x3a2e24, 0x241e1a, 0x1a1311, 0x0f0b0a, 0x2a1d17, BRICK, BRICK_L, BRICK_D, 0x4a4240, 0x3e3634, 0x554c48, 0x3a3230, 0x3a3232, 0x2a2424, 0x6a6258, 0x6e6a66, 0x3c3834, 0x2e2624, 0x7a7068, 0x6a6058, 0x4a4440, 0x6a5a40, 0x5a4a34, 0x2e2828, 0x241e1e, 0x1e1818]);
paintAs('wood', [WOOD, WOOD_D, WOOD_L, 0x7a5636, 0x94704a, 0x5a3a22, 0x3a2618, 0x5a3a20, 0x4a2e18, 0x8a6a44, 0x5a4a3a, 0x3a2a1e, 0xa08058]);
paintAs('shingle', [SLATE, 0x3e4450, 0x4a6a48, 0x4a4a78, 0x9a5438, 0x3e6a6a, 0x7a4a34]);
paintAs('masonry', [...SAND, ...SOOT]);
paintAs('ashlar', [ASHLAR, ASHLAR_L, ASHLAR_W, ASHLAR_B]);
paintAs('masonry', [KERB, INLAY, DECK, PAVE]);
paintAs('shingle', [SLATE_BLUE]);
paintAs('masonry', [ROOF_BLUE, ROOF_BLUE_L, ROOF_ROLL]);
paintAs('soft', [GILT]);
paintAs('soft', [HERALD_BLUE, HERALD_BLUE_D]);
paintAs('rock', BRICK_SOOT);
paintAs('soft', [0x4b3122]);
paintAs('bone', [BONE, BONE_D, PAL.bone]);
paintAs('plaster', [PLASTER, 0xe8dcc0, 0xc8b070]);
paintAs('hide', [0x8a6a48, 0x6e5238, 0x7a5a3a, 0x5a4230, 0x8a4a34, 0x6a3a2a, 0x8a2424, 0x8a2a1e, 0x7a2020, 0x6a2020, 0xa03030, PAL.leather]);

/** Ivy and climbing roses on the castle's walls: leaf greens (painted as foliage) and the roses' blooms. */
const CLIMBER_IVY = [0x55862f, 0x67973a, 0x7aa644], CLIMBER_ROSE_LEAF = [0x3e6e30, 0x4a7a36, 0x56863c], CLIMBER_BLOOM = [0xe0507a, 0xf08aa8, 0xf6eee2];
/** A climber's leaf card: a flat pointed leaf (a squashed octahedron), lying flat to the wall. */
/** A climber's leaf: a small flat card (five-sided, so a sheet of them reads as foliage, not tiles). */
const CLIMBER_LEAF = new THREE.CircleGeometry(1, 7);
/** The garden trees' leaf (clipped green, pink blossom, gold, apple), painted as foliage like the island's trees. */
const GARDEN_LEAF = [[0x3e6e2e, 0x4a7a34, 0x56883c], [0xe48aac, 0xf2b4c8, 0xd27298], [0xdcae46, 0xeac460, 0xc8983a], [0x44742f, 0x4f8036, 0x5a8c3e]];
paintAs('foliage', GARDEN_LEAF.flat());
paintAs('foliage', [...CLIMBER_IVY, ...CLIMBER_ROSE_LEAF]);

function paintFor(hex: number): PaintKind {
  const known = PAINT_OF.get(hex);
  if (known) return known;
  const hsl = new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
  if (hsl.s < 0.12) return 'rock';
  if (hsl.h > 0.03 && hsl.h < 0.12 && hsl.l < 0.45) return 'wood';
  return 'soft';
}

type Obj = THREE.Object3D;

/** Quantise sizes so blocks share cached geometry. */
const q = (v: number) => Math.round(v * 20) / 20;

/** Chamfered box. */
export function cb(k: ModelKit, p: Obj, size: V3, pos: V3, color: number, rot?: V3, c = 0.05, em = 0, int = 1) {
  return k.mesh(p, chamferBox(size[0], size[1], size[2], c), color, pos, rot, em, int);
}

/** The castle's deep base course: one course a metre high, laid in long weathered blocks. */
export const BASE_COURSE = 1.0;
const BASE_STONE = 2.0;
/** Mark a part as laid in the deep base course (the castle's one other block size: see masonry.ts). */
export function deep<T extends THREE.Object3D>(m: T): T {
  m.userData.course = BASE_COURSE;
  m.userData.stone = BASE_STONE;
  return m;
}

/**
 * Where a crown begins over a platform at height P: the course line at P (or the one just over it),
 * so the course that carries the parapet ends on a course line and the parapet stands on it.
 */
export const crownFoot = (P: number) => COURSE * Math.ceil((P - 0.2) / COURSE - 1e-6);

/**
 * Points spread evenly along a run `L` long (centred on 0) about `step` apart, the first and last
 * `clear` in from its ends: merlons, corbels and posts that end the same way at both ends.
 */
export function spread(L: number, step: number, clear: number): number[] {
  const span = L - 2 * clear;
  if (span < 0) return [];
  const n = Math.max(1, Math.round(span / step));
  return Array.from({ length: n + 1 }, (_, i) => -span / 2 + (span * i) / n);
}

/** A faceted rock chunk (base at y = pos.y). */
export function chunk(k: ModelKit, p: Obj, seed: number, size: V3, pos: V3, color: number, rotY = 0, em = 0, int = 1) {
  // A rock chunk's colour paints as rock unless it is already claimed (warm browns would
  // otherwise be judged wood and get plank grain).
  if (!PAINT_OF.has(color) && !em) PAINT_OF.set(color, 'rock');
  return k.mesh(p, rockBlock(seed, size[0], size[1], size[2]), color, pos, [0, rotY, 0], em, int);
}

/** A flat-topped rock slab with sheer sides (base at y = pos.y), scaled to `size`. */
export function slab(k: ModelKit, p: Obj, seed: number, size: V3, pos: V3, color: number, rotY = 0) {
  if (!PAINT_OF.has(color)) PAINT_OF.set(color, 'rock');
  const m = k.mesh(p, slabBlock(seed), color, pos, [0, rotY, 0]);
  m.scale.set(...size);
  return m;
}

/**
 * A flat, ragged disc lying on the ground (scorch marks, puddles): a triangle fan whose rim radius
 * alternates between `inner` and `outer` (plus seeded jitter), facing up.
 */
const fanCache = new Map<string, THREE.BufferGeometry>();
function raggedDisc(seed: number, spokes: number, inner: number, outer: number, jitter: number) {
  const key = `${seed},${spokes},${inner},${outer},${jitter}`;
  let geo = fanCache.get(key);
  if (geo) return geo;
  const rim: [number, number][] = [];
  for (let i = 0; i < spokes; i++) {
    const a = ((i + (hash01(seed, i, 7) - 0.5) * 0.5) / spokes) * Math.PI * 2;
    const r = (i % 2 ? inner : outer) * (1 - jitter / 2 + hash01(seed, i) * jitter);
    rim.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const pos: number[] = [];
  for (let i = 0; i < spokes; i++) {
    const [ax, az] = rim[i], [bx, bz] = rim[(i + 1) % spokes];
    // Wound so the face points up (+Y).
    pos.push(0, 0, 0, bx, 0, bz, ax, 0, az);
  }
  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  fanCache.set(key, shareResource(geo));
  return geo;
}

/**
 * A blocky clay amphora (about 0.9 tall, base at the pivot) under `parent`: foot, octagonal body,
 * shoulder, neck, lip and two handles. `broken`: the shoulder and neck gone, sherds beside it.
 */
function amphora(k: ModelKit, parent: Obj, pos: V3, rot: V3, seed: number, broken = false) {
  const p = new THREE.Group();
  p.position.set(...pos);
  p.rotation.set(...rot);
  parent.add(p);
  const clay = [0xa0583a, 0x9a6a44, 0x8a4a30][seed % 3], dark = 0x6a3a26;
  k.mesh(p, taper(0.2, 0.2, 0.3, 0.3, 0.14), dark, [0, 0.07, 0]);
  cb(k, p, [0.5, 0.42, 0.5], [0, 0.35, 0], clay, undefined, 0.14);
  cb(k, p, [0.52, 0.05, 0.52], [0, 0.44, 0], dark, undefined, 0.14);
  if (broken) {
    for (let i = 0; i < 3; i++) cb(k, parent, [0.22, 0.05, 0.16], [pos[0] + Math.cos(i * 2.1 + seed) * 0.45, 0.03, pos[2] + Math.sin(i * 2.1 + seed) * 0.45], clay, [0, i + seed, 0.1], 0.01);
    return p;
  }
  k.mesh(p, taper(0.5, 0.5, 0.2, 0.2, 0.2), clay, [0, 0.66, 0]);
  cb(k, p, [0.16, 0.2, 0.16], [0, 0.85, 0], clay, undefined, 0.04);
  cb(k, p, [0.24, 0.06, 0.24], [0, 0.96, 0], dark, undefined, 0.02);
  for (const sx of [-1, 1]) cb(k, p, [0.06, 0.24, 0.06], [sx * 0.16, 0.78, 0], dark, [0, 0, sx * -0.5], 0.01);
  return p;
}

/**
 * A soft-edged flat patch facing up (puddles, damp ground): a centre fan and two rings with an
 * irregular, lobed outline; colour `rgb` everywhere, alpha `a` over the inner part fading to 0 at
 * the rim, so it has no hard outline.
 */
const softCache = new Map<string, THREE.BufferGeometry>();
function softDisc(seed: number, r: number, rgb: [number, number, number], a: number) {
  const key = `${seed},${r},${rgb},${a}`;
  let geo = softCache.get(key);
  if (geo) return geo;
  const N = 28;
  const rim = Array.from({ length: N }, (_, i) => {
    const t = (i / N) * Math.PI * 2;
    const lobe = 1 + 0.16 * Math.sin(t * 2 + seed) + 0.1 * Math.sin(t * 3 + seed * 1.7) + (hash01(seed, i) - 0.5) * 0.1;
    return [Math.cos(t) * r * lobe, Math.sin(t) * r * lobe * 0.8];
  });
  const pos: number[] = [], col: number[] = [];
  const P = (f: number, i: number, al: number) => {
    const [x, z] = rim[i % N];
    pos.push(x * f, 0, z * f);
    col.push(...rgb, al);
  };
  for (let i = 0; i < N; i++) {
    // Centre fan (full alpha), then the inner ring to 0.72, then the fade to the rim.
    pos.push(0, 0, 0);
    col.push(...rgb, a);
    P(0.62, i + 1, a);
    P(0.62, i, a);
    for (const [f0, a0, f1, a1] of [[0.62, a, 0.86, a * 0.55], [0.86, a * 0.55, 1, 0]]) {
      P(f0, i, a0); P(f0, i + 1, a0); P(f1, i + 1, a1);
      P(f0, i, a0); P(f1, i + 1, a1); P(f1, i, a1);
    }
  }
  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  softCache.set(key, shareResource(geo));
  return geo;
}

/**
 * Broken foam: `n` small soft blobs of foam scattered over a patch of radius `r` (denser and brighter
 * toward its heart), merged, so it reads as churned water rather than a disc.
 */
const foamCache = new Map<string, THREE.BufferGeometry>();
export function brokenFoam(seed: number, r: number, n: number, a: number) {
  const key = `${seed},${r},${n},${a}`;
  let geo = foamCache.get(key);
  if (geo) return geo;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const ang = hash01(seed, i, 1) * Math.PI * 2, d = Math.sqrt(hash01(seed, i, 2)) * r * 0.8;
    const br = r * (0.1 + 0.15 * hash01(seed, i, 3)) * (1.2 - (0.5 * d) / r);
    parts.push(softDisc(seed * 31 + i, Math.max(0.05, br), [0.94, 0.97, 0.98], a * (1 - (0.55 * d) / r)).clone().translate(Math.cos(ang) * d, 0.001 * i, Math.sin(ang) * d));
  }
  geo = mergeGeometries(parts)!;
  foamCache.set(key, geo);
  return geo;
}

/**
 * A broken ring of foam spreading from where water lands (radius 1, scaled as it spreads): a few
 * arcs of soft blobs with gaps between them, wandering in and out a little, never a clean circle.
 */
const ringCache2 = new Map<number, THREE.BufferGeometry>();
export function foamArcs(seed: number) {
  let geo = ringCache2.get(seed);
  if (geo) return geo;
  const parts: THREE.BufferGeometry[] = [];
  let t = hash01(seed, 0) * Math.PI * 2;
  for (let arcN = 0; arcN < 4; arcN++) {
    const span = 0.5 + hash01(seed, arcN, 1) * 0.9, n = Math.round(span * 7);
    for (let i = 0; i < n; i++) {
      const a = t + (span * i) / n, rr = 1 + (hash01(seed, arcN, i) - 0.5) * 0.16;
      const blob = softDisc(seed * 17 + arcN * 7 + i, 0.09 + hash01(seed, i, arcN + 5) * 0.07, [0.92, 0.96, 0.97], 0.55 + 0.3 * hash01(seed, arcN, i + 9));
      parts.push(blob.clone().translate(Math.cos(a) * rr, 0, Math.sin(a) * rr));
    }
    t += span + 0.35 + hash01(seed, arcN, 3) * 0.6;
  }
  geo = mergeGeometries(parts)!;
  ringCache2.set(seed, geo);
  return geo;
}

/**
 * Cooled crust plates: Voronoi cells over an elliptical patch (radii CRUST_RX × CRUST_RZ along
 * X/Z), split by a narrow crack and extruded a few centimetres, merged into three geometries (one
 * per colour). The rim follows a ragged ellipse, so the patch has no clean outline.
 */
const CRUST_RX = 1.55, CRUST_RZ = 1.0;
const plateCache = new Map<number, THREE.BufferGeometry[]>();
function crustPlates(seed: number) {
  const hit = plateCache.get(seed);
  if (hit) return hit;
  const RX = CRUST_RX, RZ = CRUST_RZ, GAP = 0.045;
  // Scattered seeds with a varying minimum spacing: plates of mixed sizes, no honeycomb.
  const seeds: [number, number][] = [];
  for (let i = 0; i < 90 && seeds.length < 16; i++) {
    const a = hash01(seed, i, 1) * Math.PI * 2, r = Math.sqrt(hash01(seed, i, 2)) * 0.92;
    const x = Math.cos(a) * r * RX, z = Math.sin(a) * r * RZ;
    const gap = 0.34 + hash01(seed, i, 3) * 0.3;
    if (seeds.every(([sx, sz]) => Math.hypot(sx - x, sz - z) > gap)) seeds.push([x, z]);
  }
  const rim: [number, number][] = [];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2, r = 0.8 + hash01(seed, i, 5) * 0.24;
    rim.push([Math.cos(a) * RX * r, Math.sin(a) * RZ * r]);
  }
  const parts: number[][] = [[], [], []];
  seeds.forEach(([sx, sz], si) => {
    let poly = rim.slice();
    for (const [ox, oz] of seeds) {
      if (ox === sx && oz === sz) continue;
      const dl = Math.hypot(ox - sx, oz - sz), dx = (ox - sx) / dl, dz = (oz - sz) / dl, mx = (ox + sx) / 2, mz = (oz + sz) / 2;
      const f = (p: [number, number]) => (p[0] - mx) * dx + (p[1] - mz) * dz + GAP / 2;
      const out: [number, number][] = [];
      poly.forEach((a, i) => {
        const b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b);
        if (fa <= 0) out.push(a);
        if (fa <= 0 !== fb <= 0) {
          const t = fa / (fa - fb);
          out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
      });
      poly = out;
      if (poly.length < 3) return;
    }
    const cx = poly.reduce((t, p) => t + p[0], 0) / poly.length, cz = poly.reduce((t, p) => t + p[1], 0) / poly.length;
    const top = 0.03 + hash01(seed, si, 3) * 0.03, bot = -0.02;
    const pos = parts[si % 3];
    const tri = (a: number[], b: number[], c: number[], want: number[]) => {
      // Wind each triangle so its normal faces `want` (up for the top, outward for the sides).
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) pos.push(...a, ...c, ...b);
      else pos.push(...a, ...b, ...c);
    };
    // A slight tilt per plate, so neighbours catch the light differently.
    const tx = (hash01(seed, si, 7) - 0.5) * 0.05, tz = (hash01(seed, si, 8) - 0.5) * 0.05;
    const yt = (x: number, z: number) => top + (x - cx) * tx + (z - cz) * tz;
    for (let i = 0; i < poly.length; i++) {
      const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
      tri([cx, yt(cx, cz), cz], [ax, yt(ax, az), az], [bx, yt(bx, bz), bz], [0, 1, 0]);
      const out = [(ax + bx) / 2 - cx, 0, (az + bz) / 2 - cz];
      tri([ax, yt(ax, az), az], [bx, yt(bx, bz), bz], [bx, bot, bz], out);
      tri([ax, yt(ax, az), az], [bx, bot, bz], [ax, bot, az], out);
    }
  });
  const geos = parts.filter((p) => p.length).map((p) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    geo.computeVertexNormals();
    return geo;
  });
  plateCache.set(seed, geos.map(shareResource));
  return geos;
}

/** Ground-hugging parts (decals, seams) never cast shadows: flag their material. */
function decal(m: THREE.Mesh) {
  (m.material as THREE.Material).userData.decal = true;
  return m;
}

// ─── The Great Anvil ────────────────────────────────────────────────────────

/** Height of the anvil's face above its feet. */
const ANVIL_FACE = 0.6;

/**
 * A closed solid lofted through rings of points (every ring the same length, each listed in the
 * same turning order around the axis), capped at both ends: flat-shaded and wound outward.
 */
function loft(rings: V3[][]) {
  const pos: number[] = [];
  const tri = (a: V3, b: V3, c: V3) => pos.push(...a, ...b, ...c);
  const mid = (r: V3[]): V3 => [0, 1, 2].map((i) => r.reduce((s, p) => s + p[i], 0) / r.length) as V3;
  const n = rings[0].length;
  for (let i = 0; i + 1 < rings.length; i++) {
    const p = rings[i], q = rings[i + 1];
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n;
      tri(p[j], p[k], q[k]);
      tri(p[j], q[k], q[j]);
    }
  }
  const a = rings[0], b = rings[rings.length - 1], ca = mid(a), cz = mid(b);
  for (let j = 0; j < n; j++) {
    const k = (j + 1) % n;
    tri(ca, a[k], a[j]);
    tri(cz, b[j], b[k]);
  }
  // Wind outward: flip every triangle if the enclosed volume came out negative.
  let vol = 0;
  for (let i = 0; i < pos.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz2] = pos.slice(i, i + 9);
    vol += ax * (by * cz2 - bz * cy) - ay * (bx * cz2 - bz * cx) + az * (bx * cy - by * cx);
  }
  if (vol < 0) for (let i = 0; i < pos.length; i += 9) for (let c = 0; c < 3; c++) [pos[i + 3 + c], pos[i + 6 + c]] = [pos[i + 6 + c], pos[i + 3 + c]];
  return pos;
}

function geoOf(pos: number[]) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

/** A chamfered rectangle ring (8 points) through `at(u, v)`, half sizes hu × hv, chamfer c. */
function rectRing(hu: number, hv: number, c: number, at: (u: number, v: number) => V3): V3[] {
  return [[hu, -hv + c], [hu, hv - c], [hu - c, hv], [-hu + c, hv], [-hu, hv - c], [-hu, -hv + c], [-hu + c, -hv], [hu - c, -hv]].map(([u, v]) => at(u, v));
}

/**
 * The anvil's iron, feet on y = 0, horn toward +X, front +Z: [the iron, its flat face, the marks on
 * it (the hardy hole, and the crack when `cracked`)]. The stand (lofted up through its feet, waist
 * and throat) and the body (lofted from the heel to the horn's point) are welded into one mesh.
 */
const anvilCache = new Map<boolean, THREE.BufferGeometry[]>();
function anvilIron(cracked: boolean) {
  const hit = anvilCache.get(cracked);
  if (hit) return hit;
  const F = ANVIL_FACE, X0 = -0.04;
  // The stand, bottom to top: [y, half length, half width]. Its top ring is buried in the body.
  const stand: [number, number, number][] = [[0, 0.38, 0.2], [0.06, 0.38, 0.2], [0.085, 0.31, 0.16], [0.2, 0.21, 0.075], [0.3, 0.22, 0.08], [0.4, 0.35, 0.11], [0.5, 0.48, 0.13]];
  const iron = loft(stand.map(([y, hx, hz]) => rectRing(hx, hz, Math.min(hx, hz) * 0.35, (u, v) => [X0 + u, y, v])));
  // The body, heel to horn: [x, underside, top, half width]. Square in section along the face; from
  // the horn's root on, a flat top over a keel narrowing to the point.
  const body: [number, number, number, number][] = [[-0.62, 0.46, F - 0.01, 0.13], [-0.6, 0.44, F, 0.14], [0.4, 0.44, F, 0.14], [0.42, 0.44, F, 0.14], [0.42, 0.44, F - 0.035, 0.14]];
  const horn: [number, number, number, number][] = cracked
    ? [[0.47, 0.42, F - 0.035, 0.13], [0.6, 0.45, F - 0.04, 0.105]]
    : [[0.47, 0.42, F - 0.035, 0.13], [0.62, 0.45, F - 0.04, 0.1], [0.78, 0.49, F - 0.045, 0.06], [0.92, 0.525, F - 0.05, 0.022], [0.98, 0.54, F - 0.055, 0.004]];
  const rings: V3[][] = body.map(([x, yb, yt, hz]) => rectRing(hz, (yt - yb) / 2, 0.025, (u, v) => [x, (yt + yb) / 2 + v, u]));
  for (const [x, yb, yt, hz] of horn) {
    const h = yt - yb, c = Math.min(0.025, hz * 0.3);
    rings.push([[x, yt - c, hz], [x, yt - h * 0.6, hz * 0.7], [x, yb, hz * 0.06], [x, yb, -hz * 0.06], [x, yt - h * 0.6, -hz * 0.7], [x, yt - c, -hz], [x, yt, -hz + c], [x, yt, hz - c]]);
  }
  // Snapped off: the break is ragged, each point of the last ring torn to its own length.
  if (cracked) rings.push(rings[rings.length - 1].map(([x, y, z], i) => [x + 0.02 + hash01(41, i) * 0.06, y, z * 0.9]));
  const bodyPos = loft(rings);
  // The face: the body's level top, split off to take its own colour.
  const face: number[] = [], rest: number[] = [];
  for (let i = 0; i < bodyPos.length; i += 9) {
    const t = bodyPos.slice(i, i + 9);
    const level = Math.abs(t[1] - F) < 1e-4 && Math.abs(t[4] - F) < 1e-4 && Math.abs(t[7] - F) < 1e-4;
    (level ? face : rest).push(...t);
  }
  // The marks, a hair above the iron: the hardy hole by the heel, and on the old anvil a crack
  // across the face and down the front flank.
  const marks: number[] = [];
  const quad = (a: V3, b: V3, c: V3, d: V3) => marks.push(...a, ...b, ...c, ...a, ...c, ...d);
  const y = F + 0.004;
  quad([-0.54, y, -0.04], [-0.54, y, 0.04], [-0.46, y, 0.04], [-0.46, y, -0.04]);
  if (cracked) {
    const w = 0.012;
    const across: [number, number][] = [[-0.06, -0.14], [-0.03, -0.07], [-0.07, 0], [-0.04, 0.07], [-0.08, 0.144]];
    for (let i = 0; i + 1 < across.length; i++) {
      const [x0, z0] = across[i], [x1, z1] = across[i + 1];
      quad([x0 - w, y, z0], [x1 - w, y, z1], [x1 + w, y, z1], [x0 + w, y, z0]);
    }
    const z = 0.144;
    const down: [number, number][] = [[-0.08, F], [-0.05, F - 0.06], [-0.09, F - 0.11], [-0.06, 0.45]];
    for (let i = 0; i + 1 < down.length; i++) {
      const [x0, y0] = down[i], [x1, y1] = down[i + 1];
      quad([x0 - w, y0, z], [x0 + w, y0, z], [x1 + w, y1, z], [x1 - w, y1, z]);
    }
  }
  const out = [geoOf([...iron, ...rest]), geoOf(face), geoOf(marks)];
  anvilCache.set(cracked, out.map(shareResource));
  return out;
}

/** A tree stump, `h` tall, its base flaring into roots and its bark in ridges. */
function anvilStump(seed: number, h: number) {
  const ring = (y: number, r: number): V3[] =>
    Array.from({ length: 14 }, (_, j) => {
      const a = (j / 14) * Math.PI * 2, rr = r * (j % 2 ? 0.95 : 1) * (0.98 + hash01(seed, j) * 0.05);
      return [Math.cos(a) * rr, y, -Math.sin(a) * rr];
    });
  return geoOf(loft([ring(0, 0.58), ring(0.08, 0.52), ring(h * 0.45, 0.49), ring(h, 0.48)]));
}

export interface WallSpec {
  /** Centre of the wall's base line and its direction (rotation about Y; 0 = along +X). */
  x: number;
  z: number;
  rot: number;
  len: number;
  y0: number;
  rows: number;
  rowH: number;
  thick: number;
  seed: number;
  shades?: number[];
  unit?: number;
  /** Height of the wall top along it (broken crowns). */
  top?: (u: number) => number;
  /** Leave out blocks overlapping an opening (door, mouth). */
  hole?: { u: number; w: number; h: number };
}

/** A wall of staggered, slightly uneven blocks in running bond. */
export function masonry(k: ModelKit, p: Obj, s: WallSpec) {
  const shades = s.shades ?? BLOCKS, unit = s.unit ?? 1;
  const cos = Math.cos(s.rot), sin = Math.sin(s.rot);
  for (let r = 0; r < s.rows; r++) {
    const y = s.y0 + r * s.rowH;
    let u = -s.len / 2 - (r % 2 ? unit * 0.5 : 0), n = 0;
    while (u < s.len / 2 - 0.01) {
      const hv = hash01(s.seed, r, n++);
      const l = unit * (0.75 + Math.round(hv * 4) / 8);
      const a = Math.max(u, -s.len / 2), b = Math.min(u + l, s.len / 2);
      u += l;
      if (b - a < 0.15) continue;
      const cu = (a + b) / 2;
      if (s.top && y + s.rowH > s.top(cu) + 0.02) continue;
      if (s.hole && b > s.hole.u - s.hole.w / 2 && a < s.hole.u + s.hole.w / 2 && y < s.hole.h) continue;
      const pick = hash01(s.seed + 7, r, n);
      const proud = hash01(s.seed + 3, r, n) * 0.05;
      k.mesh(p, chamferBox(q(b - a - 0.04), q(s.rowH - 0.04), q(s.thick + proud), 0.05), shades[pick < 0.55 ? 0 : pick < 0.82 ? 1 : 2],
        [s.x + cos * cu, y + s.rowH / 2, s.z - sin * cu], [0, s.rot, 0]);
    }
  }
}

export function flame(k: ModelKit, g: Obj, x: number, y: number, z: number, s = 1) {
  // Flames are effects: soft faceted tongues are fine here.
  const a = k.cone(g, 0.3 * s, 0.7 * s, [x, y + 0.35 * s, z], PAL.fire, undefined, 5, PAL.fire);
  const b = k.cone(g, 0.18 * s, 0.5 * s, [x, y + 0.35 * s, z], PAL.ember, undefined, 5, PAL.ember);
  a.name = b.name = 'flame'; // animated: never merged
  return (t: number) => {
    const f = 1 + Math.sin(t * 13 + x) * 0.1 + Math.sin(t * 7.3 + z) * 0.08;
    a.scale.set(1, f, 1);
    b.scale.set(1, 2 - f, 1);
  };
}

export function light(g: Obj, color: number, intensity: number, dist: number, y: number) {
  const l = new THREE.PointLight(color, intensity, dist, 1.6);
  l.position.set(0, y, 0);
  g.add(l);
  return l;
}

/** Stepped square dais with rune inlays (portals, landing). Returns the height of its top. */
function dais(k: ModelKit, g: Obj, size: number, rune: number | null, seed: number) {
  const glow = rune ?? 0;
  const inlay = rune ?? 0x2e2c34;
  cb(k, g, [size, 0.26, size], [0, 0.13, 0], STONE_D, undefined, 0.06);
  cb(k, g, [size - 0.56, 0.22, size - 0.56], [0, 0.37, 0], STONE, undefined, 0.05);
  cb(k, g, [size - 1.12, 0.14, size - 1.12], [0, 0.55, 0], STONE_L, undefined, 0.04);
  const top = 0.62, inner = (size - 1.12) / 2 - 0.2;
  // A square rune ring inlaid in the top step, glyph ticks on the middle step.
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2, ca = Math.cos(a), sa = Math.sin(a);
    k.box(g, [inner * 2, 0.02, 0.07], [sa * inner, top, ca * inner], inlay, [0, a, 0], glow, rune ? 1.8 : 0);
    for (const t of [-0.55, 0, 0.55]) {
      const r = (size - 0.56) / 2 - 0.13, v = t * r;
      const tall = hash01(seed, i, t) > 0.5;
      k.box(g, [0.07, 0.02, tall ? 0.16 : 0.1], [sa * r + ca * v, 0.49, ca * r - sa * v], inlay, [0, a, 0], glow, rune ? 1.6 : 0);
    }
  }
  // Short corner pylons with a glowing band.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = sx * (size / 2 - 0.3), z = sz * (size / 2 - 0.3);
    k.mesh(g, taper(0.42, 0.42, 0.24, 0.24, 1.0), STONE_D, [x, 0.26 + 0.5, z]);
    k.box(g, [0.36, 0.08, 0.36], [x, 0.9, z], inlay, undefined, glow, rune ? 1.5 : 0);
  }
  return top;
}

/**
 * Portal platform projecting the portal window and its title (src/world/portalFx.ts). `arg` is a
 * PortalSpec (destination, name, colour) or just a colour; a null colour = sealed/dormant.
 */
function portal(k: ModelKit, g: THREE.Group, arg: PortalSpec | number | null): Prop {
  const spec: PortalSpec = arg !== null && typeof arg === 'object' ? arg : { color: arg };
  const top = dais(k, g, 3.0, spec.color, 5);
  const fx = makePortal(spec, top);
  if (fx) g.add(fx.obj);
  if (spec.color === null) return { obj: g, tick: fx?.tick };
  const l = light(g, spec.color, 3.5, 6, 1.6);
  return { obj: g, light: l, tick: (t) => { fx?.tick(t); l.intensity = 3.2 + Math.sin(t * 2.2) * 0.6; } };
}

/**
 * Per-ore rock designs, about two units across: a low rock bed with the ore standing proud on
 * top, so each kind reads by shape and colour from the camera. `ore` is hidden when depleted.
 */
function oreRock(k: ModelKit, g: THREE.Group, id: string): Prop {
  const host = new THREE.Group(), ore = new THREE.Group();
  g.add(host, ore);
  const hostCol = id === 'emberite' ? 0x2e2624 : id === 'tin' ? 0x6e6a66 : 0x6a6258;
  const s = id.length * 11;
  chunk(k, host, s + 1, [1.5, 0.62, 1.25], [0, -0.08, 0], hostCol, 0.3);
  chunk(k, host, s + 2, [0.85, 0.5, 0.8], [0.62, -0.08, 0.5], hostCol, 1.1);
  chunk(k, host, s + 3, [0.8, 0.42, 0.7], [-0.68, -0.08, 0.38], hostCol, 2.2);
  chunk(k, host, s + 4, [0.6, 0.35, 0.5], [-0.3, -0.08, -0.72], hostCol, 0.8);
  type Spot = [number, number, number, number, number];
  switch (id) {
    case 'copper': {
      // Green-teal patina chunks with bright copper breaking through.
      const xs: Spot[] = [[0.05, 0.36, 0.05, 0.62, 0x46a88c], [-0.42, 0.26, 0.38, 0.46, 0xd07a3a], [0.5, 0.26, 0.42, 0.5, 0x3d9a80], [0.28, 0.3, -0.4, 0.44, 0xd07a3a], [-0.5, 0.2, -0.22, 0.4, 0x46a88c]];
      xs.forEach(([x, y, z, r, c], i) => chunk(k, ore, 40 + i, [r, r * 0.8, r], [x, y, z], c, i, c === 0xd07a3a ? 0x6a2a08 : 0x0a3a2a, 0.5));
      break;
    }
    case 'tin': {
      // Pale silvery crystal blocks fanning up out of the rock.
      const xs: Spot[] = [[0, 0.25, 0.05, 0.34, 1.3], [0.34, 0.2, 0.32, 0.28, 1.0], [-0.34, 0.2, 0.26, 0.26, 0.95], [0.18, 0.2, -0.32, 0.28, 0.9], [-0.42, 0.15, -0.22, 0.22, 0.7], [0.58, 0.1, 0.55, 0.2, 0.6]];
      xs.forEach(([x, y, z, w, h], i) => k.mesh(ore, prism(w, h, 0.26), i % 2 ? 0xd8e0e8 : 0xbcc8d0, [x, y, z], [z * 0.8, i * 0.7, -x * 0.8], 0x3a4450, 0.6));
      break;
    }
    case 'iron': {
      // Rusty square blocks stacked out of the rock.
      const xs: Spot[] = [[0.05, 0.62, 0.08, 0.6, 0xb4603a], [-0.4, 0.46, 0.4, 0.48, 0x8a4028], [0.48, 0.46, 0.36, 0.5, 0xa8583a], [0.22, 0.5, -0.38, 0.46, 0x6a524c], [-0.5, 0.38, -0.18, 0.4, 0x9a4a2e]];
      xs.forEach(([x, y, z, r, c], i) => cb(k, ore, [r, r * 0.85, r], [x, y, z], c, [0.2 * (i % 2), i * 0.8, 0.15], 0.05, 0x2a0a00, 0.3));
      break;
    }
    case 'coal': {
      // Black glossy blocks (they catch the light).
      const xs: Spot[] = [[0, 0.64, 0.08, 0.62, 0], [-0.42, 0.48, 0.4, 0.48, 0], [0.48, 0.48, 0.38, 0.5, 0], [0.22, 0.5, -0.38, 0.46, 0], [-0.52, 0.38, -0.16, 0.4, 0], [0.66, 0.32, -0.08, 0.34, 0]];
      xs.forEach(([x, y, z, r], i) => cb(k, ore, [r, r * 0.8, r * 0.95], [x, y, z], COAL, [0.3 * (i % 2), i * 0.9, 0.15], 0.04));
      break;
    }
    default: {
      // Emberite: glowing ember crystals out of dark basalt.
      const xs: Spot[] = [[0, 0.2, 0.05, 0.38, 1.5], [0.36, 0.15, 0.34, 0.3, 1.05], [-0.36, 0.15, 0.3, 0.3, 1.0], [0.2, 0.15, -0.32, 0.26, 0.85], [-0.46, 0.1, -0.26, 0.22, 0.65]];
      xs.forEach(([x, y, z, w, h], i) => k.mesh(ore, prism(w, h, 0.3), i % 2 ? 0xff8a3a : 0xff6a1a, [x, y, z], [z * 0.7, i * 0.9, -x * 0.7], 0xff4a10, 1.6));
    }
  }
  // Glints: a few tiny bright facets on the ore that flash in turn (they bloom), so a vein catches
  // the eye in the dark the way wet metal catches a lamp. Emberite glows on its own.
  const glints: THREE.Object3D[] = [];
  const glintCol: Record<string, number> = { copper: 0xffc070, tin: 0xe8f4ff, iron: 0xffb080, coal: 0xd8e4ff };
  if (glintCol[id]) {
    const spots: V3[] = id === 'copper' ? [[0.1, 0.72, 0.28], [-0.4, 0.5, 0.58], [0.5, 0.5, 0.62]]
      : id === 'tin' ? [[0.02, 1.32, 0.12], [0.36, 0.96, 0.4], [-0.32, 0.92, 0.36]]
      : [[0.08, 0.98, 0.36], [-0.4, 0.72, 0.62], [0.5, 0.74, 0.6]];
    spots.forEach((at, i) => {
      const m = k.mesh(ore, prism(0.09, 0.16, 0.5), glintCol[id], at, [0.6, i * 1.3, 0.4], glintCol[id], 3.2);
      m.name = 'glint';
      glints.push(m);
    });
  }
  const phase = (s * 0.37) % 1;
  return {
    obj: g,
    tick: glints.length ? (t) => {
      glints.forEach((m, i) => {
        // Each flashes for a short moment of its own 3.4 s cycle.
        const f = (t / 3.4 + phase + i / glints.length) % 1;
        const on = Math.max(0, 1 - Math.abs(f - 0.5) / 0.07);
        m.scale.setScalar(0.45 + on * 0.9);
      });
    } : undefined,
    setState: (st) => {
      ore.visible = st !== 'depleted';
      host.scale.setScalar(st === 'depleted' ? 0.85 : 1);
    },
  };
}

/** A pile of bones; `variant` picks the arrangement (0..3). No glow, warm bone colour. */
function bonePile(k: ModelKit, g: Obj, variant: number) {
  const femur = (x: number, z: number, a: number, len = 0.8) => {
    const c = Math.cos(a), s = Math.sin(a);
    cb(k, g, [0.1, 0.09, len], [x, 0.05, z], BONE, [0, a, 0], 0.02);
    for (const e of [-1, 1]) cb(k, g, [0.2, 0.15, 0.16], [x + s * e * len * 0.5, 0.07, z + c * e * len * 0.5], BONE_D, [0, a, 0], 0.03);
  };
  const skull = (x: number, z: number, a: number, horned: boolean) => {
    const c = Math.cos(a), s = Math.sin(a);
    cb(k, g, [0.36, 0.3, 0.42], [x, 0.15, z], BONE, [0, a, 0], 0.06);
    cb(k, g, [0.28, 0.1, 0.2], [x + s * 0.22, 0.05, z + c * 0.22], BONE_D, [0, a, 0], 0.02);
    for (const e of [-1, 1]) k.box(g, [0.09, 0.08, 0.02], [x + s * 0.215 + c * e * 0.08, 0.2, z + c * 0.215 - s * e * 0.08], DARK, [0, a, 0]);
    if (horned) for (const e of [-1, 1]) k.mesh(g, prism(0.08, 0.5, 0.5), BONE_D, [x + c * e * 0.15, 0.25, z - s * e * 0.15], [-0.9 * c, a, e * 0.7]);
  };
  switch (variant % 4) {
    case 0:
      femur(0, 0, 0.4); femur(0.2, 0.1, -0.9, 0.7); skull(-0.35, 0.25, 0.5, false);
      break;
    case 1: {
      // A ribcage: spine blocks and bent ribs.
      for (let i = 0; i < 5; i++) cb(k, g, [0.16, 0.14, 0.18], [0, 0.07, -0.5 + i * 0.25], BONE_D, undefined, 0.03);
      for (let i = 0; i < 4; i++) for (const e of [-1, 1]) {
        const z = -0.4 + i * 0.25;
        cb(k, g, [0.3, 0.07, 0.07], [e * 0.2, 0.2, z], BONE, [0, 0, e * 0.6], 0.015);
        cb(k, g, [0.07, 0.3, 0.07], [e * 0.36, 0.14, z], BONE, [0, 0, e * 0.15], 0.015);
      }
      break;
    }
    case 2:
      femur(-0.2, 0, 1.2); femur(0.25, -0.2, 0.2, 0.6); femur(0.1, 0.35, 2.3, 0.7);
      break;
    default:
      skull(0, 0, -0.3, true); femur(0.4, 0.3, 1.0, 0.6);
  }
}

type Builder = (k: ModelKit, g: THREE.Group, arg?: any) => Prop | void;

/** A prop's length argument: a number, or the `len` of `{ len, v }` (a length with a variant). */
const lenOf = (arg: any): number | undefined => (typeof arg === 'number' ? arg : arg?.len);
/** A prop's variant (the `v` of `{ len, v }`), 0 if none. */
const vOf = (arg: any): number => (arg !== null && typeof arg === 'object' ? arg.v ?? 0 : 0);

/**
 * Mine support set across a tunnel (local X spans the tunnel, +Z is along it): squared posts on
 * stone footings, a cap beam with corner braces, and an iron lantern hanging off-centre. The lit
 * variant also casts light (used sparingly: every point light costs every material).
 */
function mineFrame(k: ModelKit, g: THREE.Group, span: number, lit: boolean): Prop {
  const s = Math.max(3, span), px = s / 2 - 0.2, H = 3.0;
  for (const sx of [-1, 1]) {
    chunk(k, g, 160 + (sx > 0 ? 1 : 0), [0.6, 0.3, 0.55], [sx * px, -0.05, 0], 0x5a4a3c, sx);
    cb(k, g, [0.32, H, 0.32], [sx * px, H / 2, 0], WOOD_D, [0, 0, sx * -0.04], 0.04);
    cb(k, g, [0.14, 1.1, 0.14], [sx * (px - 0.45), H - 0.42, 0], WOOD_D, [0, 0, sx * 0.8], 0.02);
  }
  cb(k, g, [s + 0.5, 0.36, 0.4], [0, H + 0.1, 0], WOOD, undefined, 0.05);
  for (const sx of [-1, 1]) k.box(g, [0.1, 0.44, 0.44], [sx * (px + 0.02), H + 0.1, 0], IRON);
  const lx = s * 0.22;
  k.box(g, [0.04, 0.5, 0.04], [lx, H - 0.33, 0.1], IRON);
  cb(k, g, [0.3, 0.36, 0.3], [lx, H - 0.72, 0.1], IRON, undefined, 0.03);
  k.box(g, [0.2, 0.26, 0.2], [lx, H - 0.72, 0.1], 0xffd080, undefined, 0xffb040, 2.4);
  if (!lit) return { obj: g };
  const l = light(g, 0xffa050, 9, 10, H - 0.9);
  l.position.x = lx;
  l.position.z = 0.4;
  return { obj: g, light: l };
}

/**
 * A tapered beam from `a` to `b`: `size` is [width, depth] at `a` then at `b`. Limbs, horns, wing
 * bones and tails on statues.
 */
function limb(k: ModelKit, g: THREE.Object3D, a: V3, b: V3, size: [number, number, number, number], color: number) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const L = d.length();
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return k.mesh(g, taper(size[0], size[1], size[2], size[3], L), color, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [e.x, e.y, e.z]);
}

/**
 * A rounded tapered segment from `a` to `b` (an eight-sided frustum, radius `r0` at `a`, `r1` at
 * `b`), squashed front to back by `flat`: bodies, necks and tails on statues.
 */
function round(k: ModelKit, g: THREE.Object3D, a: V3, b: V3, r0: number, r1: number, color: number, flat = 1) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const L = d.length();
  // Turned an eighth so a flat face (not an edge) looks forward.
  const geo = new THREE.CylinderGeometry(r1, r0, L, 8, 1).rotateY(Math.PI / 8).scale(1, 1, flat);
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return k.mesh(g, geo, color, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [e.x, e.y, e.z]);
}

/** A faceted ball of radius `r` scaled by `size` (joints, haunches, a skull's dome). */
function ball(k: ModelKit, g: THREE.Object3D, r: number, pos: V3, color: number, size: V3 = [1, 1, 1], rot?: V3) {
  const m = k.mesh(g, new THREE.IcosahedronGeometry(r, 1), color, pos, rot);
  m.scale.set(...size);
  return m;
}

// ─── Garden plants ───────────────────────────────────────────────────────────
// Chunky, readable plants for the castle's beds, each built of a few blocks so it reads as what it
// is from the play camera: tulips, rose bushes, lavender, delphiniums and daisies in the flower beds;
// cabbages, lettuces, carrots and leeks in the kitchen garden. Each stands on y = 0 at (x, z).
const STEM = 0x4a7a34, LEAF_G = 0x5a8a3a, LEAF_D = 0x3e6a2e;
const PLANT = {
  /** A tulip: a straight stem, two broad leaves at its foot and a cup of colour on top. */
  tulip(k: ModelKit, g: THREE.Object3D, x: number, z: number, c: number, h: number, turn: number) {
    k.box(g, [0.03, h, 0.03], [x, h / 2, z], STEM);
    k.box(g, [0.1, 0.22, 0.03], [x, 0.11, z], LEAF_G, [0, turn, 0.3]);
    k.box(g, [0.1, 0.18, 0.03], [x, 0.09, z], LEAF_G, [0, turn + 1.6, -0.3]);
    k.mesh(g, taper(0.08, 0.08, 0.15, 0.15, 0.16), c, [x, h + 0.06, z], [0, turn, 0]);
  },
  /** A rose bush: a rounded dark-green bush studded with layered blooms. */
  rose(k: ModelKit, g: THREE.Object3D, x: number, z: number, c: number, s: number, seed: number) {
    cb(k, g, [0.5 * s, 0.42 * s, 0.5 * s], [x, 0.21 * s, z], LEAF_D, [0, seed, 0], 0.12 * s);
    cb(k, g, [0.36 * s, 0.22 * s, 0.36 * s], [x, 0.44 * s, z], STEM, [0, seed + 0.7, 0], 0.08 * s);
    for (let i = 0; i < 5; i++) {
      const a = seed * 2.3 + (i * Math.PI * 2) / 5, r = i === 4 ? 0 : 0.17 * s, y = (i === 4 ? 0.58 : 0.4 + (i % 2) * 0.08) * s;
      const bx = x + Math.sin(a) * r, bz = z + Math.cos(a) * r;
      k.box(g, [0.13, 0.08, 0.13], [bx, y, bz], c, [0, a, 0]);
      k.box(g, [0.08, 0.06, 0.08], [bx, y + 0.06, bz], c, [0, a + 0.8, 0]);
    }
  },
  /** Lavender: a low grey-green mound bristling with purple flower spikes. */
  lavender(k: ModelKit, g: THREE.Object3D, x: number, z: number, seed: number) {
    cb(k, g, [0.42, 0.2, 0.42], [x, 0.1, z], 0x6e8e6a, [0, seed, 0], 0.08);
    for (let i = 0; i < 7; i++) {
      const a = seed + i * 2.4, r = i ? 0.13 : 0, lean = i ? 0.22 : 0;
      const bx = x + Math.sin(a) * r, bz = z + Math.cos(a) * r, rot: V3 = [Math.cos(a) * lean, 0, -Math.sin(a) * lean];
      k.box(g, [0.022, 0.3, 0.022], [bx, 0.33, bz], 0x7a9a72, rot);
      k.box(g, [0.05, 0.13, 0.05], [bx + Math.sin(a) * lean * 0.2, 0.5, bz + Math.cos(a) * lean * 0.2], 0x8a62c8, rot);
    }
  },
  /** A delphinium: a tall spike of blue florets over a clump of leaves. */
  delphinium(k: ModelKit, g: THREE.Object3D, x: number, z: number, c: number, h: number) {
    cb(k, g, [0.3, 0.18, 0.3], [x, 0.09, z], LEAF_G, undefined, 0.06);
    k.box(g, [0.03, h, 0.03], [x, h / 2, z], STEM);
    for (let i = 0; i < 4; i++) k.box(g, [0.11 - i * 0.02, 0.09, 0.11 - i * 0.02], [x, h * 0.55 + i * h * 0.13, z], c, [0, i * 0.7, 0]);
  },
  /** Daisies: a low clump of white flowers with gold hearts. */
  daisy(k: ModelKit, g: THREE.Object3D, x: number, z: number, seed: number) {
    cb(k, g, [0.34, 0.12, 0.34], [x, 0.06, z], LEAF_G, [0, seed, 0], 0.05);
    for (let i = 0; i < 3; i++) {
      const a = seed + i * 2.1, bx = x + Math.sin(a) * 0.09, bz = z + Math.cos(a) * 0.09;
      k.box(g, [0.11, 0.03, 0.11], [bx, 0.13, bz], 0xf4ece0, [0, a, 0]);
      k.box(g, [0.04, 0.03, 0.04], [bx, 0.15, bz], 0xf0c040);
    }
  },
  /** A cabbage: a round pale heart in a ring of broad blue-green outer leaves. */
  cabbage(k: ModelKit, g: THREE.Object3D, x: number, z: number, seed: number, red = false) {
    for (let i = 0; i < 5; i++) {
      const a = seed + (i * Math.PI * 2) / 5;
      k.box(g, [0.24, 0.04, 0.16], [x + Math.sin(a) * 0.13, 0.08, z + Math.cos(a) * 0.13], red ? 0x6a4a7a : 0x5f8f5a, [0, a + Math.PI / 2, 0.35]);
    }
    cb(k, g, [0.24, 0.2, 0.24], [x, 0.14, z], red ? 0x8a5a98 : 0x9cc27a, [0, seed, 0], 0.08);
  },
  /** A lettuce: a frilled ring of light green leaves round a tight heart. */
  lettuce(k: ModelKit, g: THREE.Object3D, x: number, z: number, seed: number) {
    for (let i = 0; i < 6; i++) {
      const a = seed + (i * Math.PI * 2) / 6;
      k.box(g, [0.18, 0.12, 0.04], [x + Math.sin(a) * 0.1, 0.08, z + Math.cos(a) * 0.1], i % 2 ? 0x8ac050 : 0x7ab044, [0.45, a, 0]);
    }
    k.box(g, [0.1, 0.12, 0.1], [x, 0.09, z], 0xa8d468, [0, seed, 0]);
  },
  /** A carrot: its orange shoulder at the soil, a feathery green top. */
  carrot(k: ModelKit, g: THREE.Object3D, x: number, z: number, seed: number) {
    k.box(g, [0.08, 0.06, 0.08], [x, 0.02, z], 0xe07a2a, [0, seed, 0]);
    for (let i = 0; i < 3; i++) {
      const a = seed + i * 2.1;
      k.box(g, [0.02, 0.24, 0.02], [x + Math.sin(a) * 0.03, 0.15, z + Math.cos(a) * 0.03], 0x5a9a3a, [Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35]);
      k.box(g, [0.09, 0.07, 0.09], [x + Math.sin(a) * 0.08, 0.27, z + Math.cos(a) * 0.08], 0x6aaa44, [0, a, 0]);
    }
  },
  /** A leek: a white shank under a fan of long flat blue-green leaves. */
  leek(k: ModelKit, g: THREE.Object3D, x: number, z: number, seed: number) {
    k.box(g, [0.07, 0.16, 0.07], [x, 0.08, z], 0xe6ead2);
    for (let i = 0; i < 4; i++) k.box(g, [0.07, 0.34, 0.015], [x, 0.3, z], 0x5a8a72, [0, seed + i * 0.8, (i % 2 ? 1 : -1) * (0.15 + i * 0.06)]);
  },
};

/**
 * A flat sheet of falling water `w` wide and `h` tall (see fallingWaterMaterial). `time` is shared by
 * every sheet of one waterfall.
 */
function fallingWater(w: number, h: number, time: { value: number }, seed: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), fallingWaterMaterial(time, seed, h, w));
  m.name = 'waterfall';
  m.renderOrder = 2;
  return m;
}

/**
 * A band `w` wide and `h` high along a polyline in plan (points (x, z), closed into a loop when
 * `closed`): one piece per stretch, each mitred to its neighbours so they meet edge to edge, extruded
 * up from y = 0 and merged into one shape (`bevel` rounds its top edges). The audit sees each stretch
 * as its own box along it.
 */
export function mitredBand(pts: THREE.Vector2[], closed: boolean, w: number, h: number, bevel = 0) {
  const pieces = mitredPieces(pts, closed, w, h, bevel);
  const geo = mergeGeometries(pieces)!;
  geo.computeVertexNormals();
  geo.userData.boxes = pieces.flatMap((p) => p.userData.boxes);
  return geo;
}

function mitredPieces(pts: THREE.Vector2[], closed: boolean, w: number, h: number, bevel: number) {
  const n = pts.length, hw = w / 2;
  const dir = (i: number) => pts[(i + 1) % n].clone().sub(pts[i]).normalize();
  const left = (d: THREE.Vector2) => new THREE.Vector2(-d.y, d.x);
  /** The mitre at a corner: the offset to its left edge for a unit half width. */
  const mitre = (i: number) => {
    const open = !closed && (i === 0 || i === n - 1);
    if (open) return left(dir(i === 0 ? 0 : n - 2));
    const d0 = dir((i - 1 + n) % n), d1 = dir(i), m = left(d0).add(left(d1)).normalize();
    return m.divideScalar(Math.max(0.35, m.dot(left(d1))));
  };
  const pieces: THREE.BufferGeometry[] = [];
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const j = (i + 1) % n, a = pts[i], b = pts[j], ma = mitre(i), mb = mitre(j);
    const outA = a.clone().addScaledVector(ma, hw), outB = b.clone().addScaledVector(mb, hw), inA = a.clone().addScaledVector(ma, -hw), inB = b.clone().addScaledVector(mb, -hw);
    const shape = new THREE.Shape([outA, outB, inB, inA].map((p) => new THREE.Vector2(p.x, -p.y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: h - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelOffset: -bevel * 0.6, bevelSegments: 1, curveSegments: 1 });
    geo.rotateX(-Math.PI / 2);
    if (bevel > 0) geo.translate(0, bevel, 0);
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
    const d = b.clone().sub(a);
    geo.userData.boxes = [{ c: [(a.x + b.x) / 2, h / 2, (a.y + b.y) / 2], h: [d.length() / 2, h / 2, hw], ry: Math.atan2(-d.y, d.x) }];
    pieces.push(geo);
  }
  return pieces;
}

/**
 * A band `w` wide and `h` high along a polyline in plan (points (x, z), its ends open), mitred at every
 * bend like mitredBand and extruded up from y = 0, as one piece that lays its own stones (masonry.ts,
 * Laid): each run between sharp turns cut into whole stones as near `stone` long as fit, the joints
 * square across it and on the mitre where it turns sharply, the top's long edges, the sides' top edges
 * and its two ends arrises, so it reads as one kerb of dressed stones, never a row of pieces. The audit
 * sees each stretch as its own box along it.
 */
export function laidBand(pts: THREE.Vector2[], w: number, h: number, stone: number, seed: number) {
  const n = pts.length, hw = w / 2;
  const dir = (i: number) => pts[i + 1].clone().sub(pts[i]).normalize();
  const left = (d: THREE.Vector2) => new THREE.Vector2(-d.y, d.x);
  const mitre = (i: number) => {
    if (i === 0) return left(dir(0));
    if (i === n - 1) return left(dir(n - 2));
    const m = left(dir(i - 1)).add(left(dir(i))).normalize();
    return m.divideScalar(Math.max(0.35, m.dot(left(dir(i)))));
  };
  // The stone coordinate at each point: whole at both ends of every run between sharp turns.
  const X = [0];
  for (let a = 0; a < n - 1;) {
    let b = a + 1;
    while (b < n - 1 && dir(b - 1).dot(dir(b)) > Math.cos(Math.PI / 6)) b++;
    let len = 0;
    for (let i = a; i < b; i++) len += pts[i].distanceTo(pts[i + 1]);
    const k = Math.max(1, Math.round(len / stone));
    for (let i = a, acc = 0; i < b; i++) {
      acc += pts[i].distanceTo(pts[i + 1]);
      X[i + 1] = X[a] + (k * acc) / len;
    }
    a = b;
  }
  const L = new Laid(seed), boxes: { c: number[]; h: number[]; ry: number }[] = [];
  const at = (q: THREE.Vector2, y: number, Xv: number, C: number): LaidCorner => [q.x, y, q.y, Xv, C];
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i], b = pts[i + 1], ma = mitre(i), mb = mitre(i + 1), out = left(dir(i));
    const oa = a.clone().addScaledVector(ma, hw), ob = b.clone().addScaledVector(mb, hw), ia = a.clone().addScaledVector(ma, -hw), ib = b.clone().addScaledVector(mb, -hw);
    const l = a.distanceTo(b) / Math.max(1e-6, X[i + 1] - X[i]);
    laidFace(L, [at(ia, h, X[i], 0), at(ib, h, X[i + 1], 0), at(ob, h, X[i + 1], 1), at(oa, h, X[i], 1)], [0, 1, 0], { l, h: w, mode: 2, cs: 0, ce: 1 });
    laidFace(L, [at(oa, 0, X[i], 0), at(ob, 0, X[i + 1], 0), at(ob, h, X[i + 1], 1), at(oa, h, X[i], 1)], [out.x, 0, out.y], { l, h, cs: -1, ce: 1 });
    laidFace(L, [at(ia, 0, X[i], 0), at(ib, 0, X[i + 1], 0), at(ib, h, X[i + 1], 1), at(ia, h, X[i], 1)], [-out.x, 0, -out.y], { l, h, cs: -1, ce: 1 });
    const d = b.clone().sub(a);
    boxes.push({ c: [(a.x + b.x) / 2, h / 2, (a.y + b.y) / 2], h: [d.length() / 2, h / 2, hw], ry: Math.atan2(-d.y, d.x) });
  }
  // Its two ends, square across it.
  for (const [i, j] of [[0, 1], [n - 1, n - 2]]) {
    const m = mitre(i), o = pts[i].clone().addScaledVector(m, hw), u = pts[i].clone().addScaledVector(m, -hw), away = pts[i].clone().sub(pts[j]).normalize();
    laidFace(L, [at(u, 0, 0, 0), at(o, 0, 1, 0), at(o, h, 1, 1), at(u, h, 0, 1)], [away.x, 0, away.y], { l: w, h, xs: 0, xe: 1, cs: -1, ce: 1 });
  }
  const geo = L.build();
  geo.userData.boxes = boxes;
  return geo;
}

/**
 * A band `w` wide along a polyline in plan (points (x, z)), its bottom and top at each corner given
 * (y0, y1: so it can follow a slope), mitred at every bend and squared at its ends, as one solid; the
 * band's middle may stand `shift` to the left of the line, and its top `lean` further left than its
 * bottom (a battered face). The audit sees each stretch as its own box.
 */
export function slopedBand(pts: THREE.Vector2[], y0: number[], y1: number[], w: number, shift = 0, lean = 0) {
  const n = pts.length, dir = (i: number) => pts[i + 1].clone().sub(pts[i]).normalize();
  const left = (d: THREE.Vector2) => new THREE.Vector2(-d.y, d.x);
  const mitre = (i: number) => {
    if (i === 0) return left(dir(0));
    if (i === n - 1) return left(dir(n - 2));
    const m = left(dir(i - 1)).add(left(dir(i))).normalize();
    return m.divideScalar(Math.max(0.35, m.dot(left(dir(i)))));
  };
  const pos: number[] = [], lay: number[] = [], boxes: { c: number[]; h: number[]; ry: number }[] = [];
  // (Each vertex also carries where it lies in the band, for laying its stones along it: the
  // distance along the run, 0 at the foot to 1 at the top, and 0 to 1 across: see masonry.ts.)
  const run = [0];
  for (let i = 1; i < n; i++) run.push(run[i - 1] + pts[i].distanceTo(pts[i - 1]));
  /** The 8 corners of the stretch between corners i and i + 1. */
  const corner = (i: number, side: number, top: boolean) => {
    const m = mitre(i), off = shift + side * (w / 2) + (top ? lean : 0), p = pts[i].clone().addScaledVector(m, off);
    return [p.x, top ? y1[i] : y0[i], p.y, run[i], top ? 1 : 0, (side + 1) / 2];
  };
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    for (const v of [a, c, b, a, d, c]) {
      pos.push(v[0], v[1], v[2]);
      lay.push(v[3], v[4], v[5]);
    }
  };
  for (let i = 0; i < n - 1; i++) {
    const j = i + 1;
    const [lb0, rb0, lt0, rt0] = [corner(i, 1, false), corner(i, -1, false), corner(i, 1, true), corner(i, -1, true)];
    const [lb1, rb1, lt1, rt1] = [corner(j, 1, false), corner(j, -1, false), corner(j, 1, true), corner(j, -1, true)];
    quad(lt0, rt0, rt1, lt1);
    quad(lb0, lb1, rb1, rb0);
    quad(lb0, lt0, lt1, lb1);
    quad(rb0, rb1, rt1, rt0);
    if (i === 0) quad(lb0, rb0, rt0, lt0);
    if (j === n - 1) quad(lb1, lt1, rt1, rb1);
    const d = pts[j].clone().sub(pts[i]), c = pts[i].clone().add(pts[j]).multiplyScalar(0.5).addScaledVector(left(d.clone().normalize()), shift + lean / 2);
    const lo = Math.min(y0[i], y0[j]), hi = Math.max(y1[i], y1[j]);
    boxes.push({ c: [c.x, (lo + hi) / 2, c.y], h: [d.length() / 2, (hi - lo) / 2, w / 2 + Math.abs(lean) / 2], ry: Math.atan2(-d.y, d.x) });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aLay', new THREE.Float32BufferAttribute(lay, 3));
  geo.computeVertexNormals();
  geo.userData.boxes = boxes;
  geo.userData.lay = { len: run[n - 1], h: y0.reduce((a, y, i) => a + y1[i] - y, 0) / n, w };
  return geo;
}

/**
 * A flat slab cut to an outline in plan (points (x, z) in order round it), `h` thick with its foot on
 * y = 0: a flagstone of any shape.
 */
export function flatSlab(outline: THREE.Vector2[], h: number) {
  const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, -p.y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 }).rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  // (For the audit: three boxes along it, each inside the slab, turned to the edge that boxes it
  // tightest, so neighbouring slabs' boxes never overlap where the stones themselves only meet.)
  let best = { area: Infinity, d: new THREE.Vector2(1, 0), u0: 0, u1: 0 };
  for (let i = 0; i < outline.length; i++) {
    const d = outline[(i + 1) % outline.length].clone().sub(outline[i]).normalize(), nrm = new THREE.Vector2(-d.y, d.x);
    const us = outline.map((p) => p.dot(d)), vs = outline.map((p) => p.dot(nrm));
    const area = (Math.max(...us) - Math.min(...us)) * (Math.max(...vs) - Math.min(...vs));
    if (area < best.area) best = { area, d, u0: Math.min(...us), u1: Math.max(...us) };
  }
  const d = best.d, nrm = new THREE.Vector2(-d.y, d.x);
  /** The slab's extent across it (v) where the line u = const crosses its outline. */
  const across = (u: number) => {
    const vs: number[] = [];
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i], b = outline[(i + 1) % outline.length], ua = a.dot(d), ub = b.dot(d);
      if ((ua - u) * (ub - u) > 0 || ua === ub) continue;
      const t = (u - ua) / (ub - ua);
      vs.push(a.dot(nrm) + (b.dot(nrm) - a.dot(nrm)) * t);
    }
    return vs.length ? [Math.min(...vs), Math.max(...vs)] : [0, 0];
  };
  geo.userData.boxes = [0, 1, 2].map((k) => {
    const ua = best.u0 + ((best.u1 - best.u0) * k) / 3 + 0.01, ub = best.u0 + ((best.u1 - best.u0) * (k + 1)) / 3 - 0.01;
    const [a0, a1] = across(ua), [b0, b1] = across(ub), v0 = Math.max(a0, b0) + 0.004, v1 = Math.min(a1, b1) - 0.004;
    const c = d.clone().multiplyScalar((ua + ub) / 2).add(nrm.clone().multiplyScalar((v0 + v1) / 2));
    return { c: [c.x, h / 2, c.y], h: [(ub - ua) / 2, h / 2, Math.max(0.001, (v1 - v0) / 2)], ry: Math.atan2(-d.y, d.x) };
  });
  return geo;
}

/**
 * A blocky band lying on y = 0 along a polyline in plan (points (x, z)), each point with its own
 * width and height, mitred at every bend into one solid: a tail curled on a plinth, tapering to its
 * tip. Its end faces are square to the line.
 */
function taperBand(pts: THREE.Vector2[], ws: number[], hs: number[]) {
  const n = pts.length, dir = (i: number) => pts[Math.min(n - 1, i + 1)].clone().sub(pts[Math.max(0, i === n - 1 ? i - 1 : i)]).normalize();
  const side = pts.map((p, i) => {
    const d0 = dir(Math.max(0, i - 1)), d1 = dir(i), m = new THREE.Vector2(-d0.y - d1.y, d0.x + d1.x).normalize();
    const cos = Math.max(0.35, m.dot(new THREE.Vector2(-d1.y, d1.x)));
    return m.multiplyScalar(ws[i] / 2 / cos);
  });
  const v = (i: number, s: number, top: boolean) => new THREE.Vector3(pts[i].x + side[i].x * s, top ? hs[i] : 0, pts[i].y + side[i].y * s);
  const tri: THREE.Vector3[] = [];
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => tri.push(a, b, c, a, c, d);
  for (let i = 0; i < n - 1; i++) {
    const [lb0, rb0, lt0, rt0, lb1, rb1, lt1, rt1] = [v(i, 1, false), v(i, -1, false), v(i, 1, true), v(i, -1, true), v(i + 1, 1, false), v(i + 1, -1, false), v(i + 1, 1, true), v(i + 1, -1, true)];
    quad(lt0, lt1, rt1, rt0);
    quad(lb0, rb0, rb1, lb1);
    quad(lb0, lb1, lt1, lt0);
    quad(rb0, rt0, rt1, rb1);
  }
  quad(v(0, 1, false), v(0, 1, true), v(0, -1, true), v(0, -1, false));
  quad(v(n - 1, 1, false), v(n - 1, -1, false), v(n - 1, -1, true), v(n - 1, 1, true));
  const geo = new THREE.BufferGeometry().setFromPoints(tri);
  geo.computeVertexNormals();
  return geo;
}

/** The champions' warm marble. */
const MARBLE = 0xe2d6c0, MARBLE_D = 0xcab99c, MARBLE_L = 0xefe6d4;
paintAs('plaster', [MARBLE, MARBLE_D, MARBLE_L]);
/**
 * Cast bronze (the dragon and the fountain's spouts), worn gold where hands touch it. The wing
 * membranes are the same casting a value darker (MEMBRANE), never a painted panel of another colour.
 */
const BRONZE = 0x8a5a2b, BRONZE_D = 0x5c3a1c, BRONZE_L = 0xa8743c, WORN = 0xd0a858, BELLY = 0x96642f, MEMBRANE = 0x74481f;
const BRONZES = new Set([BRONZE, BRONZE_D, BRONZE_L, WORN, BELLY]);

/**
 * The fountain's bronze dragon (pick A, October 2), a sentinel sitting upright like a guardian lion
 * and facing +Z, its base on y = 0, about 3.3 high: a few big blocky castings, the haunches folded
 * under it, the deep chest upright with paler belly plates, straight thick forelegs planted on broad
 * feet so they plainly carry it, the wings folded flat against its flanks, the tail curled round its
 * side on the plinth, the head held high with a square snout, the jaw open; gold horns, spines,
 * claws, eyes and tail spade. Returns the point in its open mouth the water pours from.
 */
function sentinelDragon(k: ModelKit, g: THREE.Object3D): THREE.Vector3 {
  const B = BRONZE, BD = BRONZE_D, BL = BRONZE_L, GOLD = PAL.gold;
  /** A gold claw pointing forward from a foot whose toes are at `z`. */
  const claws = (x: number, z: number) => {
    for (const c of [-1, 0, 1]) k.mesh(g, taper(0.09, 0.12, 0.05, 0.02, 0.14), GOLD, [x + c * 0.11, 0.06, z + 0.05], [Math.PI / 2, 0, 0]);
  };
  // The haunches, folded under at the back, and the hind feet planted forward of them.
  for (const s of [-1, 1]) {
    cb(k, g, [0.44, 0.88, 0.98], [s * 0.5, 0.48, -0.36], B, [-0.12, 0, 0], 0.1);
    cb(k, g, [0.34, 0.2, 0.48], [s * 0.46, 0.1, 0.14], BD, undefined, 0.05);
    claws(s * 0.46, 0.38);
  }
  // The body: one deep upright casting, leaning back a little, its belly plates down the front.
  cb(k, g, [0.82, 1.4, 0.8], [0, 1.22, -0.22], B, [-0.16, 0, 0], 0.1);
  for (let i = 0; i < 4; i++) {
    const y = 0.72 + i * 0.3;
    cb(k, g, [0.2, 0.27, 0.12], [0, y + 0.1, 0.24 - (y - 0.72) * 0.16], i % 2 ? BELLY : BL, [-0.16, 0, 0], 0.03);
  }
  // The forelegs carrying the chest as a seated guardian lion's do: each one thick squared block
  // standing straight up from its paw to the shoulder, where it rises into the chest's flank, on a
  // broad paw block with gold claws.
  for (const s of [-1, 1]) {
    cb(k, g, [0.32, 1.5, 0.38], [s * 0.27, 0.2 + 0.75, 0.24], B, undefined, 0.06);
    cb(k, g, [0.38, 0.2, 0.5], [s * 0.27, 0.1, 0.36], BD, undefined, 0.05);
    claws(s * 0.27, 0.61);
  }
  // The neck rising high and a little forward, its front plated.
  cb(k, g, [0.5, 0.62, 0.5], [0, 2.02, -0.04], B, [0.12, 0, 0], 0.08);
  cb(k, g, [0.44, 0.52, 0.44], [0, 2.5, 0.06], B, [0.2, 0, 0], 0.07);
  for (const [y, z] of [[1.95, 0.22], [2.42, 0.3]]) cb(k, g, [0.32, 0.36, 0.08], [0, y, z], BELLY, [0.18, 0, 0], 0.02);
  // The head held high: a squared skull, a long square snout, the lower jaw dropped open over a dark
  // mouth, a heavy brow, gold eyes, and gold horns sweeping back.
  const head = new THREE.Group();
  head.position.set(0, 2.92, 0.2);
  head.rotation.x = -0.08;
  g.add(head);
  cb(k, head, [0.58, 0.46, 0.58], [0, 0, 0], B, undefined, 0.07);
  cb(k, head, [0.46, 0.24, 0.52], [0, 0.04, 0.5], B, undefined, 0.05);
  cb(k, head, [0.62, 0.12, 0.2], [0, 0.22, 0.2], BD, undefined, 0.03);
  k.box(head, [0.36, 0.14, 0.38], [0, -0.12, 0.48], 0x2a1a10);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.12, 0.2);
  jaw.rotation.x = 0.42;
  head.add(jaw);
  cb(k, jaw, [0.4, 0.12, 0.52], [0, -0.04, 0.26], BD, undefined, 0.03);
  for (const s of [-1, 1]) {
    k.mesh(head, taper(0.05, 0.05, 0.01, 0.01, 0.1), GOLD, [s * 0.15, -0.14, 0.66], [Math.PI, 0, 0]);
    k.box(head, [0.1, 0.07, 0.04], [s * 0.2, 0.12, 0.29], GOLD);
    k.box(head, [0.06, 0.05, 0.03], [s * 0.11, 0.08, 0.765], 0x2a1a10);
    k.mesh(head, new THREE.OctahedronGeometry(0.08, 0), BL, [s * 0.3, -0.04, 0.04]);
    limb(k, head, [s * 0.17, 0.18, -0.12], [s * 0.34, 0.52, -0.5], [0.13, 0.13, 0.02, 0.02], GOLD);
    limb(k, head, [s * 0.26, 0.04, -0.18], [s * 0.52, 0.14, -0.46], [0.1, 0.1, 0.02, 0.02], GOLD);
  }
  limb(k, head, [0, 0.2, -0.24], [0, 0.46, -0.56], [0.1, 0.14, 0.02, 0.02], GOLD);
  // Gold spines down the back of the neck and the body.
  // (Each set into the casting's back, so none stands off it.)
  for (const [y, z, h] of [[2.42, -0.15, 0.22], [2.0, -0.27, 0.24], [1.66, -0.64, 0.26], [1.3, -0.6, 0.24], [0.94, -0.55, 0.2]]) {
    k.mesh(g, prism(0.11, h, 0.55), GOLD, [0, y, z], [-1.2, 0, 0]);
  }
  // The wings folded flat against the flanks: a heavy leading bone up to a gold-capped wrist over
  // the shoulder, the membrane falling from it in one long kite-shaped panel to the haunch.
  for (const s of [-1, 1]) {
    const x = s * 0.64;
    limb(k, g, [s * 0.5, 1.55, -0.2], [s * 0.62, 2.58, -0.5], [0.14, 0.16, 0.1, 0.12], BD);
    k.mesh(g, new THREE.OctahedronGeometry(0.12, 0), WORN, [s * 0.62, 2.66, -0.52]);
    const pts = [[2.56, -0.5], [1.15, -0.1], [1.55, -1.12], [0.62, -0.7]].flatMap(([y, z]) => [new THREE.Vector3(x - 0.03, y, z), new THREE.Vector3(x + 0.03, y, z)]);
    k.mesh(g, new ConvexGeometry(pts), MEMBRANE, [0, 0, 0]);
    limb(k, g, [x + s * 0.04, 2.5, -0.52], [x + s * 0.04, 1.58, -1.08], [0.06, 0.06, 0.05, 0.05], BD);
    limb(k, g, [x + s * 0.04, 2.5, -0.52], [x + s * 0.04, 0.68, -0.7], [0.06, 0.06, 0.05, 0.05], BD);
  }
  // The tail curled round its right side, lying on the plinth: one squared casting from its root
  // under the rump, mitred round each turn and tapering to a flat gold spade on the stone, all well
  // inside the plinth's edge.
  {
    const tail = [[0, -0.6], [0.42, -0.9], [0.78, -0.66], [0.88, -0.26], [0.86, 0.02]].map(([x, z]) => new THREE.Vector2(x, z));
    k.mesh(g, taperBand(tail, [0.34, 0.28, 0.22, 0.17, 0.13], [0.5, 0.3, 0.24, 0.19, 0.15]), BD, [0, 0, 0]);
    const a = tail[tail.length - 2], e = tail[tail.length - 1], d = e.clone().sub(a).normalize(), w = 0.13 / 2;
    const at = (f: number, l: number) => new THREE.Vector3(e.x + d.x * f - d.y * l, 0, e.y + d.y * f + d.x * l);
    // (A flat blade lying on the stone, thinner than the tail's tip, clear of the hind paw.)
    const outline = [at(0, w), at(0.1, 0.13), at(0.36, 0), at(0.1, -0.13), at(0, -w)];
    const spade = new ConvexGeometry([...outline, ...outline.map((q) => q.clone().setY(0.06))]);
    k.mesh(g, spade, GOLD, [0, 0, 0]);
  }
  head.updateMatrix();
  // (The water leaves from inside the dark mouth, so it is first seen pouring over the lower jaw.)
  return new THREE.Vector3(0, -0.11, 0.5).applyMatrix4(head.matrix);
}

/**
 * A drum of stone laid in rings of flat stones round the axis at (x, z) of its group (masonry.ts,
 * laidDrum), in the colour given: a tower's shaft, a course standing proud round it, a parapet ring.
 */
export function drum(k: ModelKit, g: THREE.Object3D, o: Omit<DrumOpts, 'seed'>, color: number, x = 0, z = 0) {
  return k.mesh(g, laidDrum({ ...o, seed: Math.floor(hash01(o.r, o.y0, o.n, color) * 97) }), color, [x, 0, z]);
}

/**
 * A drum's deep battered base course (the castle's one other block size, a metre high), leaning in
 * from radius `foot` to `head`: as many stones as the drum of radius r rising from it, turned half a
 * stone on its first course.
 */
function drumFoot(k: ModelKit, g: THREE.Object3D, r: number, foot: number, head: number, x = 0, z = 0) {
  const n = drumStones(r);
  drum(k, g, { r: foot, rTop: head, y0: 0, y1: BASE_COURSE, n, course: BASE_COURSE, turn: Math.PI / n }, BASE, x, z);
}

/**
 * One course of the dressed stone standing `out` proud of a drum of radius r from the course line y:
 * the drum's own course at that height, its stones a little larger, so the bond runs on through it.
 */
function drumCourse(k: ModelKit, g: THREE.Object3D, r: number, out: number, y: number, x = 0, z = 0) {
  drum(k, g, { r: r + out, y0: y, y1: y + COURSE, n: drumStones(r) }, DRESS, x, z);
}

/**
 * The top of a round tower of radius r centred at (x, z) whose platform is at height P, all in the
 * castle's one stone: the course that carries the parapet, stepped out from the drum and ending on a
 * course line at the platform (crownFoot), the parapet ring standing flush on it two courses high, one
 * continuous coping, and merlons over every other of its N bays. Each is a ring of N flat stones (so a
 * merlon stands square on a stone of the coping), every course turned half a stone on the one under it.
 */
function crown(k: ModelKit, g: THREE.Object3D, x: number, z: number, r: number, P: number, N: number, rose = true) {
  const top = crownFoot(P);
  drum(k, g, { r: r + 0.3, y0: top - COURSE, y1: top, n: N }, DRESS, x, z);
  drum(k, g, { r: r + 0.3, rIn: r - 0.2, y0: top, y1: top + 2 * COURSE, n: N }, ASHLAR, x, z);
  // One continuous coping round the parapet's top under the merlons (never a cap per merlon), its joints
  // between the bays, so each merlon stands on one of its stones.
  drum(k, g, { r: r + 0.36, rIn: r - 0.26, y0: top + 2 * COURSE, y1: top + 2 * COURSE + 0.12, n: N, bond: false }, DRESS, x, z);
  for (let i = 0; i < N; i += 2) {
    const a = ((i + 0.5) / N) * Math.PI * 2, c = 2 * (r + 0.25) * Math.sin(Math.PI / N);
    cb(k, g, [c * 0.82, 0.62, 0.54], [x + Math.sin(a) * (r + 0.05), top + 2 * COURSE + 0.43, z + Math.cos(a) * (r + 0.05)], hash01(i, r) > 0.7 ? ASHLAR_L : ASHLAR, [0, a, 0], 0.05);
  }
  k.cyl(g, r - 0.2, r - 0.2, 0.1, [x, P + 0.05, z], rose ? ASHLAR_W : DECK, undefined, N);
  if (!rose) return;
  // The platform paved as a compass rose inlaid in the castle's own stone: a cream ring round a honey
  // field, a star of eight points (two squares turned against each other) laid in dark slate and
  // outlined by a thin gold inlay (each square laid on a slightly larger one of gilt, so the gold
  // shows only round the star's outline), a cream heart, and a thin gold ring round the slate plinth
  // at its centre (where a flagpole stands).
  const rr = r - 0.2, sq = rr * 0.98;
  k.mesh(g, ringBand(rr * 0.74, rr * 0.86, 0.03, N), ASHLAR_L, [x, P + 0.1, z]);
  k.cyl(g, rr * 0.74, rr * 0.74, 0.03, [x, P + 0.112, z], ASHLAR, undefined, N);
  for (const a of [0, Math.PI / 4]) k.box(g, [sq + 0.12, 0.03, sq + 0.12], [x, P + 0.122, z], GILT, [0, a, 0]);
  for (const a of [0, Math.PI / 4]) k.box(g, [sq, 0.03, sq], [x, P + 0.135, z], INLAY, [0, a, 0]);
  k.cyl(g, rr * 0.36, rr * 0.36, 0.03, [x, P + 0.15, z], ASHLAR_L, undefined, N);
  k.mesh(g, ringBand(0.5, 0.6, 0.03, 16), GILT, [x, P + 0.17, z]);
  k.cyl(g, 0.42, 0.48, 0.16, [x, P + 0.2, z], INLAY, undefined, 10);
}

/**
 * An arrow loop on a face at z (facing +Z), centred at (x, y): a cross loop, its tall slit crossed by a
 * short one, dark within, set in a dressed surround of pale stone, so it reads as a built loop.
 */
export function arrowLoop(k: ModelKit, g: THREE.Object3D, x: number, y: number, z: number) {
  // (The surround only just proud of the face, so it reads as dressed into the wall.)
  cb(k, g, [0.5, 1.56, 0.12], [x, y, z - 0.01], ASHLAR_L, undefined, 0.02);
  k.box(g, [0.11, 1.16, 0.04], [x, y, z + 0.055], DARK);
  k.box(g, [0.36, 0.1, 0.04], [x, y + 0.1, z + 0.055], DARK);
}

/**
 * Lays a piece built flat (along X, its face toward +Z, z = 0 lying on a circle of radius R centred on
 * the origin) into that circle as a mason cuts a doorway through a round wall: every point keeps its
 * height and its place across (moved `o` to the side), and goes straight back or out to its own depth
 * in the wall, so the opening's sides stay square to the way through it while its faces follow the
 * curve.
 */
function cutRound(geo: THREE.BufferGeometry, R: number, o = 0) {
  const g = geo.clone(), p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + o, rad = R + p.getZ(i);
    p.setXYZ(i, x, p.getY(i), Math.sqrt(Math.max(0, rad * rad - x * x)));
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A doorway cut into a drum's wall (onto a wall walk): its surround `L` wide and `top` high, set
 * `back` into the drum and standing only `out` proud of its face, so the stone is cut away for it.
 */
const walkDoor = () => ({ L: DOORS.single.w + 0.6, top: DOORS.single.h + 0.5, back: 0.34, out: 0.05 });
/**
 * A drum's shaft of radius r between heights y0 and y1, laid in rings of flat stones, its wall cut away
 * where doorways onto the wall walk open in it (`doors`: the bearings of their middles and their
 * offsets, sill at `sill`): through each doorway's height the courses are notched straight back along
 * the way through it to a shallow arc behind its surround (the surround is cut the same way: see
 * cutRound), so the doorway stands in the drum's face instead of on it.
 */
function drumShaft(k: ModelKit, g: THREE.Object3D, r: number, y0: number, y1: number, color: number, doors: [number, number][], sill: number) {
  const wd = walkDoor();
  const notches = doors.map(([a, o]) => ({ a, o, half: wd.L / 2 - 0.035, back: r - wd.back + 0.04, y0: sill, y1: sill + wd.top }));
  drum(k, g, { r, y0, y1, n: drumStones(r), notches }, color);
}

/**
 * A doorway in a drum of radius `r` (centred on its group's origin), on the bearing `a` (radians from
 * +Z toward +X), its middle `o` across from the line through the drum's centre and its sill at `y`:
 * a surround of pale dressed stone curved to the drum, the pointed opening cut through it, a
 * blue-grey hood following the arch on its face with label stops, a threshold, and the single blue
 * door at the back of the reveal. A doorway onto a wall walk is cut into the drum (see drumShaft:
 * the shaft is notched for it, the surround flush with the drum's face); one at the drum's foot
 * stands out over the battered plinth and rises to the first band.
 */
export function drumDoorway(k: ModelKit, g: THREE.Object3D, r: number, a: number, o: number, y: number, foot = 0) {
  const { w: W, h } = DOORS.single, rise = Math.min(W * 0.866, h * 0.62);
  const wd = walkDoor(), L = foot ? W + 0.6 : wd.L, top = foot ? 3.9 - y : wd.top, back = foot ? 0.08 : wd.back, deep = foot ? 0.62 : wd.out;
  const R = r + (deep - back) / 2, dep = deep + back;
  // (The doorway faces straight down the walk that comes to it, its middle on the walk's middle: the
  // frame turned to the walk's bearing, everything in it set `o` across.)
  const f = new THREE.Group();
  f.rotation.y = a;
  g.add(f);
  // The surround: the stone round the opening in upright strips, each from the opening's outline (or
  // the sill beside it) to the top, so every face of it lies flat once it follows the curve.
  {
    const { arc } = pointedArch(W, h, 12, rise), jw = (L - W) / 2;
    const edge: [number, number][] = [[-L / 2, 0], [-W / 2 - jw / 2, 0], [-W / 2, 0], ...arc.map(([x, yy]) => [-x, yy] as [number, number]), ...arc.slice(0, -1).reverse(), [W / 2, 0], [W / 2 + jw / 2, 0], [L / 2, 0]];
    const strips = edge.slice(1).flatMap(([xb, yb], i) => {
      if (xb - edge[i][0] < 1e-6) return [];
      const [xa, ya] = edge[i], sh = new THREE.Shape([new THREE.Vector2(xa, ya), new THREE.Vector2(xb, yb), new THREE.Vector2(xb, top), new THREE.Vector2(xa, top)]);
      return new THREE.ExtrudeGeometry(sh, { depth: dep, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -dep / 2);
    });
    const geo = cutRound(mergeGeometries(strips), R, o);
    const zOn = (x: number) => Math.sqrt(R * R - x * x);
    // (For the geometry audit: its two jambs, turned with the curve, and the head over the arch.)
    geo.userData.boxes = [
      ...[-1, 1].map((sx) => o + sx * (W / 2 + jw / 2)).map((x) => ({ c: [x, top / 2, zOn(x)], h: [jw / 2, top / 2, dep / 2], ry: Math.asin(x / R) })),
      { c: [o, (h + top) / 2, zOn(o)], h: [W / 2, (top - h) / 2, dep / 2], ry: Math.asin(o / R) },
    ];
    k.mesh(f, geo, ASHLAR_L, [0, y, 0]);
  }
  // The ring of dressed voussoirs round the arch and down its jambs, laid on the surround's face and
  // bent to the drum's curve with it.
  {
    const Rf = r + deep;
    for (const st of dressedArch({ w: W, h, rise, t: 0.24, p: 0.06, dep: 0.02, n: 3, kw: 0.3, foot: 0, grid: y, seed: Math.floor(hash01(r, a, y) * 97) })) {
      const flat = st.geo.userData.boxes as number[][], geo = cutRound(st.geo, Rf, o);
      // (For the geometry audit: each stone's bounds bent round with it.)
      geo.userData.boxes = flat.map(([x0, y0, z0, x1, y1, z1]) => {
        const xc = (x0 + x1) / 2 + o, rad = Rf + (z0 + z1) / 2;
        return { c: [xc, (y0 + y1) / 2, Math.sqrt(rad * rad - xc * xc)], h: [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2], ry: Math.asin(xc / rad) };
      });
      k.mesh(f, geo, DRESS, [0, y, 0]);
    }
  }
  // The leaf stands square across the way at the back of the reveal: on the plinth's face at a drum's
  // foot; in the cut into the drum on a wall walk, as far back as the cut lets it at both its edges.
  const inR = r - back + 0.04, back0 = Math.max(...[-1, 1].map((sx) => Math.sqrt(inR * inR - (o + (sx * W) / 2) ** 2)));
  const zLeaf = foot ? r + 0.53 : back0 + 0.06, sill = y + (foot ? 0 : 0.05);
  // The threshold across the opening, from under the leaf out over the face, a step proud of the
  // walk's deck that runs in to it.
  const rt = r + deep + 0.1, t0 = foot ? r : zLeaf - 0.05, t1 = Math.sqrt(rt * rt - o * o);
  cb(k, f, [W + 0.02, 0.1, t1 - t0], [o, sill - 0.05, (t0 + t1) / 2], DRESS, undefined, 0.02);
  const d = new THREE.Group();
  d.position.set(o, sill, zLeaf);
  f.add(d);
  pointedDoor(k, d, W, h, rise, 'single', false, 0.06);
}

/**
 * The castle's single door on a face at z (facing +Z), its sill at (x, y): a dressed ring of the
 * castle's stone round its pointed head and down its jambs, a threshold, and the one blue leaf set in
 * the reveal behind them.
 */
export function singleDoor(k: ModelKit, g: THREE.Object3D, x: number, y: number, z: number) {
  const { w: W, h } = DOORS.single, rise = Math.min(W * 0.866, h * 0.62);
  archRing(k, g, x, y, z, W, h, { n: 4, t: 0.3, p: 0.08, dep: 0.02, rise, jamb: true });
  cb(k, g, [W + 0.3, 0.1, 0.5], [x, y - 0.05, z + 0.1], DRESS, undefined, 0.02);
  // (The leaf stands on the face it is set in, inside the reveal its jambs and voussoirs make.)
  const d = new THREE.Group();
  d.position.set(x, y, z + 0.03);
  g.add(d);
  pointedDoor(k, d, W, h, rise, 'single', false, 0.06);
}

/**
 * A round tower of radius r (the round_tower and corner_tower props), laid in rings of flat stones as
 * a stone tower is (see drum): a deep, battered base course, a drum rising a full storey or more over
 * the wall walk (+7) to its platform at H + 1.4, a string course and the course under the wall walk
 * level with the curtain's (CURTAIN_COURSES), a band under the crown, and the crown (a parapet ring on
 * a course stepped out from the drum, merlons), all in the castle's one stone on the course lines. Each
 * course that stands proud is the drum's own course at that height, the same stones a little larger,
 * so the bond runs on through it. A plain tower's platform is paved as a compass rose; a corner tower
 * (or a stair tower, `spire`) carries a gilt frieze for its band and a spire. `walks`: where the
 * curtain's wall walks come to it ([bearing, offset] pairs), a doorway onto each; `door`: the bearing
 * of a door at its foot; `out`: the bearing it faces out from the castle, its arrow loops in two rows
 * round that side.
 */
export interface TowerOpts {
  walks?: [number, number][];
  door?: number;
  out?: number;
  spire?: boolean;
}
function drumTower(k: ModelKit, g: THREE.Object3D, r: number, H: number, corner: boolean, opt: TowerOpts = {}) {
  const N = 20, P = H + 1.4, spired = corner || !!opt.spire, top = crownFoot(P);
  drumFoot(k, g, r, r + 0.5, r + 0.15);
  drumShaft(k, g, r, BASE_COURSE, P, ASHLAR, opt.walks ?? [], DOORS.walk.y);
  for (const y of CURTAIN_COURSES) drumCourse(k, g, r, 0.06, y);
  if (spired) drumFrieze(k, g, 0, 0, r, top - 1.5 * COURSE, N);
  else drumCourse(k, g, r, 0.06, top - 2 * COURSE);
  crown(k, g, 0, 0, r, P, N, !spired);
  for (const [a, o] of opt.walks ?? []) drumDoorway(k, g, r, a, o, DOORS.walk.y);
  if (opt.door !== undefined) drumDoorway(k, g, r, opt.door, 0, 0, 0.5);
  // Arrow loops: three to a row across the outward side, evenly spaced, one row in each storey (between
  // the courses), none where a wall or a doorway meets the drum.
  if (opt.out !== undefined) {
    const busy = [...(opt.walks ?? []).map(([a]) => a), ...(opt.door !== undefined ? [opt.door] : [])];
    const step = (Math.PI * 2) / N;
    for (const da of [-0.95, 0, 0.95]) {
      const a = (Math.round((opt.out + da) / step - 0.5) + 0.5) * step;
      if (busy.some((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.75)) continue;
      const f = new THREE.Group();
      f.rotation.y = a;
      g.add(f);
      for (const y of LOOP_ROWS) arrowLoop(k, f, 0, y, r);
    }
  }
  if (spired) spire(k, g, 0, P + 0.9, 0, r + 0.1, r * 1.75, N, 1, 1.5);
}

/**
 * A blue-slate spire whose foot (radius r) stands at y over (x, z), `h` tall, on a stone eave:
 * two thin gilt bands round it (at the foot and two thirds up), a gilt ball-and-spike finial on the
 * point and, when `pennant` is ±1, a small house pennant on the spike flying that way along X.
 */
export function spire(k: ModelKit, g: THREE.Object3D, x: number, y: number, z: number, r: number, h: number, N: number, pennant = 0, size = 1) {
  k.cyl(g, r + 0.12, r + 0.12, 0.16, [x, y + 0.08, z], DRESS, undefined, N);
  const y0 = y + 0.16;
  k.cone(g, r, h, [x, y0 + h / 2, z], SLATE_BLUE, undefined, N);
  for (const f of [0.04, 0.64]) {
    const t = 0.035;
    k.cyl(g, r * (1 - f - t) + 0.05, r * (1 - f) + 0.05, h * t, [x, y0 + h * (f + t / 2), z], GILT, undefined, N);
  }
  const tip = y0 + h, b = Math.max(0.22, r * 0.11);
  k.cyl(g, b * 0.5, b * 0.5, b * 0.7, [x, tip - b * 0.1, z], PAL.gold, undefined, 8);
  k.mesh(g, new THREE.OctahedronGeometry(b, 1), PAL.gold, [x, tip + b * 0.9, z]);
  k.cone(g, b * 0.3, b * 3, [x, tip + b * 3.2, z], PAL.gold, undefined, 6);
  if (pennant) {
    cb(k, g, [0.08, 1.6 * size, 0.08], [x, tip + b * 2 + 0.8 * size, z], IRON, undefined, 0.01);
    flag(k, g, x, tip + b * 2 + 1.55 * size, z, 1.1 * size, 0.6 * size, pennant);
  }
}

/** A gilt frieze one course high on a face (along local X, facing +Z), centred at y: a course of dressed stone, a row of gold diamonds on it. */
export function frieze(k: ModelKit, g: THREE.Object3D, len: number, x: number, y: number, z: number) {
  cb(k, g, [len, COURSE, 0.16], [x, y, z], DRESS, undefined, 0.02);
  for (let u = -len / 2 + 0.4; u <= len / 2 - 0.38; u += 0.8) k.box(g, [0.2, 0.2, 0.05], [x + u, y, z + 0.09], GILT, [0, 0, Math.PI / 4]);
}

/**
 * The same gilt frieze round a drum of radius r centred at (x, z), its course centred at height y: the
 * drum's own course standing proud, the diamonds evenly round it.
 */
export function drumFrieze(k: ModelKit, g: THREE.Object3D, x: number, z: number, r: number, y: number, N: number) {
  const n = drumStones(r), y0 = y - COURSE / 2, step = (Math.PI * 2) / n, R = r + 0.1;
  drum(k, g, { r: R, y0, y1: y0 + COURSE, n }, DRESS, x, z);
  // (Each diamond laid flat on the stone it falls on, two to each of its N bays: the course is turned
  // half a stone on an odd course line, as laidDrum turns it.)
  const t0 = (Math.round(y0 / COURSE) % 2) * (step / 2), m = 2 * N;
  for (let i = 0; i < m; i++) {
    const a = ((i + 0.5) / m) * Math.PI * 2, f = t0 + (Math.floor((a - t0) / step) + 0.5) * step;
    const d = (R * Math.cos(step / 2)) / Math.cos(a - f);
    k.box(g, [0.2, 0.2, 0.05], [x + Math.sin(a) * d + Math.sin(f) * 0.025, y, z + Math.cos(a) * d + Math.cos(f) * 0.025], GILT, [0, f, Math.PI / 4]);
  }
}

/**
 * A flat ring (an annulus `h` thick from radius rIn to rOut, base on y = 0) with `n` straight sides,
 * its corners at the same angles as a kit cylinder's: copings and eave rings round round towers.
 */
const ringCache = new Map<string, THREE.BufferGeometry>();
export function ringBand(rIn: number, rOut: number, h: number, n: number) {
  const key = `${rIn},${rOut},${h},${n}`;
  let geo = ringCache.get(key);
  if (geo) return geo;
  const poly = (r: number) => Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    // Laid flat below, the shape's -y becomes +z: (sin a, cos a) round the plan like a cylinder's.
    return new THREE.Vector2(Math.sin(a) * r, -Math.cos(a) * r);
  });
  const shape = new THREE.Shape(poly(rOut));
  shape.holes.push(new THREE.Path(poly(rIn)));
  // Extruded along +Z, then laid flat (+Z becomes +Y).
  geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 }).rotateX(-Math.PI / 2);
  geo.userData.ring = [rIn, rOut];
  ringCache.set(key, geo);
  return geo;
}

/** A flat point of cloth: a triangle `w` across its top edge (on y = 0) to a point `h` below it, `d` thick. */
const pointCache = new Map<string, THREE.BufferGeometry>();
function clothPoint(w: number, h: number, d: number) {
  const key = `${w},${h},${d}`;
  let geo = pointCache.get(key);
  if (!geo) {
    const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(0, -h), new THREE.Vector2(w / 2, 0)]);
    geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
    pointCache.set(key, geo);
  }
  return geo;
}

/**
 * The castle's window glass: clear panes with a cool tint, plainly see-through to the dim room (or
 * recess) behind (the tint a dark cool grey, so it cools and deepens what shows through it rather than
 * lying over it as a lit film); polished, so the sky's light sheens across a pane only at a glancing
 * look (a reflection that grows with the angle, as real glass does), never a painted streak. One
 * material per kit, so a building's cut takes it with its walls; it casts no shadow.
 */
export function windowGlass() {
  const m = new THREE.MeshStandardMaterial({
    color: 0x24363e, transparent: true, opacity: 0.2, depthWrite: false, roughness: 0.04, metalness: 0.0,
    envMap: studioEnv(), envMapIntensity: 1.6, flatShading: true,
  });
  // (Clear face on, the sky over it at a slant: the pane grows more reflective and less see-through
  // the more glancing the look.)
  addPatch(m, { key: 'glass-fresnel', apply: (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `{
      float fres = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 5.0);
      diffuseColor.a = clamp(diffuseColor.a + fres * 0.6, 0.0, 1.0);
    }
    #include <opaque_fragment>`);
  } });
  m.userData.decal = true;
  m.userData.cloth = true;
  m.userData.baseEmissive = new THREE.Color(0);
  m.userData.baseIntensity = 1;
  return m;
}
const glassMats = new WeakMap<ModelKit, THREE.MeshStandardMaterial>();
export function glassMat(k: ModelKit) {
  let m = glassMats.get(k);
  if (!m) {
    glassMats.set(k, (m = windowGlass()));
    k.mats.push(m);
  }
  return m;
}
/**
 * The room seen through a window, painted on a plate a little behind the glass: dim and warm, the light
 * of a hearth or a candle pooled low in its middle and falling away into shadow toward the frame, the
 * far wall a touch lighter where it catches the glow. No walls or floor are drawn in it (a chamber
 * drawn in depth reads as a corridor through the glass). Unlit rooms show the same dim depth, cooler.
 */
let roomTex: THREE.DataTexture | null = null;
function roomGlow() {
  if (roomTex) return roomTex;
  const W = 32, H = 64, data = new Uint8Array(W * H * 4), c = new THREE.Color(), s = { r: 0, g: 0, b: 0 };
  const dark = new THREE.Color(0x1c140f), wall = new THREE.Color(0x4e3a29), warm = new THREE.Color(0xc4874c);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W, v = (y + 0.5) / H;
    // (The glow broad and low, the wall a little lit all across, shading off toward the frame and up.)
    const glow = Math.exp(-(((u - 0.5) / 0.45) ** 2 + ((v - 0.3) / 0.4) ** 2)), frame = Math.min(1, Math.min(u, 1 - u) * 5);
    c.copy(dark).lerp(wall, (0.35 + 0.5 * frame) * (1 - 0.45 * v)).lerp(warm, 0.5 * glow);
    // (Written in sRGB, the space the texture is read in.)
    c.getRGB(s, THREE.SRGBColorSpace);
    const i = (y * W + x) * 4;
    data[i] = Math.round(s.r * 255);
    data[i + 1] = Math.round(s.g * 255);
    data[i + 2] = Math.round(s.b * 255);
    data[i + 3] = 255;
  }
  roomTex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  roomTex.magFilter = THREE.LinearFilter;
  roomTex.minFilter = THREE.LinearFilter;
  roomTex.colorSpace = THREE.SRGBColorSpace;
  roomTex.needsUpdate = true;
  return roomTex;
}
/** The room behind a window (see roomGlow): one material per kit and lighting, so cuts take it. */
export function roomMaterial(lit = true) {
  // (Its own light only: black under the sun, the painted room as emission.)
  const glow = new THREE.Color(lit ? 0xffffff : 0xaab0bc);
  const m = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1, metalness: 0, emissive: glow, emissiveMap: roomGlow() });
  m.userData.baseEmissive = glow.clone();
  m.userData.baseIntensity = 1;
  // (Left as painted: no stone or metal finish.)
  m.userData.cloth = true;
  return m;
}
const roomMats = new WeakMap<ModelKit, Map<boolean, THREE.MeshStandardMaterial>>();
function roomMat(k: ModelKit, lit: boolean) {
  let by = roomMats.get(k);
  if (!by) roomMats.set(k, (by = new Map()));
  let m = by.get(lit);
  if (!m) {
    by.set(lit, (m = roomMaterial(lit)));
    k.mats.push(m);
  }
  return m;
}
/** The plate a room is painted on, filling a pointed opening `w` by `h` (facing +Z, sill at y = 0). */
const roomPlates = new Map<string, THREE.BufferGeometry>();
export function roomPlate(w: number, h: number) {
  const key = `${w},${h}`;
  let g = roomPlates.get(key);
  if (!g) {
    g = new THREE.ShapeGeometry(archShape(w, h));
    const pos = g.getAttribute('position'), uv = g.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, pos.getY(i) / h);
    roomPlates.set(key, g);
  }
  return g;
}

/**
 * The lord's cloth (banners and flags): one painted texture per shape, its colours, gold edging and
 * the gold dragon diamond all in the one cloth, and its swallowtail cut out of it by alpha, so each
 * banner or flag is a single cohesive piece. `paint(x, y)` takes cloth coordinates in world units
 * (x across, y down from the top edge) and returns a colour, or null where the cloth is cut away.
 */
const clothTextures = new Map<string, THREE.DataTexture>();
function clothTexture(key: string, w: number, h: number, paint: (x: number, y: number) => number | null) {
  let tex = clothTextures.get(key);
  if (tex) return tex;
  const PX = 56, W = Math.max(8, Math.round(w * PX)), H = Math.max(8, Math.round(h * PX)), data = new Uint8Array(W * H * 4);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    // (Row 0 is the cloth's bottom edge: v runs up the texture.)
    const col = paint(((c + 0.5) / W) * w, (1 - (r + 0.5) / H) * h), i = (r * W + c) * 4;
    if (col === null) continue;
    data[i] = (col >> 16) & 255;
    data[i + 1] = (col >> 8) & 255;
    data[i + 2] = col & 255;
    data[i + 3] = 255;
  }
  tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  clothTextures.set(key, tex);
  return tex;
}

/** The cloth's material in a kit (one per kit and texture, so a building's cut takes it with its walls). */
const clothMats = new WeakMap<ModelKit, Map<THREE.Texture, THREE.MeshStandardMaterial>>();
function clothMat(k: ModelKit, tex: THREE.DataTexture) {
  let byTex = clothMats.get(k);
  if (!byTex) clothMats.set(k, (byTex = new Map()));
  let m = byTex.get(tex);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.82, metalness: 0.02 });
    m.userData.cloth = true;
    m.userData.baseEmissive = new THREE.Color(0);
    m.userData.baseIntensity = 1;
    byTex.set(tex, m);
    k.mats.push(m);
  }
  return m;
}

/** A gold diamond on the cloth, centred at (cx, cy), `d` from its centre to each point. */
const diamond = (x: number, y: number, cx: number, cy: number, d: number) => Math.abs(x - cx) + Math.abs(y - cy) <= d;

/**
 * The lord's banner hanging flat on a face (facing +Z) from a rod at height `top`: one long cloth
 * `w` wide, its straight sides running the whole length (`h` to the root of the tail, then the tail)
 * to two points at the corners, a deep swallowtail notch cut up its middle and edged in gold, a thin
 * gold strip down each side and the gold dragon diamond in the field.
 */
export function livery(k: ModelKit, p: THREE.Object3D, x: number, top: number, z: number, w: number, h: number) {
  cb(k, p, [w + 0.4, 0.14, 0.14], [x, top, z - 0.02], WOOD_D, undefined, 0.02);
  const th = w * 0.6, L = h + th, edge = 0.075;
  const tex = clothTexture(`banner:${w.toFixed(2)}:${h.toFixed(2)}`, w, L, (u, y) => {
    const xc = u - w / 2;
    // The notch: from the root of the tail on the centre line out to both corners at the hem.
    const notch = y > h ? (w / 2) * ((y - h) / th) - Math.abs(xc) : -1;
    if (notch > 0) return null;
    // (Gold along the notch's two edges: the perpendicular distance in from each.)
    if (y > h - edge * 2 && (-notch * th) / Math.hypot(th, w / 2) < edge) return PAL.gold;
    if (Math.abs(Math.abs(xc) - (w / 2 - 0.12)) < 0.045) return PAL.gold;
    if (diamond(xc, y, 0, Math.min(h * 0.4, w * 0.9), w * 0.26)) return PAL.gold;
    // (One blue from the rod to the points of the tail.)
    return HERALD_BLUE;
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, L), clothMat(k, tex));
  m.name = 'cloth';
  m.position.set(x, top - 0.07 - L / 2, z + 0.03);
  p.add(m);
}

/**
 * A flag on a pole at x, its top edge at `top`, flying out toward `dir` (±1 along X): one cloth `w`
 * long and `h` high, a broad gold stripe at the hoist, the gold dragon diamond in the field and a
 * forked fly edged in gold (all one blue), rippling in soft waves that grow toward the fly and
 * drooping a little from the hoist, so it reads as cloth from the high camera too.
 */
export function flag(k: ModelKit, p: THREE.Object3D, x: number, top: number, z: number, w: number, h: number, dir = 1) {
  const fork = Math.min(h * 0.5, w * 0.32), hoist = Math.max(0.16, w * 0.1), edge = 0.06;
  const tex = clothTexture(`flag:${w.toFixed(2)}:${h.toFixed(2)}`, w, h, (u, y) => {
    const t = Math.abs((2 * y) / h - 1), cut = w - fork * (1 - t);
    if (u > cut) return null;
    if (u > w - fork && cut - u < edge * Math.hypot(1, fork / (h / 2))) return PAL.gold;
    if (u < hoist) return PAL.gold;
    if (diamond(u, y, w * 0.48, h / 2, h * 0.3)) return PAL.gold;
    return HERALD_BLUE;
  });
  const NX = 12, NY = 3, geo = new THREE.PlaneGeometry(w, h, NX, NY);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    // From the hoist (t = 0) to the fly (t = 1): waves growing along the length, the fly sagging.
    const t = (pos.getX(i) + w / 2) / w, yy = pos.getY(i);
    pos.setXYZ(i, dir * (0.03 + t * w), yy - h / 2 - 0.5 * (h / 1.4) * t * t * 0.55 - t * w * 0.12, Math.sin(t * 7.0 + 0.4) * 0.13 * w * t);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, clothMat(k, tex));
  m.name = 'cloth';
  m.position.set(x, top, z);
  p.add(m);
}

/**
 * A pointed (two-centred) arch `w` wide whose apex stands `h` above its sill: straight jambs up to
 * the springing, then two arcs meeting at the apex (an equilateral arch where the opening is tall
 * enough). Returns the springing height, the arch's rise and the points of its right-hand arc from
 * the springing to the apex (x across from the centre line, y up from the sill); the left-hand arc
 * is its mirror.
 */
export function pointedArch(w: number, h: number, n = 7, rise?: number) {
  const hw = w / 2, ah = rise ?? Math.min(w * 0.866, h * 0.62), ys = h - ah;
  const c = (ah * ah - hw * hw) / w, R = hw + c, ta = Math.atan2(ah, c);
  const arc: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = (ta * i) / n;
    arc.push([-c + R * Math.cos(t), ys + R * Math.sin(t)]);
  }
  return { ys, ah, arc, c, R };
}

/** The opening of a pointed arch as a Shape (sill at y = 0, centred on x = 0). */
export function archShape(w: number, h: number, n = 7) {
  const { arc } = pointedArch(w, h, n), hw = w / 2;
  const s = new THREE.Shape();
  s.moveTo(-hw, 0);
  s.lineTo(hw, 0);
  for (const [x, y] of arc) s.lineTo(x, y);
  for (let i = arc.length - 2; i >= 0; i--) s.lineTo(-arc[i][0], arc[i][1]);
  s.closePath();
  return s;
}

/**
 * The two spandrels that fill a square-headed opening `w` wide and `h` tall down to a pointed arch
 * inside it (so a rectangular hole in a wall reads as a pointed lancet), extruded `dep` deep and
 * centred on z = 0.
 */
const spandrelCache = new Map<string, THREE.BufferGeometry>();
export function spandrels(w: number, h: number, dep: number, rise?: number) {
  const key = `${w},${h},${dep},${rise}`;
  let g = spandrelCache.get(key);
  if (g) return g;
  const { arc } = pointedArch(w, h, 7, rise), hw = w / 2;
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const s = new THREE.Shape();
    s.moveTo(sx * hw, arc[0][1] - 0.01);
    s.lineTo(sx * (hw + 0.01), h + 0.01);
    s.lineTo(0, h + 0.01);
    for (let i = arc.length - 1; i >= 0; i--) s.lineTo(sx * arc[i][0], arc[i][1]);
    s.closePath();
    parts.push(new THREE.ExtrudeGeometry(s, { depth: dep, bevelEnabled: false }).translate(0, 0, -dep / 2));
  }
  g = mergeGeometries(parts.map((p) => p.toNonIndexed()))!;
  g.computeVertexNormals();
  g.userData.hollow = true;
  spandrelCache.set(key, g);
  return g;
}

/**
 * The tympanum of a pointed doorway `w` wide whose apex stands `h` above its sill, its arch rising
 * `rise` over the springing: the head of the opening above the springing (sill at y = 0), `dep`
 * thick, centred on z = 0, to fill the arch over a square-headed pair of leaves.
 */
const tympCache = new Map<string, THREE.BufferGeometry>();
export function archTympanum(w: number, h: number, dep: number, rise: number) {
  const key = `${w},${h},${dep},${rise}`;
  let g = tympCache.get(key);
  if (!g) {
    const { arc } = pointedArch(w, h, 10, rise);
    const s = new THREE.Shape();
    s.moveTo(-arc[0][0], arc[0][1]);
    for (const [px, py] of arc) s.lineTo(px, py);
    for (let i = arc.length - 2; i >= 1; i--) s.lineTo(-arc[i][0], arc[i][1]);
    s.closePath();
    g = new THREE.ExtrudeGeometry(s, { depth: dep, bevelEnabled: false }).translate(0, 0, -dep / 2);
    tympCache.set(key, g);
  }
  return g;
}

/** A pane of glass in a pointed opening, `dep` thick, centred on z = 0. */
const paneCache = new Map<string, THREE.BufferGeometry>();
export function archPane(w: number, h: number, dep: number) {
  const key = `${w},${h},${dep}`;
  let g = paneCache.get(key);
  if (!g) {
    g = new THREE.ExtrudeGeometry(archShape(w, h), { depth: dep, bevelEnabled: false }).translate(0, 0, -dep / 2);
    paneCache.set(key, g);
  }
  return g;
}

/**
 * The stones of a pointed arch (`w` wide, apex `h` above the sill at y = 0, centred on x = 0, the
 * arch rising `rise` over its springing) laid between `r0` and `r1` out from the opening's edge, as
 * outlines in the arch's plane: `n` voussoirs a side, cut on true radial joints so they close on each
 * other with no gap and no step, and a keystone `kw` wide at its foot closing the two arcs on the
 * centre line. Each comes with its place in the ring counted from the keystone (0) out to the springing.
 */
export function archStones(w: number, h: number, rise: number | undefined, r0: number, r1: number, n: number, kw: number) {
  const { ys, c, R } = pointedArch(w, h, 2, rise);
  /** The right-hand arc `d` out from the opening at angle `a` (0 at the springing). */
  const at = (d: number, a: number): [number, number] => [-c + (R + d) * Math.cos(a), ys + (R + d) * Math.sin(a)];
  /** Where the right-hand arc `d` out reaches the centre line. */
  const apexA = (d: number) => Math.atan2(Math.sqrt(Math.max(0, (R + d) ** 2 - c * c)), c);
  const keyA = Math.acos(Math.min(1, (kw / 2 + c) / (R + r0)));
  const arcPts = (d: number, a: number, b: number, k = 4) => Array.from({ length: k + 1 }, (_, i) => at(d, a + ((b - a) * i) / k));
  const out: { pts: [number, number][]; place: number }[] = [];
  for (let j = 0; j < n; j++) {
    const a = (keyA * j) / n, b = (keyA * (j + 1)) / n;
    const right = [...arcPts(r0, a, b), ...arcPts(r1, b, a)];
    for (const sx of [1, -1]) out.push({ pts: (sx > 0 ? right : right.map(([x, y]) => [-x, y] as [number, number]).reverse()), place: n - j });
  }
  const inR = arcPts(r0, keyA, apexA(r0)), outR = arcPts(r1, apexA(r1), keyA);
  const mirror = (p: [number, number][]) => p.map(([x, y]) => [-x, y] as [number, number]).reverse();
  out.push({ pts: [...inR, ...mirror(inR).slice(1), ...mirror(outR), ...outR.slice(1)], place: 0 });
  return out;
}

/** Add a laid quad turned so its face looks along `toward` (corners in either order round it). */
function laidFace(L: Laid, c: [LaidCorner, LaidCorner, LaidCorner, LaidCorner], toward: [number, number, number], cut: Parameters<Laid['quad']>[1]) {
  const [a, b, d] = [c[0], c[1], c[2]];
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  L.quad(n[0] * toward[0] + n[1] * toward[1] + n[2] * toward[2] >= 0 ? c : [c[0], c[3], c[2], c[1]], cut);
}

/**
 * The dressed ring of a pointed opening, in a face at z = 0 facing +Z, as stones that each lay their own
 * joints (masonry.ts, Laid): the opening `w` wide with its apex `h` over the sill at y = 0, centred on
 * x = 0, its arch rising `rise` over the springing; the ring `t` wide all round, `out` beyond the
 * opening's edge (inside it when negative), standing `p` proud of the face and running `dep` back into
 * the reveal, all one stone. Its `n` voussoirs a side are cut on the arch's radial joints (archStones),
 * closing on a keystone `kw` wide; with `foot` it runs on down both jambs as stones bedded on the
 * walling's course lines (`grid`: how far over the line the courses are counted from the sill stands),
 * none under a quarter course. The face's inner edge and the reveal's front edge are arrises. Each stone
 * comes with the height of its foot, and its bounds for the geometry audit, so a caller that splits its
 * walls by height can set each stone in its own band.
 */
export function dressedArch(o: { w: number; h: number; rise?: number; t: number; p: number; dep: number; out?: number; n: number; kw?: number; foot?: number; grid?: number; seed?: number }) {
  const { w, h, t, p, dep, out = 0, n, kw = 0.4, grid = 0, seed = 0 } = o;
  const { ys } = pointedArch(w, h, 2, o.rise), x0 = w / 2 + out, x1 = x0 + t;
  const stones: { geo: THREE.BufferGeometry; y: number }[] = [];
  const length = (q: [number, number][]) => q.slice(1).reduce((a, v, i) => a + Math.hypot(v[0] - q[i][0], v[1] - q[i][1]), 0);
  let X = 0;
  /** One stone from its inner and outer edges, both in the ring's own order (up the left, down the right). */
  const lay = (inner: [number, number][], outer: [number, number][]) => {
    const L = new Laid(seed), k = inner.length - 1, len = (length(inner) + length(outer)) / 2;
    const Xs = inner.map((_, i) => X + i / k);
    for (let i = 0; i < k; i++) {
      const a = inner[i], b = inner[i + 1], c = outer[i + 1], d = outer[i];
      // The face; the reveal under the stone, toward the opening; and its edge standing proud of the wall.
      laidFace(L, [[a[0], a[1], p, Xs[i], 0], [b[0], b[1], p, Xs[i + 1], 0], [c[0], c[1], p, Xs[i + 1], 1], [d[0], d[1], p, Xs[i], 1]], [0, 0, 1], { l: len, h: t, mode: 2, cs: 0, ce: 2 });
      laidFace(L, [[a[0], a[1], p, Xs[i], 1], [b[0], b[1], p, Xs[i + 1], 1], [b[0], b[1], -dep, Xs[i + 1], 0], [a[0], a[1], -dep, Xs[i], 0]], [a[0] - d[0], a[1] - d[1], 0], { l: len, h: p + dep, mode: 2, cs: -1, ce: 1 });
      laidFace(L, [[d[0], d[1], 0, Xs[i], 0], [c[0], c[1], 0, Xs[i + 1], 0], [c[0], c[1], p, Xs[i + 1], 1], [d[0], d[1], p, Xs[i], 1]], [d[0] - a[0], d[1] - a[1], 0], { l: len, h: p, mode: 2, cs: -1, ce: 1 });
    }
    const geo = L.build(), all = [...inner, ...outer];
    // (For the geometry audit: the stone's own bounds, never the opening it frames.)
    geo.userData.boxes = [[Math.min(...all.map((q) => q[0])), Math.min(...all.map((q) => q[1])), -dep, Math.max(...all.map((q) => q[0])), Math.max(...all.map((q) => q[1])), p]];
    stones.push({ geo, y: Math.min(...all.map((q) => q[1])) });
    X += 1;
  };
  // The jambs' beds: on the course lines between the foot and the springing, a quarter course clear of both.
  const beds: number[] = [];
  if (o.foot !== undefined) {
    beds.push(o.foot);
    for (let k = Math.ceil((o.foot + grid) / COURSE); k * COURSE - grid < ys; k++) {
      const y = k * COURSE - grid;
      if (y > o.foot + COURSE / 2 - 1e-6 && y < ys - COURSE / 2 + 1e-6) beds.push(y);
    }
    beds.push(ys);
  }
  for (let i = 0; i + 1 < beds.length; i++) lay([[-x0, beds[i]], [-x0, beds[i + 1]]], [[-x1, beds[i]], [-x1, beds[i + 1]]]);
  const ring = archStones(w, h, o.rise, out, out + t, n, kw), half = (q: [number, number][]) => q.length / 2;
  // Up the left side from the springing, the keystone, and down the right side to the springing.
  for (const st of ring.filter((q) => q.place > 0 && q.pts[0][0] < 0).sort((a, b) => b.place - a.place)) {
    const m = half(st.pts);
    lay(st.pts.slice(m).reverse(), st.pts.slice(0, m));
  }
  const key = ring.find((q) => q.place === 0)!, km = half(key.pts);
  lay(key.pts.slice(0, km).reverse(), key.pts.slice(km));
  for (const st of ring.filter((q) => q.place > 0 && q.pts[0][0] > 0).sort((a, b) => a.place - b.place)) {
    const m = half(st.pts);
    lay(st.pts.slice(0, m).reverse(), st.pts.slice(m));
  }
  for (let i = beds.length - 1; i > 0; i--) lay([[x0, beds[i]], [x0, beds[i - 1]]], [[x1, beds[i]], [x1, beds[i - 1]]]);
  return stones;
}

/**
 * The dressed ring round a pointed arch (`w` wide, apex `h` above the sill, sill at y0, centred on x)
 * on a face at z (facing +Z), in the castle's dressed stone: voussoirs `t` wide standing `p` proud of
 * the face, `n` to each side, cut on radial joints and closing on a keystone, `out` beyond the opening's
 * edge, running `dep` back into the reveal; with `jamb` it carries on down both jambs to the sill, laid
 * on the walling's courses (see dressedArch).
 */
export function archRing(k: ModelKit, g: THREE.Object3D, x: number, y0: number, z: number, w: number, h: number, opt: { n?: number; t?: number; p?: number; dep?: number; out?: number; rise?: number; jamb?: boolean } = {}) {
  const { n = 5, t = 0.26, p = 0.14, dep = 0.06, out = 0 } = opt;
  for (const st of dressedArch({ w, h, rise: opt.rise, t, p, dep, out, n, kw: t * 1.3, foot: opt.jamb ? 0 : undefined, grid: y0, seed: Math.floor(hash01(x, y0, z) * 97) })) k.mesh(g, st.geo, DRESS, [x, y0, z]);
}

/**
 * The dressed surround of a pointed doorway `w` wide, its apex `h` over the sill at y = 0, centred on
 * x = 0 in a face at z = 0 (facing +Z): one ring of the castle's dressed stone `t` wide round the arch
 * and down both jambs to `foot` (see dressedArch), flush in one plane `p` proud of the face and `dep`
 * deep into the reveal. Returns the stones (each a geometry with the height of its foot), so a caller
 * that splits its walls by height can place each stone in its own band.
 */
export function archDressing(w: number, h: number, rise: number, opt: { foot: number; t?: number; p?: number; dep?: number; inset?: number; grid?: number }) {
  // (`inset`: the surround's inner face stands that far inside the opening, so it never lies in one
  // plane with the end of a wall cut to the opening behind it.)
  const { foot, t = 0.48, p = 0.08, dep = 0.3, inset = 0, grid = 0 } = opt;
  const { c, R } = pointedArch(w, h, 2, rise);
  // Voussoirs about 0.42 along the ring's middle, a keystone a little broader.
  const arcLen = (R + t / 2) * Math.atan2(Math.sqrt(Math.max(0, (R + t / 2) ** 2 - c * c)), c);
  const n = Math.max(2, Math.round((arcLen - 0.25) / 0.42));
  return dressedArch({ w, h, rise, t, p, dep, out: -inset, n, kw: 0.46, foot, grid, seed: Math.floor(hash01(w, h, t) * 97) });
}

/**
 * A tall pointed lancet on a face at z (facing +Z), its sill at y: the opening framed by a dressed ring
 * of the castle's stone (jambs to the springing on the walling's courses, voussoirs round the head),
 * clear glass over the dim room behind it, and a projecting sill.
 */
export function lancet(k: ModelKit, g: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, lit = true, dress = 1) {
  // The room behind the glass, then the pane in front of it, both inside the surround's reveal.
  const room = new THREE.Mesh(roomPlate(w, h), roomMat(k, lit));
  room.name = 'room';
  room.position.set(x, y, z + 0.012);
  g.add(room);
  const pane = new THREE.Mesh(archPane(w, h, 0.02), glassMat(k));
  pane.name = 'glass';
  pane.position.set(x, y, z + 0.07);
  g.add(pane);
  // (`dress` narrows the surround, so on a slender drum it hugs the curve.)
  archRing(k, g, x, y, z, w, h, { n: 3, t: 0.3 * dress, p: 0.1, dep: 0.14, jamb: true });
  cb(k, g, [w + 0.5, 0.14, 0.32], [x, y - 0.07, z + 0.06], DRESS, undefined, 0.02);
}

/**
 * A round window (an oculus) of radius `r` on a face at z (facing +Z), centred at (x, y): a ring of
 * the castle's dressed stone round it with a keystone at each quarter, and one clear pane over the lit
 * room behind.
 */
export function oculus(k: ModelKit, g: THREE.Object3D, x: number, y: number, z: number, r: number) {
  const n = 16, t = 0.18, ro = r + t;
  const ring = (a: number, b: number, d: number) => {
    const geo = ringBand(a, b, d, n).clone().rotateX(Math.PI / 2);
    delete geo.userData.ring;
    // (For the geometry audit: the ring as four boxes round the opening.)
    geo.userData.boxes = [[-b, a, 0, b, b, d], [-b, -b, 0, b, -a, d], [-b, -a, 0, -a, a, d], [a, -a, 0, b, a, d]];
    return geo;
  };
  // (Only just proud of the face, and hugging a drum's curve.)
  k.mesh(g, ring(r, ro, 0.1), DRESS, [x, y, z - 0.02]);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    cb(k, g, [0.2, t + 0.06, 0.12], [x + Math.sin(a) * (r + t / 2), y + Math.cos(a) * (r + t / 2), z + 0.05], DRESS, [0, 0, -a], 0.02);
  }
  const room = new THREE.Mesh(new THREE.CircleGeometry(r, n), roomMat(k, true));
  room.name = 'room';
  room.position.set(x, y, z + 0.012);
  g.add(room);
  const pane = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape().absarc(0, 0, r, 0, Math.PI * 2, false), { depth: 0.02, bevelEnabled: false, curveSegments: n }).translate(0, 0, -0.01), glassMat(k));
  pane.name = 'glass';
  pane.position.set(x, y, z + 0.04);
  g.add(pane);
}

// ─── The glazing kit ─────────────────────────────────────────────────────────

/**
 * The castle's window glass (the owner, October 3: see-through glass with a cool blue tint): two thin
 * sheets in one opening. The first filters what lies behind it, each colour multiplied by the glass's
 * cool blue as tinted glass does, so the room shows through it clear and cooled, never hazed over.
 */
const GLASS_TINT = new THREE.Color().setRGB(0.62, 0.8, 0.96, THREE.LinearSRGBColorSpace);
const tintMats = new WeakMap<ModelKit, THREE.MeshBasicMaterial>();
function glassTint(k: ModelKit) {
  let m = tintMats.get(k);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color: GLASS_TINT, transparent: true, depthWrite: false, fog: false, toneMapped: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
    });
    m.userData.decal = true;
    tintMats.set(k, m);
  }
  return m;
}

/**
 * The glass's face, over the tint: it gives back only what glass gives back. A faint blue body, the
 * sky's sheen growing at a glancing look (where less of the room shows through, as on real glass), and
 * the leading: diamond quarries a quarter of a metre across in thin lead cames, with an iron saddle bar
 * every three quarters of a metre up.
 */
const faceMats = new WeakMap<ModelKit, THREE.MeshStandardMaterial>();
function glassFace(k: ModelKit) {
  let m = faceMats.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: 0x000000, roughness: 0.06, metalness: 0, envMap: studioEnv(), envMapIntensity: 0.4,
      transparent: true, depthWrite: false, premultipliedAlpha: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    addPatch(m, { key: 'glass-face', apply: (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vPane;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPane = position.xy;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vPane;')
        .replace('#include <opaque_fragment>', `{
          // (The cames' and bars' distances in metres, antialiased over the pixel.)
          vec2 q = vec2(vPane.x / 0.25, vPane.y / 0.4);
          float came = (0.5 - max(abs(fract(q.x + q.y) - 0.5), abs(fract(q.x - q.y) - 0.5))) / length(vec2(4.0, 2.5));
          float bar = abs(fract(vPane.y / 0.75 + 0.5) - 0.5) * 0.75, fw = max(fwidth(vPane.x), fwidth(vPane.y));
          float lead = max(1.0 - smoothstep(0.007, 0.007 + fw, came), 1.0 - smoothstep(0.012, 0.012 + fw, bar));
          float fres = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 5.0);
          outgoingLight = mix(outgoingLight + vec3(0.006, 0.016, 0.04), vec3(0.03, 0.03, 0.035) + outgoingLight * 0.4, lead);
          diffuseColor.a = max(lead, fres * 0.85);
        }
        #include <opaque_fragment>`);
    } });
    m.userData.cloth = true;
    m.userData.decal = true;
    m.userData.baseEmissive = new THREE.Color(0);
    m.userData.baseIntensity = 1;
    faceMats.set(k, m);
    k.mats.push(m);
  }
  return m;
}

/** The lit room behind a glazed window: its light is laid into its colours (see litRoom). */
const roomBoxMats = new WeakMap<ModelKit, THREE.MeshBasicMaterial>();
function roomBoxMat(k: ModelKit) {
  let m = roomBoxMats.get(k);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ vertexColors: true });
    m.userData.decal = true;
    roomBoxMats.set(k, m);
  }
  return m;
}

/** A glazed window's room: `w` wide and `d` deep behind its wall, its floor `floor` under the sill and its ceiling `ceil` over the opening's apex. */
export interface WindowRoom {
  w: number;
  d: number;
  floor: number;
  ceil: number;
}

/**
 * The room seen through a glazed window (see glazedWindow), built in the window's frame (x across, y
 * up from the sill, z out of the wall's face, the wall `T` thick, the opening `h` high): a plastered
 * chamber behind the wall, a boarded floor and a dark ceiling, a crimson tapestry hung on its back wall
 * over a trestle table with a lit candle on it, a rug under the table and a chest against one wall.
 * Its light is laid into it as it is built: every surface lit warm by the candle and falling off with
 * the distance, a little cool daylight from the window on what faces it, the corners dim, so it needs
 * no light of its own in the scene.
 */
function litRoom(h: number, T: number, r: WindowRoom) {
  const P: number[] = [], Cl: number[] = [];
  const x0 = -r.w / 2, x1 = r.w / 2, y0 = -r.floor, y1 = h + r.ceil, z0 = -T - r.d, z1 = -T;
  const tz = z0 + Math.min(0.5, r.d * 0.4), flame = new THREE.Vector3(0.18, y0 + 0.96, tz);
  type C3 = [number, number, number];
  const pv = new THREE.Vector3(), nv = new THREE.Vector3(), lv = new THREE.Vector3();
  /** A surface's light at a point: the candle's warmth, the window's cool daylight, a dim fill. */
  const lit = (p: THREE.Vector3, n: THREE.Vector3, a: C3): C3 => {
    const d = lv.subVectors(flame, p).length(), warm = (3.0 * Math.max(0, n.dot(lv) / Math.max(1e-4, d))) / (1 + (d / 0.7) ** 2);
    const day = (Math.max(0, n.z) * 0.12) / (1 + (z1 - p.z) ** 2);
    return [a[0] * (0.04 + warm + day * 0.8), a[1] * (0.035 + warm * 0.6 + day * 0.9), a[2] * (0.04 + warm * 0.28 + day)];
  };
  /** A flat face from corner `a` along `u` and `v` (its front where u × v points), cut into cells about a fifth of a metre across so its light falls off smoothly; `glow` lights itself. */
  const face = (a: C3, u: C3, v: C3, col: C3, glow = false) => {
    const lu = Math.hypot(...u), lv2 = Math.hypot(...v), nu = Math.max(1, Math.ceil(lu / 0.2)), nw = Math.max(1, Math.ceil(lv2 / 0.2));
    nv.set(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]).normalize();
    const at = (i: number, j: number): C3 => [a[0] + (u[0] * i) / nu + (v[0] * j) / nw, a[1] + (u[1] * i) / nu + (v[1] * j) / nw, a[2] + (u[2] * i) / nu + (v[2] * j) / nw];
    for (let i = 0; i < nu; i++) for (let j = 0; j < nw; j++) {
      const q = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      for (const t of [0, 1, 2, 0, 2, 3]) {
        P.push(...q[t]);
        Cl.push(...(glow ? col : lit(pv.set(...q[t]), nv, col)));
      }
    }
  };
  /** A box from `lo` to `hi`, every face out. */
  const box = (lo: C3, hi: C3, col: C3, glow = false) => {
    const [ax, ay, az] = lo, [bx, by, bz] = hi, dx = bx - ax, dy = by - ay, dz = bz - az;
    face([ax, ay, bz], [dx, 0, 0], [0, dy, 0], col, glow);
    face([bx, ay, az], [-dx, 0, 0], [0, dy, 0], col, glow);
    face([bx, ay, bz], [0, 0, -dz], [0, dy, 0], col, glow);
    face([ax, ay, az], [0, 0, dz], [0, dy, 0], col, glow);
    face([ax, by, bz], [dx, 0, 0], [0, 0, -dz], col, glow);
    face([ax, ay, az], [dx, 0, 0], [0, 0, dz], col, glow);
  };
  const PLASTER_IN: C3 = [0.5, 0.43, 0.33], OAK: C3 = [0.22, 0.13, 0.07], CRIMSON: C3 = [0.34, 0.045, 0.04], GOLD: C3 = [0.62, 0.42, 0.12];
  // The chamber: back wall, side walls, ceiling, and a floor of boards running back from the window.
  face([x0, y0, z0], [r.w, 0, 0], [0, y1 - y0, 0], PLASTER_IN);
  face([x0, y0, z1], [0, 0, z0 - z1], [0, y1 - y0, 0], PLASTER_IN);
  face([x1, y0, z0], [0, 0, z1 - z0], [0, y1 - y0, 0], PLASTER_IN);
  face([x0, y1, z0], [r.w, 0, 0], [0, 0, z1 - z0], [0.09, 0.06, 0.04]);
  const boards = Math.max(1, Math.round(r.w / 0.22));
  for (let i = 0; i < boards; i++) {
    const tone = 0.85 + 0.3 * hash01(i, r.w);
    face([x0 + (i * r.w) / boards, y0, z1], [r.w / boards, 0, 0], [0, 0, z0 - z1], [OAK[0] * tone, OAK[1] * tone, OAK[2] * tone]);
  }
  // The tapestry on the back wall on its rod: a gold border round a crimson field and a gold lozenge.
  const ty = y0 + 1.0, tw = Math.min(1.1, r.w * 0.45), th = Math.min(1.45, y1 - ty - 0.25);
  box([-tw / 2, ty, z0], [tw / 2, ty + th, z0 + 0.02], GOLD);
  box([-tw / 2 + 0.07, ty + 0.07, z0 + 0.02], [tw / 2 - 0.07, ty + th - 0.07, z0 + 0.035], CRIMSON);
  box([-0.12, ty + th / 2 - 0.16, z0 + 0.035], [0.12, ty + th / 2 + 0.16, z0 + 0.045], GOLD);
  box([-tw / 2 - 0.08, ty + th, z0], [tw / 2 + 0.08, ty + th + 0.05, z0 + 0.06], [0.12, 0.07, 0.04]);
  // The rug, the trestle table on it, and the candle in its holder (its flame lights the room).
  box([-0.75, y0, tz - 0.42], [0.75, y0 + 0.012, tz + 0.48], GOLD);
  box([-0.68, y0, tz - 0.35], [0.68, y0 + 0.018, tz + 0.41], CRIMSON);
  box([-0.55, y0 + 0.72, tz - 0.26], [0.55, y0 + 0.78, tz + 0.26], OAK);
  for (const sx of [-1, 1]) box([sx * 0.42 - 0.04, y0, tz - 0.2], [sx * 0.42 + 0.04, y0 + 0.72, tz + 0.2], OAK);
  box([flame.x - 0.05, y0 + 0.78, tz - 0.05], [flame.x + 0.05, y0 + 0.8, tz + 0.05], GOLD);
  box([flame.x - 0.025, y0 + 0.8, tz - 0.025], [flame.x + 0.025, y0 + 0.93, tz + 0.025], [0.9, 0.82, 0.62], true);
  box([flame.x - 0.016, y0 + 0.93, tz - 0.016], [flame.x + 0.016, y0 + 1.0, tz + 0.016], [3.2, 2.1, 0.8], true);
  // A chest against the left wall.
  box([x0, y0, z0 + 0.15], [x0 + 0.42, y0 + 0.46, z0 + 0.8], [0.18, 0.1, 0.05]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(Cl, 3));
  geo.computeVertexNormals();
  return geo;
}

/** A box in a prop's space. */
export interface Span {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

/** A glazed window: the opening `w` wide, its pointed head's apex `h` over the sill, through a wall `T` thick built in the stone `stone`; `room` behind it where the building has no room of its own there. */
export interface WindowSpec {
  w: number;
  h: number;
  T: number;
  stone: number;
  room?: WindowRoom;
}

/**
 * The castle's window, built as a real window (the owner, October 3: "windows to be windows, see
 * through, blue tint"; every earlier pass painted a room on a plate, which read as a niche or a
 * corridor): a real opening through the wall's whole thickness, so its reveal shows how thick the wall
 * is, framed by a dressed ring of the castle's stone round its pointed head and down its jambs on the
 * walling's courses, with a projecting sill; set back in the reveal, the leaded glass with its cool blue
 * tint (glassTint, glassFace); and behind it, where the building has no room of its own there, a small
 * lit chamber (litRoom), so what shows through the glass is real depth seen in parallax. Built on a face
 * at z (facing +Z), its sill at (x, y). The opening's head is filled with the wall's stone down to the
 * arch; the caller lays its walling round the opening and the chamber's cavity, both returned as boxes
 * in its space (see `carved`).
 */
export function glazedWindow(k: ModelKit, g: THREE.Object3D, x: number, y: number, z: number, o: WindowSpec) {
  const { w, h, T } = o;
  k.mesh(g, spandrels(w, h, T), o.stone, [x, y, z - T / 2]);
  archRing(k, g, x, y, z, w, h, { n: 3, t: 0.3, p: 0.1, dep: 0.14, jamb: true });
  // The sill stone runs in under the glass, a hair proud of the reveal's floor behind it.
  cb(k, g, [w + 0.5, 0.14, 0.43], [x, y - 0.07, z + 0.005], DRESS, undefined, 0.02);
  // The glass set back in the reveal behind the ring: the tint, and over it the face.
  for (const [mat, order, back] of [[glassTint(k), 1, 0.2], [glassFace(k), 2, 0.197]] as const) {
    const pane = new THREE.Mesh(archPane(w, h, 0.004), mat);
    pane.name = 'glass';
    pane.renderOrder = order;
    pane.position.set(x, y, z - back);
    g.add(pane);
  }
  const hole: Span = { x0: x - w / 2, x1: x + w / 2, y0: y - 0.006, y1: y + h, z0: z - T, z1: z + 0.01 };
  if (!o.room) return { hole, cavity: null };
  const r = o.room, room = new THREE.Mesh(litRoom(h, T, r), roomBoxMat(k));
  room.name = 'room';
  room.position.set(x, y, z);
  g.add(room);
  // (The cavity a hair larger than the chamber all round, so their faces never lie in one plane.)
  const cavity: Span = { x0: x - r.w / 2 - 0.01, x1: x + r.w / 2 + 0.01, y0: y - r.floor - 0.01, y1: y + h + r.ceil + 0.01, z0: z - T - r.d - 0.01, z1: z - T };
  return { hole, cavity };
}

/**
 * A block of walling `size` big, centred at `pos`, with `voids` left open in it (a glazed window's
 * opening and the chamber behind it), built as the boxes that fill it round them. Every box is laid as
 * part of the block's whole face (masonLayout reads `face`), so the courses and the bond run on round
 * the opening unbroken, and the boxes meet each other square.
 */
export function carved(k: ModelKit, g: THREE.Object3D, size: V3, pos: V3, color: number, voids: (Span | null)[]) {
  type B = [number, number, number, number, number, number];
  const lo = [0, 1, 2].map((i) => pos[i] - size[i] / 2), hi = [0, 1, 2].map((i) => pos[i] + size[i] / 2);
  /** A box less a void: the slabs under and over it, then beside it, then before and behind it. */
  const minus = (b: B, v: Span): B[] => {
    const [x0, y0, z0, x1, y1, z1] = b;
    if (v.x0 >= x1 || v.x1 <= x0 || v.y0 >= y1 || v.y1 <= y0 || v.z0 >= z1 || v.z1 <= z0) return [b];
    const vx0 = Math.max(x0, v.x0), vx1 = Math.min(x1, v.x1), vy0 = Math.max(y0, v.y0), vy1 = Math.min(y1, v.y1), vz0 = Math.max(z0, v.z0), vz1 = Math.min(z1, v.z1);
    const out: B[] = [[x0, y0, z0, x1, vy0, z1], [x0, vy1, z0, x1, y1, z1], [x0, vy0, z0, vx0, vy1, z1], [vx1, vy0, z0, x1, vy1, z1], [vx0, vy0, z0, vx1, vy1, vz0], [vx0, vy0, vz1, vx1, vy1, z1]];
    return out.filter((q) => q[3] - q[0] > 1e-4 && q[4] - q[1] > 1e-4 && q[5] - q[2] > 1e-4);
  };
  let boxes: B[] = [[lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]]];
  for (const v of voids) if (v) boxes = boxes.flatMap((b) => minus(b, v));
  const face = { x0: lo[0], x1: hi[0], z0: lo[2], z1: hi[2] };
  for (const [x0, y0, z0, x1, y1, z1] of boxes) k.box(g, [x1 - x0, y1 - y0, z1 - z0], [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], color).userData.face = face;
}

/**
 * Quoins standing proud at a block of walling's outside corners (the owner, October 3: where a wall's
 * outline shows its stones, they are real stones). The block's whole face is `b` in its prop's space
 * (as masonLayout lays it); at each corner in `corners` ([±1, ±1]: toward ±X and ±Z), every course
 * between y0 and y1 (less the bands in `skip`) gets the stone that turns it in the walling's own bond,
 * long on one face and short on the other by turns, as a real chamfered block standing a few
 * centimetres proud of both faces, so the corner's outline shows each stone.
 */
export function quoins(k: ModelKit, g: THREE.Object3D, b: { x0: number; x1: number; z0: number; z1: number }, corners: [number, number][], y0: number, y1: number, color: number, skip: [number, number][] = []) {
  const half = (w: number) => Math.max(1, Math.round((2 * w) / STONE_LEN)) / 2, PROUD = 0.03;
  const nx = half(b.x1 - b.x0), nz = half(b.z1 - b.z0), lx = (b.x1 - b.x0) / nx, lz = (b.z1 - b.z0) / nz, ph = bondPhases(nx, nz);
  // How long the stone is from a face's end back to its last joint, or from its start to its first.
  const ends = (s: number) => s - Math.floor(s - 1e-6), starts = (s: number) => Math.ceil(s + 1e-6) - s;
  for (let row = Math.round(y0 / COURSE); (row + 1) * COURSE <= y1 + 1e-6; row++) {
    const ya = row * COURSE, par = row % 2 ? 0.5 : 0;
    if (skip.some(([a, e]) => ya < e - 1e-6 && ya + COURSE > a + 1e-6)) continue;
    for (const [sx, sz] of corners) {
      // (The faces toward ±Z run their stones along X, those toward ±X along Z: see masonGeometry.)
      const sX = sz > 0 ? (sx > 0 ? ends(ph.pz + nx + par) : starts(ph.pz + par)) : sx > 0 ? starts(ph.mz + par) : ends(ph.mz + nx + par);
      const sZ = sx > 0 ? (sz > 0 ? starts(ph.px + par) : ends(ph.px + nz + par)) : sz > 0 ? ends(ph.mx + nz + par) : starts(ph.mx + par);
      const ax = sX * lx + PROUD, az = sZ * lz + PROUD, cx = sx > 0 ? b.x1 : b.x0, cz = sz > 0 ? b.z1 : b.z0;
      cb(k, g, [ax, COURSE, az], [cx + sx * (PROUD - ax / 2), ya + COURSE / 2, cz + sz * (PROUD - az / 2)], color, undefined, 0.03);
    }
  }
}

/**
 * The castle's lamp post: a stepped stone base, a navy-lacquered post with a gold collar, a lantern
 * of warm glass in a navy cage under a little hipped hood, a gold ball finial on top.
 */
function royalLamp(k: ModelKit, g: THREE.Object3D) {
  cb(k, g, [0.46, 0.22, 0.46], [0, 0.11, 0], BASE, undefined, 0.05);
  cb(k, g, [0.32, 0.2, 0.32], [0, 0.3, 0], DRESS, undefined, 0.04);
  k.cyl(g, 0.06, 0.08, 2.2, [0, 1.5, 0], LAMP_NAVY, undefined, 8);
  k.cyl(g, 0.1, 0.1, 0.08, [0, 2.42, 0], PAL.gold, undefined, 8);
  cb(k, g, [0.42, 0.06, 0.42], [0, 2.49, 0], LAMP_NAVY, undefined, 0.02);
  k.box(g, [0.32, 0.4, 0.32], [0, 2.72, 0], 0xffcf86, undefined, 0xffa038, 1.45);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(g, [0.05, 0.44, 0.05], [dx * 0.17, 2.72, dz * 0.17], LAMP_NAVY);
  k.mesh(g, taper(0.5, 0.5, 0.1, 0.1, 0.22), LAMP_NAVY, [0, 3.04, 0]);
  k.mesh(g, new THREE.OctahedronGeometry(0.08, 1), PAL.gold, [0, 3.22, 0]);
}

/** A wall lantern on a face (facing +Z) at x, its lamp at y: a navy bracket, a warm lantern and a gold finial. */
function wallLamp(k: ModelKit, g: THREE.Object3D, x: number, y: number, z: number) {
  cb(k, g, [0.2, 0.3, 0.08], [x, y + 0.3, z + 0.04], LAMP_NAVY, undefined, 0.01);
  cb(k, g, [0.07, 0.07, 0.42], [x, y + 0.4, z + 0.25], LAMP_NAVY, undefined, 0.01);
  k.box(g, [0.24, 0.32, 0.24], [x, y, z + 0.46], 0xffcf86, undefined, 0xffa038, 1.4);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(g, [0.04, 0.36, 0.04], [x + dx * 0.13, y, z + 0.46 + dz * 0.13], LAMP_NAVY);
  k.mesh(g, taper(0.36, 0.36, 0.08, 0.08, 0.16), LAMP_NAVY, [x, y + 0.24, z + 0.46]);
  k.mesh(g, new THREE.OctahedronGeometry(0.06, 1), PAL.gold, [x, y + 0.38, z + 0.46]);
}

/** The hero stands about 2.1 tall in his helm (feet to crown): every door and its handle is sized to him. */
export const HERO_HEIGHT = 2.1;

/**
 * The castle's doors by purpose, one size for each purpose (`w` × `h` is one leaf: its width, and its
 * height to the point of its pointed head, or to the lintel under a gate's tympanum):
 * - `building`: every building's doorway, a pair of leaves meeting under a pointed arch 2 wide;
 * - `single`: one leaf under a pointed arch, the door of a tower onto its wall walk, of a stair tower
 *   and of the roof houses onto the leads;
 * - `wide_gate` / `narrow_gate`: the pair of leaves of a gate (4 or 2 wide), each nearly half the
 *   opening, standing half open in its passage under the tympanum;
 * - `great`: the great door of the hall.
 * Every leaf carries a ring handle at the hero's hand (`handle` over the sill). `walk` is where a
 * tower's doorway opens onto the curtain's wall walk: the walk's height and its middle's offset from
 * the wall's centre line toward the bailey.
 */
export const DOORS = {
  building: { w: 0.91, h: 3.91, rise: 1.24 },
  single: { w: 1.3, h: 3.0 },
  wide_gate: { w: 1.88, h: 3.3 },
  narrow_gate: { w: 1.0, h: 2.9 },
  great: { w: 1.88, h: 3.7 },
  handle: 1.05,
  walk: { y: CURTAIN_WALL.walkY, off: CURTAIN_WALL.walkOff },
} as const;

/** Mark a mesh for the geometry audit (what it is, and the facts a rule needs). */
export function audit<T extends THREE.Object3D>(m: T, part: string, info?: Record<string, unknown>): T {
  m.userData.part = part;
  if (info) m.userData.audit = info;
  return m;
}

/**
 * The outline of a door leaf filling a pointed doorway `W` wide whose apex stands `h` above its sill,
 * the arch rising `rise` over its springing: `part` 0 the whole opening (one leaf), -1 / 1 its left or
 * right half (a pair, meeting on the centre line). Built across X, up Y from the sill, `dep` thick
 * and centred on z = 0.
 */
const leafCache = new Map<string, THREE.BufferGeometry>();
export function pointedLeaf(W: number, h: number, rise: number, part: -1 | 0 | 1, dep = 0.1) {
  const key = `${W},${h},${rise},${part},${dep}`;
  let g = leafCache.get(key);
  if (g) return g;
  const { arc } = pointedArch(W, h, 10, rise), hw = W / 2;
  const s = new THREE.Shape();
  if (part === 0) {
    s.moveTo(-hw, 0);
    s.lineTo(hw, 0);
    for (const [x, y] of arc) s.lineTo(x, y);
    for (let i = arc.length - 2; i >= 0; i--) s.lineTo(-arc[i][0], arc[i][1]);
  } else {
    // From the foot of the centre line out along the sill, up the jamb, round the arc to the apex.
    s.moveTo(0, 0);
    s.lineTo(part * hw, 0);
    for (const [x, y] of arc) s.lineTo(part * x, y);
  }
  s.closePath();
  g = new THREE.ExtrudeGeometry(s, { depth: dep, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -dep / 2);
  g.computeVertexNormals();
  leafCache.set(key, g);
  return g;
}

/** The height of a pointed doorway's outline at `x` across it (see pointedLeaf). */
export function archHeight(W: number, h: number, rise: number, x: number) {
  const { arc, ys } = pointedArch(W, h, 24, rise), ax = Math.abs(x);
  if (ax >= W / 2) return ys;
  for (let i = 0; i < arc.length - 1; i++) if (ax <= arc[i][0] && ax >= arc[i + 1][0]) {
    const t = (arc[i][0] - ax) / (arc[i][0] - arc[i + 1][0] || 1);
    return arc[i][1] + (arc[i + 1][1] - arc[i][1]) * t;
  }
  return h;
}

/**
 * The pointed arch `d` inside a pointed opening `W` wide with its apex `h` up and its arch rising
 * `rise` (the same centres, each arc `d` shorter): the outline of leaves hung in the opening with a
 * gap `d` round them to the stone.
 */
export function archInset(W: number, h: number, rise: number, d: number) {
  const { c, R, ys } = pointedArch(W, h, 2, rise), r2 = Math.sqrt(Math.max(0, (R - d) ** 2 - c * c));
  return { w: W - 2 * d, h: ys + r2, rise: r2 };
}

/** A black iron ring handle on its back plate, on a door's face at (x, y, z) (facing +Z). */
export function ringHandle(k: ModelKit, g: THREE.Object3D, x: number, y: number, z: number) {
  audit(cb(k, g, [0.1, 0.16, 0.03], [x, y + 0.05, z + 0.015], IRON, undefined, 0.01), 'handle');
  audit(k.mesh(g, new THREE.TorusGeometry(0.075, 0.018, 5, 12), IRON, [x, y - 0.02, z + 0.04]), 'handle');
}

/**
 * The castle's door wood: oak boards stained in the lord's blue and weathered, each board a shade
 * apart, and the dark seen in the joints between them (the leaf's core).
 */
export const DOOR_STAIN = [0x32496f, 0x3a5079, 0x2c4163], DOOR_CORE = 0x121926;
paintAs('grain', DOOR_STAIN);
/** How thick a door's boards stand on its core, and how wide a joint between two boards. */
const BOARD_T = 0.03, BOARD_GAP = 0.024;

/** One upright board from bx0 to bx1, its foot on the sill, its head cut to `top`, `t` thick on z = 0..t. */
const boardCache = new Map<string, THREE.BufferGeometry>();
function boardGeo(key: string, bx0: number, bx1: number, top: (x: number) => number, t: number) {
  const k = `${key},${bx0.toFixed(3)},${bx1.toFixed(3)},${t}`;
  let g = boardCache.get(k);
  if (g) return g;
  const s = new THREE.Shape(), m = 4;
  s.moveTo(bx0, 0.02);
  s.lineTo(bx1, 0.02);
  for (let j = 0; j <= m; j++) {
    const x = bx1 - ((bx1 - bx0) * j) / m;
    s.lineTo(x, top(x));
  }
  s.closePath();
  g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 1 });
  g.computeVertexNormals();
  boardCache.set(k, g);
  return g;
}

/**
 * A boarded leaf from x0 to x1 (built across X, up Y from the sill at y = 0, centred on z = 0), its
 * head at `top(x)`: the dark core `dep` thick (the leaf the audit measures, `core` its outline),
 * faced on both sides with upright boards about a quarter wide, cut to the head a little inside its
 * edge and set a joint apart so the dark shows between them, each board its own shade of the stained
 * oak; on both faces black iron strap hinges running from the hinge edge most of the way across,
 * nailed with studs and ending in a point; and a ring handle at the hero's hand by the latch edge.
 */
function boardedLeaf(k: ModelKit, g: THREE.Object3D, o: { key: string; core: THREE.BufferGeometry; corePos: V3; x0: number; x1: number; top: (x: number) => number; dep: number; cls: keyof typeof DOORS; hinge: -1 | 1; latch: number; spring: number }) {
  const { x0, x1, top, dep, hinge } = o, w = x1 - x0;
  audit(k.mesh(g, o.core, DOOR_CORE, o.corePos), 'door-leaf', { cls: o.cls });
  const n = Math.max(3, Math.round(w / 0.27)), bw = w / n, inset = 0.012;
  const head = (x: number) => top(Math.min(x1 - inset, Math.max(x0 + inset, x))) - inset * 1.5;
  for (let i = 0; i < n; i++) {
    const bx0 = x0 + i * bw + (i ? BOARD_GAP / 2 : inset), bx1 = x0 + (i + 1) * bw - (i < n - 1 ? BOARD_GAP / 2 : inset);
    const geo = boardGeo(o.key, bx0, bx1, head, BOARD_T), tone = DOOR_STAIN[(i * 2 + (o.hinge > 0 ? 1 : 0)) % 3];
    for (const e of [-1, 1]) audit(k.mesh(g, geo, tone, [0, 0, e > 0 ? dep / 2 - 0.004 : -dep / 2 + 0.004 - BOARD_T]), 'door-board');
  }
  // The straps: one low, one under the springing of the head, and one between on a tall leaf.
  const lo = 0.42, hi = o.spring - 0.32, levels = hi - lo > 1.7 ? [lo, (lo + hi) / 2, hi] : [lo, hi];
  const face = dep / 2 + BOARD_T - 0.004, len = w * 0.8, from = hinge < 0 ? x0 : x1;
  for (const e of [-1, 1]) {
    const f = new THREE.Group();
    f.rotation.y = e > 0 ? 0 : Math.PI;
    g.add(f);
    for (const y of levels) {
      // (Tapering toward its point: a broad strap at the hinge, a narrower run, a diamond tip.)
      const mid = from - hinge * len / 2;
      k.box(f, [len, 0.09, 0.02], [e * mid, y, face + 0.01], IRON);
      k.box(f, [0.13, 0.13, 0.02], [e * (from - hinge * (len + 0.03)), y, face + 0.01], IRON, [0, 0, Math.PI / 4]);
      for (let sx = 0.08; sx < len - 0.02; sx += 0.2) k.box(f, [0.045, 0.045, 0.02], [e * (from - hinge * sx), y, face + 0.028], IRON);
    }
    ringHandle(k, f, e * o.latch, DOORS.handle, face);
  }
}

/**
 * The leaves closing a pointed doorway `W` wide, apex `h` over the sill (on z = 0, facing +Z, the sill
 * at y = 0): one leaf, or a pair meeting on the centre line, each boarded in the stained oak to the
 * shape of the arch, strapped in iron, with a ring handle at the hero's hand (boardedLeaf), so the
 * doorway reads as a tall wooden door from either side.
 */
export function pointedDoor(k: ModelKit, g: THREE.Object3D, W: number, h: number, rise: number, cls: keyof typeof DOORS, pair: boolean, dep = 0.1) {
  const parts: (-1 | 0 | 1)[] = pair ? [-1, 1] : [0], spring = h - rise;
  for (const part of parts) {
    const x0 = part === 1 ? 0 : -W / 2, x1 = part === -1 ? 0 : W / 2;
    boardedLeaf(k, g, {
      key: `p${W},${h},${rise}`, core: pointedLeaf(W, h, rise, part, dep), corePos: [0, 0, 0], x0, x1,
      top: (x) => archHeight(W, h, rise, x), dep, cls, hinge: part === 1 ? 1 : -1,
      // (The handle by the meeting stiles, by the latch edge on a single leaf.)
      latch: part === 0 ? W / 2 - 0.22 : part * 0.2, spring,
    });
  }
}

/**
 * One leaf of a gate, `w` wide and `h` tall, hinged on its left edge at the origin and standing along
 * +X (facing +Z): boarded in the stained oak and strapped in iron like every castle door, a ring
 * handle at the hero's hand on each face, so an open leaf reads from either side.
 */
export function royalLeaf(k: ModelKit, g: THREE.Object3D, w: number, h: number, cls: keyof typeof DOORS, dep = 0.1) {
  boardedLeaf(k, g, {
    key: `r${w},${h}`, core: chamferBox(w, h, dep, 0.02), corePos: [w / 2, h / 2, 0], x0: 0, x1: w,
    top: () => h, dep, cls, hinge: -1, latch: w - 0.22, spring: h,
  });
}

/**
 * A stretch of wall `L` long and `H` high with a pointed arch `P` wide cut through it (its apex `h`
 * over the ground, its arch rising `rise` over the springing): one solid, built along X, up Y from
 * the ground and `dep` thick about z = 0, so the stone runs round the opening with no seam.
 */
const archedCache = new Map<string, THREE.BufferGeometry>();
export function archedWall(L: number, H: number, P: number, h: number, rise: number, dep: number) {
  const key = `${L},${H},${P},${h},${rise},${dep}`;
  let g = archedCache.get(key);
  if (g) return g;
  const { arc } = pointedArch(P, h, 12, rise), s = new THREE.Shape();
  s.moveTo(-L / 2, 0);
  s.lineTo(-P / 2, 0);
  for (let i = 0; i < arc.length; i++) s.lineTo(-arc[i][0], arc[i][1]);
  for (let i = arc.length - 2; i >= 0; i--) s.lineTo(arc[i][0], arc[i][1]);
  s.lineTo(P / 2, 0);
  s.lineTo(L / 2, 0);
  s.lineTo(L / 2, H);
  s.lineTo(-L / 2, H);
  s.closePath();
  g = new THREE.ExtrudeGeometry(s, { depth: dep, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -dep / 2);
  g.computeVertexNormals();
  // (For the geometry audit: its two sides and the head over the apex.)
  g.userData.boxes = [[-L / 2, 0, -dep / 2, -P / 2, H, dep / 2], [P / 2, 0, -dep / 2, L / 2, H, dep / 2], [-P / 2, h, -dep / 2, P / 2, H, dep / 2]];
  archedCache.set(key, g);
  return g;
}

/**
 * A gate through a stretch of full-height curtain (built along local X, outer face toward -Z like
 * the curtain): the passage `P` wide under a pointed arch, dressed voussoirs and a hood mould on both
 * faces, pale jambs, the wall walk carried over it. Options: `door` hangs two blue leaves just inside
 * the arch on that face (-1 outer, 1 inner), swung open against the passage's sides, `steps` lays a stone stoop out from the outer face, `head` raises a crenellated
 * head over the gate with the lord's crest on its inner face, `lanterns` hangs a lantern either side
 * of the arch on the faces listed (-1 outer, 1 inner).
 */
/**
 * The feet of the curtain's string course and of the course under its wall walk: on both its faces,
 * round every tower and across its gates, so the lines run on unbroken (each one course of the
 * castle's dressed stone, on the course lines).
 */
export const CURTAIN_COURSES = [3.5, 6.5];
/** The heights of a tower's two rows of arrow loops, one in each storey between its courses. */
const LOOP_ROWS = [5.25, 9.0];
/**
 * The feet of the courses that run round the castle's buildings and the great door's pavilions: the
 * floor line (BUILDING_FLOOR_LINE) and the course under the hall's parapet, so where a pavilion stands
 * against the hall its lines run on into the hall's.
 */
export const BUILDING_FLOOR_LINE = 5.0;
const PAVILION_COURSES = [BUILDING_FLOOR_LINE, 8.5];

/** Mark a part as paving: laid on its top in the castle paving's own rows (a third of a metre deep) of stones two thirds long. */
export function paved<T extends THREE.Object3D>(m: T): T {
  m.userData.course = 1 / 3;
  m.userData.stone = 2 / 3;
  return m;
}

/**
 * The curtain's crown along local X (outer face toward -Z), `L` long, its inner side `LL` long centred
 * on `uc` (it runs on into a tower's drum): on the outer face a course standing a hand proud under the
 * parapet and the parapet flush on it; on the inner face the parapet carried out over the bailey on two
 * courses stepping out from the wall (a corbelled crown cut from the same stone, no corbel blocks); the
 * walk's deck between them, a coping on each parapet and merlons spread evenly along both, `clear` in
 * from the ends. All in the castle's stone on the course lines over the wall's top.
 */
function curtainCrown(k: ModelKit, g: THREE.Object3D, L: number, LL: number, uc: number, clear: number) {
  const { T, H } = CURTAIN_WALL, fi = T / 2 + 0.85, cp = H + COURSE;
  k.box(g, [L, 0.06, fi - 0.56 + 0.52], [0, H + 0.03, (fi - 0.56 - 0.52) / 2], DECK);
  cb(k, g, [L, COURSE, 0.2], [0, H - COURSE / 2, -T / 2 + 0.02], DRESS, undefined, 0.02);
  cb(k, g, [L, COURSE, 0.68], [0, H + COURSE / 2, -T / 2 + 0.26], ASHLAR, undefined, 0.03);
  cb(k, g, [L, 0.12, 0.8], [0, cp + 0.06, -T / 2 + 0.26], DRESS, undefined, 0.02);
  cb(k, g, [LL, COURSE, 0.52], [uc, H - 1.5 * COURSE, T / 2 + 0.16], DRESS, undefined, 0.02);
  cb(k, g, [LL, COURSE, fi - T / 2 + 0.1], [uc, H - COURSE / 2, (fi + T / 2 - 0.1) / 2], DRESS, undefined, 0.02);
  cb(k, g, [LL, COURSE, 0.56], [uc, H + COURSE / 2, fi - 0.28], ASHLAR, undefined, 0.03);
  cb(k, g, [LL, 0.12, 0.66], [uc, cp + 0.06, fi - 0.28], DRESS, undefined, 0.02);
  for (const u of spread(L, 1.4, clear)) {
    const c = hash01(u, T) > 0.7 ? ASHLAR_L : ASHLAR;
    cb(k, g, [0.72, 0.6, 0.6], [u, cp + 0.42, -T / 2 + 0.3], c, undefined, 0.05);
    cb(k, g, [0.72, 0.56, 0.54], [u, cp + 0.4, fi - 0.28], c, undefined, 0.05);
  }
}

function gateway(k: ModelKit, g: THREE.Object3D, P: number, opt: { door?: number; steps?: boolean; lanterns?: number[] }) {
  // (The leaves stand to the lintel at the springing, under the tympanum: a gate's leaves tower over
  // the hero.)
  const cls = P >= 3 ? 'wide_gate' : 'narrow_gate', L = P + 2.4, T = 2.2, H = 7, S = DOORS[cls].h + 0.1, rise = P >= 3 ? 1.9 : 1.25, apex = S + rise;
  // The curtain's own deep base course runs on round the gate's sides, so the wall meets its gate with
  // no step. (It runs a hair into the passage, so its end never lies in the plane of the opening's side.)
  for (const sx of [-1, 1]) deep(cb(k, g, [(L - P) / 2 + 0.02, BASE_COURSE, T + 0.5], [sx * (P / 2 + (L - P) / 4), BASE_COURSE / 2, 0], BASE, undefined, 0.06));
  // The gate's wall in one piece: the curtain's full height, the pointed arch cut through it.
  k.mesh(g, archedWall(L, H, P, apex, rise, T), ASHLAR, [0, 0, 0]);
  // The ring of dressed voussoirs round the arch and down its jambs on both faces, its stones bedded on
  // the walling's courses; the curtain's string course runs on across the gate, stopping against it.
  const ring = { w: P, h: apex, rise, t: 0.54, p: 0.06, dep: 0.3, out: -0.02, n: 5, kw: 0.6, foot: 0 };
  const { ys, c, R } = pointedArch(P, apex, 2, rise), y0 = CURTAIN_COURSES[0];
  const ringX = (y: number) => (y <= ys ? P / 2 + 0.52 : -c + Math.sqrt(Math.max(0, (R + 0.52) ** 2 - (y - ys) ** 2)));
  const gap = Math.max(ringX(y0), ringX(y0 + COURSE)) + 0.04;
  for (const sx of [-1, 1]) cb(k, g, [L / 2 - gap, COURSE, T + 0.12], [sx * (gap + (L / 2 - gap) / 2), y0 + COURSE / 2, 0], DRESS, undefined, 0.03);
  for (const e of [-1, 1]) {
    const f = new THREE.Group();
    f.rotation.y = e > 0 ? 0 : Math.PI;
    g.add(f);
    const z = T / 2;
    for (const st of dressedArch({ ...ring, seed: e + 2 })) k.mesh(f, st.geo, DRESS, [0, 0, z]);
    // The arch's head closed over a square opening, as at the gatehouse: a lintel across at the
    // springing (its top on a course line) and over it a tympanum, both of the dressed stone and set
    // back in the reveal (so from above they never read as a slab across the way), the leaves filling
    // the opening below and the arch framing the whole doorway.
    const lt = Math.ceil((S + 0.3) / COURSE - 1e-6) * COURSE;
    cb(k, f, [P + 0.06, lt - S + 0.05, 0.14], [0, (S - 0.05 + lt) / 2, z - 0.17], DRESS, undefined, 0.02);
    k.mesh(f, archTympanum(P, apex, 0.12, rise), DRESS, [0, 0, z - 0.3]);
    if (opt.lanterns?.includes(e)) for (const sx of [-1, 1]) wallLamp(k, f, sx * (P / 2 + 0.95), S - 0.6, z);
  }
  // The wall walk carried over the gate exactly as along the curtain.
  curtainCrown(k, g, L, L, 0, 0.8);
  // The leaves: the lord's blue planks, a pair hung in the passage just inside the arch on the face
  // the gate is approached from (`door`: -1 outer, 1 inner), each as wide as half the opening, swung
  // half open into the passage, so from either side the gate reads as a pair of doors standing open
  // in its opening. The passage is lined in the weathered stone, a deep reveal.
  if (opt.door) {
    const e = opt.door, lw = DOORS[cls].w, open = 0.95;
    for (const sx of [-1, 1]) {
      const leaf = new THREE.Group();
      leaf.position.set(sx * (P / 2 - 0.12), 0.05, e * (T / 2 - 0.22));
      leaf.rotation.y = sx < 0 ? e * open : Math.PI - e * open;
      g.add(leaf);
      royalLeaf(k, leaf, lw, S - 0.1, cls);
    }
    for (const sx of [-1, 1]) cb(k, g, [0.06, S - 0.05, T - 0.1], [sx * (P / 2 - 0.03), (S - 0.05) / 2, 0], BASE, undefined, 0.01);
  }
  if (opt.steps) for (let i = 0; i < 2; i++) cb(k, g, [P + 0.9 - i * 0.3, 0.16, 0.5], [0, 0.08 + i * 0.12, -T / 2 - 0.55 + i * 0.25], i ? DRESS : BASE, undefined, 0.02);
  // The passage floor: the castle's paving carried through the gate.
  paved(k.box(g, [P - 0.1, 0.04, T], [0, 0.02, 0], PAVE));
}

/** The layer a pool's mirror draws (the fountain's own dragon, rock and jets). */
const MIRROR_LAYER = 3;

const BUILDERS: Record<string, Builder> = {
  /**
   * A waterfall pouring down a stepped rock face (front = +Z, back against the cliff): three tiers
   * of big flat slabs, the water cutting a channel down their middle, a step pool on each ledge
   * and white churn where it lands in the river. About 5 wide, 3.5 deep, 4.3 high.
   */
  waterfall: (k, g) => {
    const time = { value: 0 };
    const ROCK = 0x7a6a5a, ROCK_D = 0x5e5246, ROCK_L = 0x8a7a68;
    // Tiers: [front z, height]; each tier's slab runs back to the cliff at z = -2.
    const tiers: [number, number][] = [[0.6, 1.3], [-0.5, 2.6], [-1.4, 4.0]];
    tiers.forEach(([fz, ht], i) => {
      const d = fz + 2.1;
      for (const sx of [-1, 1]) {
        // Cheeks either side of the channel, each split into two blocks of their own tone.
        slab(k, g, 400 + i * 4 + (sx > 0 ? 1 : 0), [1.9, ht + 0.5, d], [sx * 1.75, -0.3, fz - d / 2], i % 2 ? ROCK_D : ROCK, sx * 0.04);
        slab(k, g, 402 + i * 4 + (sx > 0 ? 1 : 0), [1.0, ht + 0.8, d * 0.75], [sx * 2.55, -0.3, fz - d * 0.55], ROCK_L, -sx * 0.06);
      }
      // The channel floor of this tier (lower than the cheeks: the water has worn it down).
      slab(k, g, 420 + i, [1.75, ht + 0.18, d], [0, -0.3, fz - d / 2], ROCK_D);
    });
    // Water: a sheet down the front of each tier, a pool on each ledge, the stream on the top.
    const lips = [[0.6, 1.18, -0.2], [-0.5, 2.48, 1.18], [-1.4, 3.88, 2.48]];
    lips.forEach(([fz, top, bot], i) => {
      const hh = top - bot + 0.1;
      const sheet = fallingWater(1.5 - i * 0.12, hh, time, 11 + i);
      sheet.position.set(0, (top + bot) / 2, fz + 0.06);
      g.add(sheet);
    });
    for (const [i, [z0, z1, y]] of [[-0.5, 0.55, 1.2], [-1.4, -0.55, 2.5], [-2.0, -1.45, 3.9]].entries()) {
      // Each ledge pool takes the sheet from the tier above at its back edge (the top pool is fed by the stream).
      const pool = poolWater(time, 0.9, i < 2 ? [[0, -(z1 - z0) / 2 + 0.12, 0.5]] : []);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.55, z1 - z0).rotateX(-Math.PI / 2), pool);
      p.position.set(0, y + 0.01, (z0 + z1) / 2);
      p.name = 'waterfall-pool';
      g.add(p);
    }
    // Churn where it lands: pale foam boulders that heave, and a soft white spread on the river.
    const foamMat = new THREE.MeshStandardMaterial({ color: 0xe8f4f4, roughness: 0.6, emissive: 0x3a5a60, flatShading: true });
    const foam: THREE.Mesh[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI - Math.PI, r = 0.5 + hash01(i, 9) * 0.6;
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 + hash01(i, 3) * 0.16, 0), foamMat);
      f.position.set(Math.cos(a) * r * 1.2, -0.2, 0.9 + Math.abs(Math.sin(a)) * r * 0.6);
      f.name = 'foam';
      g.add(f);
      foam.push(f);
    }
    const spread = new THREE.Mesh(softDisc(77, 1.9, [0.86, 0.95, 0.95], 0.55), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    spread.position.set(0, -0.22, 1.5);
    spread.name = 'foam-spread';
    spread.material.userData.decal = true;
    g.add(spread);
    return {
      obj: g,
      tick: (t) => {
        time.value = t;
        foam.forEach((f, i) => {
          const s = 0.8 + 0.3 * Math.sin(t * 3.1 + i * 1.7);
          f.scale.set(s, s * (0.8 + 0.2 * Math.sin(t * 4.3 + i)), s);
        });
      },
    };
  },
  // ─── Landmarks & world dressing ───────────────────────────────────────────
  /** Plank bridge along local +Z; `arg` = span length in cells. */
  bridge: (k, g, arg) => {
    const len = Math.max(4, arg ?? 6);
    const n = Math.round(len / 0.5);
    for (let i = 0; i < n; i++) {
      const z = -len / 2 + (i + 0.5) * (len / n);
      k.box(g, [2.4, 0.12, len / n - 0.04], [0, 0.02 + Math.sin((i / (n - 1)) * Math.PI) * 0.12, z], i % 3 ? PAL.wood : 0x5a3a20, [0, 0, (i % 2 - 0.5) * 0.02]);
    }
    for (const sx of [-1, 1]) {
      for (let i = 0; i <= Math.floor(len / 2); i++) {
        const z = -len / 2 + i * (len / Math.floor(len / 2));
        k.box(g, [0.14, 1.1, 0.14], [sx * 1.15, -0.1 + Math.sin(((z + len / 2) / len) * Math.PI) * 0.12, z], 0x4a3020);
      }
      k.box(g, [0.1, 0.1, len], [sx * 1.15, 0.72, 0], PAL.wood);
      for (const z of [-len / 2 + 0.3, len / 2 - 0.3]) k.box(g, [0.3, 1.4, 0.3], [sx * 1.1, -0.6, z], 0x3a2618);
    }
  },
  /** Basalt-slab bridge along local +Z (lava crossings); `arg` = span. */
  bridge_stone: (k, g, arg) => {
    const len = Math.max(4, arg ?? 6);
    const n = Math.round(len / 0.9);
    for (let i = 0; i < n; i++) {
      const z = -len / 2 + (i + 0.5) * (len / n);
      cb(k, g, [2.8, 0.35, q(len / n - 0.05)], [0, -0.1 + Math.sin((i / Math.max(1, n - 1)) * Math.PI) * 0.18, z], i % 2 ? 0x3a3232 : 0x2e2828);
    }
    for (const sx of [-1, 1]) {
      k.box(g, [0.35, 0.5, len], [sx * 1.4, 0.2, 0], 0x241e1e);
      for (const z of [-len / 2 + 0.4, 0, len / 2 - 0.4]) k.box(g, [0.6, 2, 0.6], [sx * 1.2, -0.9, z], 0x1e1818);
    }
  },
  tower_ruin: (k, g) => {
    // A square stone keep-tower: running-bond courses, a broken crenellated crown collapsing
    // toward the front-left corner, a door, and a rubble skirt sunk into the ground.
    const S = 4.0, th = 0.7, rowH = 0.62, rows = 11, y0 = -0.9, H = y0 + rows * rowH;
    const off = S / 2 - th / 2;
    // Plinth course (wider, darker) hides the ground seam on slopes.
    cb(k, g, [S + 0.4, 1.0, S + 0.4], [0, -0.35, 0], STONE_DD, undefined, 0.08);
    masonry(k, g, { x: 0, z: -off, rot: 0, len: S, y0, rows, rowH, thick: th, seed: 11 });
    masonry(k, g, { x: off, z: 0, rot: Math.PI / 2, len: S - 2 * th, y0, rows, rowH, thick: th, seed: 12 });
    masonry(k, g, {
      x: 0, z: off, rot: 0, len: S, y0, rows, rowH, thick: th, seed: 13,
      top: (u) => (u < -0.3 ? H - 2.6 - (-u - 0.3) * 1.3 : u < 0.6 ? H - 0.7 : H),
      hole: { u: 0.35, w: 1.1, h: 1.9 },
    });
    // Left wall: u runs from front (+z, u < 0) to back.
    masonry(k, g, { x: -off, z: 0, rot: Math.PI / 2, len: S - 2 * th, y0, rows, rowH, thick: th, seed: 14, top: (u) => H - Math.max(0, -u + 0.4) * 2.2 });
    // Merlons on the intact back and right walls.
    for (const u of [-1.55, -0.45, 0.65, 1.6]) {
      cb(k, g, [0.66, 0.55, th + 0.04], [u, H + 0.275, -off], hash01(u) > 0.5 ? STONE : STONE_L, undefined, 0.05);
      if (u > -1) cb(k, g, [th + 0.04, 0.55, 0.66], [off, H + 0.275, u - 0.1], STONE, undefined, 0.05);
    }
    // Door: dark doorway, planked door set back, a lintel stone above.
    k.box(g, [1.04, 1.9, 0.3], [0.35, 0.95, off + 0.05], DARK);
    cb(k, g, [0.92, 1.8, 0.1], [0.35, 0.9, off + 0.2], WOOD_D, undefined, 0.02);
    for (const y of [0.4, 1.4]) k.box(g, [0.96, 0.08, 0.04], [0.35, y, off + 0.26], IRON);
    cb(k, g, [1.6, 0.42, th + 0.1], [0.35, 2.12, off], STONE_D, undefined, 0.06);
    // Arrow slits.
    for (const [x, y, z, r] of [[1.2, 3.4, off + th / 2 + 0.01, 0], [-off - th / 2 - 0.01, 3.1, -0.9, Math.PI / 2], [off + th / 2 + 0.01, 3.9, 0.3, Math.PI / 2]] as [number, number, number, number][]) {
      k.box(g, [0.14, 0.7, 0.04], [x, y, z], DARK, [0, r, 0]);
    }
    // Inside: a dark floor, a half-fallen timber floor and a beam wedged across.
    k.box(g, [S - 2 * th, 0.1, S - 2 * th], [0, 0.05, 0], 0x3a342e);
    cb(k, g, [S - 2 * th, 0.14, 1.2], [0, 3.1, -0.7], WOOD, undefined, 0.02);
    for (const x of [-0.8, 0, 0.8]) k.box(g, [0.18, 0.18, S - 2 * th + 0.5], [x, 2.95, 0], WOOD_D, [x * 0.12, 0, 0]);
    cb(k, g, [0.24, 0.24, 2.9], [0.2, 1.5, 0.2], WOOD_D, [0.75, 0.5, 0], 0.03);
    // Banner on a pole jutting from the right wall.
    k.box(g, [0.9, 0.09, 0.09], [S / 2 + 0.45, H - 0.5, 0.9], WOOD_D);
    cb(k, g, [0.72, 1.3, 0.05], [S / 2 + 0.55, H - 1.2, 0.9], 0x8a2424, undefined, 0.01);
    for (const x of [-0.22, 0.22]) cb(k, g, [0.24, 0.3, 0.05], [S / 2 + 0.55 + x, H - 2.0, 0.9], 0x8a2424, undefined, 0.01);
    for (const e of [-1, 1]) k.box(g, [0.3, 0.3, 0.02], [S / 2 + 0.55, H - 1.1, 0.9 + e * 0.035], 0xd8b060, [0, 0, Math.PI / 4]);
    // Rubble skirt: heaviest under the collapsed corner, sunk so it never floats.
    const rubble: [number, number, number][] = [[-2.6, 1.9, 0.9], [-1.9, 2.7, 0.75], [-2.8, 0.8, 0.6], [-1.1, 2.8, 0.55], [-3.2, 2.4, 0.5], [-2.3, 3.3, 0.45], [2.6, -1.8, 0.45], [2.7, 1.9, 0.4], [-2.5, -1.6, 0.4], [0.9, -2.7, 0.4], [-0.4, 3.3, 0.35], [-3.4, 1.4, 0.35]];
    rubble.forEach(([x, z, s], i) => chunk(k, g, 60 + i, [s * 1.3, s, s * 1.1], [x, -0.25, z], BLOCKS[i % 3], i * 1.3));
  },
  dragon_bones: (k, g) => {
    // A long-dead dragon: blocky vertebrae along an arc, bent ribs, a heavy horned skull.
    for (let i = 0; i < 16; i++) {
      const z = -7 + i * 0.9;
      const y = Math.sin((i / 15) * Math.PI) * 1.2 + 0.25;
      cb(k, g, [0.5, 0.42, 0.62], [0, y, z], i % 2 ? BONE : BONE_D, [0.15, 0, 0], 0.06);
      cb(k, g, [0.12, 0.4, 0.2], [0, y + 0.35, z], BONE, undefined, 0.03);
      if (i > 3 && i < 12) {
        const span = 1.2 + Math.sin(((i - 4) / 7) * Math.PI) * 0.5;
        for (const sx of [-1, 1]) {
          cb(k, g, [span, 0.14, 0.16], [sx * span * 0.45, y + 0.05, z], BONE, [0, 0, sx * -0.35], 0.03);
          cb(k, g, [0.14, y + 0.4, 0.16], [sx * span * 0.9, (y + 0.1) / 2, z], BONE_D, [0, 0, sx * 0.12], 0.03);
        }
      }
    }
    cb(k, g, [1.3, 0.9, 2.2], [0.3, 0.45, 8.4], BONE, [0.1, 0.3, 0.1], 0.1);
    cb(k, g, [1.0, 0.35, 1.6], [0.3, 0.12, 9.5], BONE_D, [0.2, 0.3, 0], 0.06);
    for (const e of [-1, 1]) k.box(g, [0.22, 0.2, 0.05], [0.3 + e * 0.35, 0.72, 9.5], DARK, [0, 0.3, 0]);
    k.mesh(g, prism(0.28, 1.8, 0.5), BONE_D, [-0.15, 0.7, 7.7], [-1.1, 0.3, 0.35]);
    k.mesh(g, prism(0.28, 1.8, 0.5), BONE_D, [0.85, 0.7, 7.9], [-1.1, 0.3, -0.35]);
    for (let i = 0; i < 8; i++) cb(k, g, [0.3 - i * 0.025, 0.25 - i * 0.02, 0.6], [0, 0.15, -7.5 - i * 0.65], i % 2 ? BONE : BONE_D, [0, i * 0.06, 0], 0.04);
  },
  /**
   * A weathered menhir of an old stone circle (`v` picks its build): a tapered shaft leaning a
   * little, its crown broken off at a slant, standing in a half-buried footing with a fallen
   * chip at its foot, and a column of faint rune glyphs cut into its front (+Z, toward the ring's
   * centre). `v` = 99 builds the recumbent altar stone that lies in the middle of the ring.
   */
  standing_stone: (k, g, v) => {
    const s = v ?? 0, MEN = 0x6c675f, MEN_D = 0x5a554e, MEN_L = 0x7a746a, RUNE = 0x9ec8ff;
    const glyph = (x: number, y: number, z: number, tall: boolean, a = 0) =>
      k.box(g, tall ? [0.09, 0.26, 0.03] : [0.26, 0.08, 0.03], [x, y, z], RUNE, [0, a, 0], 0x3a78e0, 1.1);
    if (s === 99) {
      // Recumbent stone: a long low slab on two chocks, glyphs along its top.
      for (const x of [-0.8, 0.8]) chunk(k, g, 400 + x * 10, [0.6, 0.35, 0.8], [x, -0.05, 0], MEN_D, x);
      k.mesh(g, chamferBox(2.6, 0.5, 1.1, 0.12), MEN, [0, 0.5, 0], [0, 0, 0.03]);
      for (let i = 0; i < 4; i++) {
        const b = k.box(g, i % 2 ? [0.07, 0.03, 0.26] : [0.24, 0.03, 0.07], [-0.75 + i * 0.5, 0.76, 0], RUNE, undefined, 0x3a78e0, 0.8);
        b.rotation.z = 0.03;
      }
      return;
    }
    // Squat and broad (tall stones stretch into beams at the edge of the high camera's view).
    const h = 1.75 + hash01(s, 1) * 0.6, lean = (hash01(s, 2) - 0.5) * 0.14;
    const shaft = new THREE.Group();
    shaft.rotation.set(-0.06, 0, lean);
    g.add(shaft);
    chunk(k, g, 410 + s, [1.5, 0.42, 1.15], [0, -0.14, 0], MEN_D, hash01(s, 3));
    const wb = 1.15 + hash01(s, 5) * 0.2, db = 0.8;
    k.mesh(shaft, taper(q(wb), db, q(wb * 0.72), 0.56, q(h), 0.05, 0), MEN, [0, h / 2 + 0.1, 0]);
    // Weathered top: the crown worn down at a slant, paler where the rain has bleached it.
    k.mesh(shaft, taper(q(wb * 0.74), 0.58, q(wb * 0.5), 0.4, 0.3, 0.08 * (s % 2 ? 1 : -1), 0), MEN_L, [0.05, h + 0.25, 0]);
    const ys = [0.7, 1.05, 1.4].filter((y) => y < h - 0.25);
    ys.forEach((y, i) => {
      const t = (y - 0.1) / h, d = db / 2 - t * (db - 0.56) / 2 + 0.01;
      const b = glyph(0.05 * t, y, d, (i + s) % 2 === 0);
      g.remove(b);
      shaft.add(b);
    });
    chunk(k, g, 420 + s, [0.42, 0.28, 0.36], [0.8, -0.04, 0.55], MEN_D, s);
  },
  rails: (k, g, arg) => {
    const len = Math.max(2, arg ?? 6);
    for (const sx of [-0.35, 0.35]) k.box(g, [0.08, 0.1, len], [sx, 0.06, 0], IRON);
    for (let z = -len / 2 + 0.3; z < len / 2; z += 0.7) k.box(g, [1.1, 0.08, 0.22], [0, 0.03, z], PAL.wood);
  },
  minecart: (k, g) => {
    k.mesh(g, taper(0.9, 1.25, 1.1, 1.45, 0.62), 0x5a4a3a, [0, 0.62, 0]);
    for (const y of [0.45, 0.8]) k.box(g, [1.14, 0.07, 1.5], [0, y, 0], IRON);
    for (let i = 0; i < 5; i++) chunk(k, g, 90 + i, [0.4, 0.3, 0.4], [-0.3 + (i % 3) * 0.3, 0.8, -0.35 + Math.floor(i / 3) * 0.6], 0xb4743a, i, 0x3a1a00, 0.3);
    for (const [x, z] of [[-0.5, -0.42], [0.5, -0.42], [-0.5, 0.42], [0.5, 0.42]]) k.mesh(g, octagon(0.19, 0.1), IRON, [x, 0.2, z]);
  },
  dummy: (k, g) => {
    cb(k, g, [0.16, 1.9, 0.16], [0, 0.95, 0], WOOD, undefined, 0.03);
    cb(k, g, [1.2, 0.12, 0.12], [0, 1.4, 0], WOOD, undefined, 0.03);
    cb(k, g, [0.62, 0.8, 0.5], [0, 1.25, 0], 0xc8b070, undefined, 0.12);
    cb(k, g, [0.42, 0.4, 0.4], [0, 1.85, 0], 0xc8b070, undefined, 0.08);
    k.box(g, [0.3, 0.3, 0.04], [0, 1.3, 0.26], HERALD_BLUE);
    k.box(g, [0.12, 0.12, 0.05], [0, 1.3, 0.27], PAL.gold, [0, 0, Math.PI / 4]);
  },
  palisade: (k, g, arg) => {
    const len = Math.max(2, arg ?? 6);
    for (let x = -len / 2; x <= len / 2; x += 0.42) {
      const hgt = q(2 + (((x * 7.3) % 1) + 1) % 1 * 0.5);
      const lean = (((x * 3.1) % 1) - 0.5) * 0.06;
      cb(k, g, [0.34, hgt, 0.3], [x, hgt / 2, 0], 0x5a3a22, [0, 0, lean], 0.05);
      k.mesh(g, taper(0.34, 0.3, 0.02, 0.02, 0.45), 0x4a2e18, [x - lean * hgt, hgt + 0.22, 0], [0, 0, lean]);
    }
    k.box(g, [len, 0.14, 0.12], [0, 1.2, 0.2], 0x4a2e18);
    k.box(g, [len, 0.14, 0.12], [0, 0.5, 0.2], 0x4a2e18);
  },
  signpost: (k, g) => {
    // A squared post in a cairn with two chunky arrow boards (pointed ends), readable from above.
    for (let i = 0; i < 4; i++) chunk(k, g, 20 + i, [0.34, 0.24, 0.3], [Math.cos(i * 1.6) * 0.26, -0.04, Math.sin(i * 1.6) * 0.26], BLOCKS[i % 3], i);
    cb(k, g, [0.2, 2.3, 0.2], [0, 1.15, 0], WOOD_D, undefined, 0.03);
    k.mesh(g, taper(0.28, 0.28, 0.06, 0.06, 0.16), WOOD_D, [0, 2.38, 0]);
    // Both boards on one line, pointing opposite ways: from above it reads as one straight
    // fingerpost, never as a broken cross.
    for (const [y, a, dir] of [[1.95, 0, 1], [1.5, 0, -1]] as [number, number, number][]) {
      const arm = new THREE.Group();
      arm.position.set(0, y, 0);
      arm.rotation.y = a;
      g.add(arm);
      cb(k, arm, [1.0, 0.34, 0.1], [dir * 0.55, 0, 0.12], 0x8a6a44, undefined, 0.02);
      k.mesh(arm, wedge(0.34, 0.3, 0.1), 0x8a6a44, [dir * 1.2, 0, 0.12], [0, 0, dir * -Math.PI / 2]);
      k.box(arm, [0.6, 0.05, 0.02], [dir * 0.5, 0.04, 0.18], WOOD_D);
    }
  },
  well: (k, g) => {
    // Square stone curb, timber frame, slate gable roof, bucket.
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      cb(k, g, [1.9, 0.8, 0.35], [Math.sin(a) * 0.78, 0.4, Math.cos(a) * 0.78], i % 2 ? STONE : STONE_L, [0, a, 0], 0.06);
    }
    k.box(g, [1.2, 0.05, 1.2], [0, 0.55, 0], 0x1e3a44);
    for (const sx of [-0.8, 0.8]) cb(k, g, [0.16, 1.9, 0.16], [sx, 1.5, 0], WOOD, undefined, 0.03);
    cb(k, g, [1.9, 0.14, 0.14], [0, 2.2, 0], WOOD_D, undefined, 0.03);
    k.mesh(g, wedge(2.3, 0.7, 1.7, 0.08), SLATE, [0, 2.6, 0]);
    // The bucket on its rope from the beam.
    k.box(g, [0.03, 0.56, 0.03], [0.25, 1.92, 0], 0x8a7a5a);
    cb(k, g, [0.3, 0.3, 0.3], [0.25, 1.5, 0], WOOD_L, undefined, 0.04);
  },
  log: (k, g) => {
    // A felled log: a long octagonal beam with pale cut ends and a moss patch.
    cb(k, g, [3, 0.6, 0.6], [0, 0.28, 0], 0x4a3020, undefined, 0.17);
    for (const e of [-1, 1]) k.mesh(g, octagon(0.25, 0.04), 0xa08058, [e * 1.5, 0.28, 0]);
    cb(k, g, [0.7, 0.08, 0.36], [0.4, 0.6, 0.05], 0x5a8a3a, undefined, 0.03);
  },
  mushrooms: (k, g) => {
    for (let i = 0; i < 5; i++) {
      const x = Math.cos(i * 2.4) * 0.4, z = Math.sin(i * 2.4) * 0.4, s = 0.6 + (i % 3) * 0.25;
      k.box(g, [0.08 * s, 0.34 * s, 0.08 * s], [x, 0.17 * s, z], 0xe8dcc0);
      k.mesh(g, taper(0.36 * s, 0.36 * s, 0.18 * s, 0.18 * s, 0.14 * s), 0xb03a2a, [x, 0.4 * s, z], [0, i, 0], 0x2a0800);
    }
  },
  obsidian: (k, g) => {
    // Chunky volcanic-glass blocks with chisel tops out of a basalt knuckle (blocky, not spikes).
    chunk(k, g, 190, [1.8, 0.45, 1.5], [0, -0.12, 0], BASALT, 0.3);
    k.mesh(g, taper(1.05, 0.85, 0.42, 0.34, 3.0, 0.12, 0), OBSIDIAN, [0, 1.4, 0], [0.04, 0, 0.06]);
    k.mesh(g, taper(0.7, 0.6, 0.28, 0.24, 1.9, -0.08, 0.04), 0x241c22, [0.72, 0.85, 0.3], [-0.18, 0.6, -0.22]);
    k.mesh(g, taper(0.6, 0.5, 0.24, 0.2, 1.3, 0.04, 0), OBSIDIAN, [-0.6, 0.55, -0.35], [0.22, 1.2, 0.26]);
  },
  crystal_big: (k, g) => {
    // Glows by itself (emissive + bloom): no point light.
    k.mesh(g, prism(0.62, 2.8, 0.3), 0x7ad0ff, [0, 0, 0], [0.15, 0.3, 0.1], 0x2a8ad0, 1.3);
    k.mesh(g, prism(0.44, 1.9, 0.3), 0x7ad0ff, [0.55, 0, 0.2], [-0.3, 1, -0.35], 0x2a8ad0, 1.3);
    k.mesh(g, prism(0.38, 1.5, 0.3), 0xa0e0ff, [-0.5, 0, -0.3], [0.35, 2, 0.3], 0x2a8ad0, 1.3);
    chunk(k, g, 77, [1.3, 0.4, 1.1], [0, -0.1, 0], 0x4a4440, 0.5);
  },
  statue: (k, g) => {
    // A weathered dragon-knight on a stepped plinth.
    cb(k, g, [2.2, 0.5, 2.2], [0, 0.25, 0], STONE_D, undefined, 0.06);
    cb(k, g, [1.8, 0.6, 1.8], [0, 0.8, 0], STONE, undefined, 0.06);
    cb(k, g, [0.8, 1.4, 0.5], [0, 1.8, 0], 0x7a7870, undefined, 0.08);
    cb(k, g, [1.1, 0.35, 0.55], [0, 2.4, 0], 0x7a7870, undefined, 0.08);
    cb(k, g, [0.46, 0.5, 0.5], [0, 2.85, 0], 0x7a7870, undefined, 0.08);
    k.mesh(g, prism(0.08, 0.5, 0.6), 0x6a6860, [0, 3.05, -0.05], [-0.4, 0, 0]);
    cb(k, g, [0.16, 2.6, 0.12], [0.62, 2.3, 0.2], 0x6a6860, [0, 0, -0.1], 0.03);
    cb(k, g, [0.6, 0.9, 0.14], [-0.66, 1.9, 0.28], 0x6a6860, [0, 0.2, 0], 0.05);
  },
  landing: (k, g) => {
    // Arrival platform: a broad stepped dais with blue rune inlays.
    dais(k, g, 5.6, 0x6ab0ff, 9);
    return { obj: g, light: light(g, 0x6ab0ff, 2.2, 6, 0.8) };
  },
  bank: (k, g) => {
    // The bank counter: a panelled stone counter with a dark oak top and an iron teller grille with
    // three windows, a ledger, coin stacks and a set of scales. Customers stand on the +Z side.
    const W = 6;
    cb(k, g, [W + 0.2, 0.2, 1.2], [0, 0.1, 0], STONE_D, undefined, 0.04);
    cb(k, g, [W, 0.92, 1.0], [0, 0.66, 0], STONE, undefined, 0.04);
    for (let i = 0; i < 4; i++) cb(k, g, [1.18, 0.56, 0.06], [-2.1 + i * 1.4, 0.64, 0.51], STONE_L, undefined, 0.03);
    cb(k, g, [W + 0.3, 0.12, 1.24], [0, 1.18, 0], WOOD_D, undefined, 0.03);
    // Grille: stout posts, a top rail and bars, open over the three teller windows.
    for (const x of [-3, -1, 1, 3]) cb(k, g, [0.2, 1.5, 0.2], [x, 1.99, -0.3], WOOD_D, undefined, 0.03);
    cb(k, g, [W + 0.2, 0.2, 0.26], [0, 2.8, -0.3], WOOD_D, undefined, 0.03);
    for (let x = -2.8; x <= 2.81; x += 0.25) {
      const inWindow = [-2, 0, 2].some((c) => Math.abs(x - c) < 0.45);
      if (Math.abs(Math.abs(x) - 1) < 0.12 || Math.abs(Math.abs(x) - 3) < 0.12) continue;
      k.box(g, [0.05, inWindow ? 0.62 : 1.5, 0.05], [x, inWindow ? 2.39 : 1.99, -0.3], IRON);
    }
    for (const c of [-2, 0, 2]) cb(k, g, [0.95, 0.08, 0.4], [c, 1.28, -0.2], WOOD_L, undefined, 0.02);
    // Ledger (open), coin stacks and scales on the counter.
    for (const e of [-1, 1]) k.box(g, [0.3, 0.05, 0.4], [-0.6 + e * 0.16, 1.27, 0.2], 0xe8dcc0, [0, 0, e * 0.06]);
    k.box(g, [0.02, 0.06, 0.4], [-0.6, 1.27, 0.2], 0x6a2020);
    for (const [x, n] of [[0.5, 3], [0.8, 2], [2.3, 4], [-2.4, 2]] as [number, number][]) {
      for (let i = 0; i < n; i++) k.mesh(g, octagon(0.11, 0.05), PAL.gold, [x, 1.27 + i * 0.05, 0.25], [0, 0, Math.PI / 2], 0x5a3a00, 0.3);
    }
    cb(k, g, [0.08, 0.5, 0.08], [1.5, 1.49, 0.1], PAL.gold, undefined, 0.02);
    k.box(g, [0.7, 0.04, 0.04], [1.5, 1.72, 0.1], PAL.gold);
    for (const e of [-1, 1]) k.mesh(g, taper(0.22, 0.22, 0.12, 0.12, 0.06), PAL.gold, [1.5 + e * 0.32, 1.45, 0.1]);
  },
  shop: (k, g) => {
    // The Quartermaster's counter: a panelled oak counter with the day's wares laid out on it.
    const W = 5;
    cb(k, g, [W, 1.0, 1.0], [0, 0.5, 0], WOOD, undefined, 0.04);
    for (let i = 0; i < 4; i++) cb(k, g, [1.0, 0.6, 0.06], [-1.8 + i * 1.2, 0.5, 0.51], WOOD_L, undefined, 0.02);
    cb(k, g, [W + 0.2, 0.12, 1.16], [0, 1.06, 0], WOOD_D, undefined, 0.03);
    // Potions, a folded cloak, a sword on a cloth, a coin purse and a hand bell.
    for (const [x, c] of [[-2.0, 0xd03a3a], [-1.75, 0xd03a3a], [-1.5, 0x3a6ad0]] as [number, number][]) {
      k.box(g, [0.16, 0.26, 0.16], [x, 1.25, 0.1], c, undefined, c, 0.5);
      k.box(g, [0.07, 0.08, 0.07], [x, 1.42, 0.1], 0xe8dcc0);
    }
    cb(k, g, [0.7, 0.14, 0.5], [-0.6, 1.19, 0.05], 0x3a5a8a, undefined, 0.04);
    k.box(g, [1.3, 0.02, 0.4], [0.7, 1.13, 0.1], 0x7a2020);
    cb(k, g, [1.1, 0.04, 0.1], [0.7, 1.17, 0.1], IRON_L, undefined, 0.01);
    cb(k, g, [0.08, 0.06, 0.36], [0.1, 1.17, 0.1], PAL.gold, undefined, 0.01);
    cb(k, g, [0.3, 0.26, 0.3], [1.8, 1.25, 0.05], PAL.leather, undefined, 0.08);
    k.mesh(g, taper(0.2, 0.2, 0.08, 0.08, 0.18), PAL.gold, [2.25, 1.21, 0.25]);
  },
  ruin: (k, g, id) => {
    // A plot marker by the building's door: a cornerstone and a post with a hanging sign in the
    // building's colour. Restored, a lantern is lit on the post.
    const mark = PLOT_MARK[id as string] ?? 0xffc870;
    cb(k, g, [0.9, 0.5, 0.9], [0, 0.25, 0], STONE_D, undefined, 0.06);
    cb(k, g, [0.2, 2.5, 0.2], [0, 1.5, 0], WOOD_D, undefined, 0.03);
    cb(k, g, [1.0, 0.12, 0.12], [0.42, 2.6, 0], WOOD_D, undefined, 0.02);
    for (const x of [0.2, 0.7]) k.box(g, [0.03, 0.34, 0.03], [x, 2.4, 0], IRON);
    cb(k, g, [0.95, 0.66, 0.08], [0.45, 1.95, 0], 0x3a2a1e, undefined, 0.02);
    k.mesh(g, octagon(0.22, 0.06), mark, [0.45, 1.95, 0.06], [0, Math.PI / 2, 0], mark, 0.7);
    const lamp = new THREE.Group();
    g.add(lamp);
    cb(k, lamp, [0.28, 0.36, 0.28], [-0.05, 2.25, 0.2], IRON, undefined, 0.03);
    k.box(lamp, [0.2, 0.26, 0.2], [-0.05, 2.25, 0.2], 0xffd080, undefined, 0xffb040, 2);
    return { obj: g, setState: (s) => (lamp.visible = s === 'restored') };
  },
  // ─── Castle v2 (docs/blueprints/castle-v2): curtain, towers, gates ─────────────
  // Every wall piece is built along local X with its outer face toward -Z (the inner face, the wall
  // walk's rail side, toward +Z). They stand full height and fade round the hero like any tall wall.
  /** A curtain wall `len` long. */
  castle_wall: (k, g, arg) => {
    // `v` flags: 1 / 2 a tower's drum at the -X / +X end (the wall walk's parapets run on into it),
    // 4 / 8 a small gate (postern or ward gate) at that end (no banner crowds the gate).
    const L = lenOf(arg) ?? 10, { T, H } = CURTAIN_WALL, ends = vOf(arg);
    const e0 = ends & 1 ? 0.7 : 0, e1 = ends & 2 ? 0.7 : 0, LL = L + e0 + e1, uc = (e1 - e0) / 2;
    // Cream ashlar on a deep base course of the same stone, a string course of its dressed stone on
    // both faces level with the towers' (CURTAIN_COURSES), and the crown that carries the wall walk.
    deep(cb(k, g, [L, BASE_COURSE, T + 0.5], [0, BASE_COURSE / 2, 0], BASE, undefined, 0.06));
    cb(k, g, [L, H - BASE_COURSE, T], [0, BASE_COURSE + (H - BASE_COURSE) / 2, 0], ASHLAR, undefined, 0.04);
    cb(k, g, [L, COURSE, T + 0.12], [0, CURTAIN_COURSES[0] + COURSE / 2, 0], DRESS, undefined, 0.03);
    // (Where the walk runs into a tower, the last merlons stand well clear of its doorway.)
    curtainCrown(k, g, L, LL, uc, ends & 3 ? 1.35 : 0.8);
    // The lord's banner on the outer face, all one size: one centred on every run between towers,
    // two at even spacing on a long run, so every face carries the same navy-and-gold rhythm as the
    // south front; beside a small gate the banner stands a little clear of its lanterns, and a short
    // stub beside one carries none. (The towers carry the arrow loops; the curtain's faces stay plain
    // between its banners.)
    const gate0 = ends & 4 ? 1.2 : 0, gate1 = ends & 8 ? 1.2 : 0;
    const nb = L < 7 || (ends & 12 && L < 9) ? 0 : L > 24 ? 2 : 1;
    const at = Array.from({ length: nb }, (_, i) => -L / 2 + (L * (i + 0.5)) / nb + (gate0 - gate1) / nb);
    for (const b of at) {
      const out = new THREE.Group();
      out.position.set(b, 0, -T / 2 - 0.2);
      out.rotation.y = Math.PI;
      g.add(out);
      livery(k, out, 0, H - 0.6, 0, 1.3, 2.3);
    }
  },
  /**
   * A round wall tower, radius `len`: a deep battered base course, a drum rising a full storey over
   * the wall walk (+7) to its platform, and on top a parapet ring on a course stepped out from the drum,
   * with ten evenly spaced merlons. `v` sets how tall: the platform stands at v + 1.4.
   */
  round_tower: (k, g, arg) => drumTower(k, g, lenOf(arg) ?? 3.2, vOf(arg) || 9, false, arg?.opt),
  /**
   * A corner tower of the curtain: a round tower a stage taller than the wall towers, a gilt frieze
   * under its parapet and a blue-slate spire with a gilt finial and a pennant standing inside its
   * merlon ring, so the corners step the skyline up round the walls (the wall towers stay flat).
   */
  corner_tower: (k, g, arg) => drumTower(k, g, lenOf(arg) ?? 3.4, vOf(arg) || 12, true, arg?.opt),
  /**
   * A flag on a pole standing on a round tower's platform (the tower `v` tall, as round_tower), flying
   * toward `len` (±1 along local X). The south face's pair flank the gatehouse's three, so the gate
   * front reads as one symmetric composition of five.
   */
  tower_flag: (k, g, arg) => {
    // The pole rises well clear of the merlons (their tops at P + 1.75), so the whole flag flies a
    // full flag's height above the battlements, a gold ball on its top.
    const P = (vOf(arg) || 9) + 1.4, dir = (lenOf(arg) ?? 1) < 0 ? -1 : 1;
    cb(k, g, [0.13, 5.6, 0.13], [0, P + 2.8, 0], LAMP_NAVY, undefined, 0.02);
    k.mesh(g, new THREE.OctahedronGeometry(0.14, 1), PAL.gold, [0, P + 5.7, 0]);
    flag(k, g, 0, P + 5.5, 0, 2.3, 1.4, dir);
  },
  /**
   * The outer gatehouse in the curtain: two drum towers (radius `opt.R`) standing on the curtain's line
   * either side of the passage (`len` wide, their centres `opt.cx` either side of it, so the
   * ceremonial arch and its hood stand clear between them), each rising a stage over the wall walk
   * with a doorway onto it, and between them the gatehouse block, through the curtain's thickness and
   * a storey higher than it: the passage under a pointed arch of dressed voussoirs, the portcullis
   * raised in the arch, a machicolated, crenellated parapet, the lord's banner over the arch and one
   * on each drum. Built along local X, outer face toward -Z.
   */
  outer_gatehouse: (k, g, arg) => {
    // The drums rise a stage over the wall towers either side to 13, each crowned with a slate spire
    // banded in gold and flying the gate's pennant from its finial, so the skyline steps up at the
    // gate as it does at the corners and the keep.
    const o = (arg?.opt ?? {}) as { cx?: number; R?: number };
    const P = lenOf(arg) ?? 4, R = o.R ?? 2.6, H = 13, cx = o.cx ?? 6.0, T = 2.2, D = T + 0.8, GH = 10.5, N = 20;
    for (const sx of [-1, 1]) {
      // (Each drum in its own group at its centre, its rings of stone laid round its own axis.)
      const dg = new THREE.Group();
      dg.position.set(sx * cx, 0, 0);
      g.add(dg);
      drumFoot(k, dg, R, R + 0.55, R + 0.2);
      drumShaft(k, dg, R, BASE_COURSE, H, ASHLAR, [[(sx * Math.PI) / 2, -sx * DOORS.walk.off]], DOORS.walk.y);
      for (const y of CURTAIN_COURSES) drumCourse(k, dg, R, 0.06, y);
      drumFrieze(k, dg, 0, 0, R, crownFoot(H) - 1.5 * COURSE, N);
      crown(k, dg, 0, 0, R, H, N, false);
      spire(k, dg, 0, H + 0.9, 0, R + 0.1, R * 1.75, N, sx, 1.6);
      // The wall walk comes in from the curtain beyond it (local +X on the right drum) to a doorway.
      drumDoorway(k, dg, R, (sx * Math.PI) / 2, -sx * DOORS.walk.off, DOORS.walk.y);
      // Arrow loops on its outer face, two storeys, set square to the field outside.
      const f = new THREE.Group();
      f.rotation.y = (Math.round((Math.PI + sx * 0.5) / ((Math.PI * 2) / N) - 0.5) + 0.5) * ((Math.PI * 2) / N);
      dg.add(f);
      for (const y of LOOP_ROWS) arrowLoop(k, f, 0, y, R);
    }
    // The gatehouse block in one piece, its passage cut through it as a pointed (two-centred) arch:
    // as wide as the drums' centres up to the wall walk, then rising between the drums to its parapet.
    const spring = 3.6, ra = P * 0.8, off = ra - P / 2, apex = spring + Math.sqrt(ra * ra - off * off);
    const zc = 0.2, bw = cx - R + 0.45, WW = 8.0, tA = Math.acos(off / ra);
    const half = (y: number) => Math.max(0, Math.sqrt(Math.max(0, ra * ra - (y - spring) ** 2)) - off);
    {
      const s = new THREE.Shape();
      s.moveTo(-cx, 0);
      s.lineTo(-P / 2, 0);
      for (let i = 0; i <= 12; i++) {
        const t = (tA * i) / 12;
        s.lineTo(-(-off + ra * Math.cos(t)), spring + ra * Math.sin(t));
      }
      for (let i = 11; i >= 0; i--) {
        const t = (tA * i) / 12;
        s.lineTo(-off + ra * Math.cos(t), spring + ra * Math.sin(t));
      }
      for (const [x, y] of [[P / 2, 0], [cx, 0], [cx, WW], [bw, WW], [bw, GH], [-bw, GH], [-bw, WW], [-cx, WW]]) s.lineTo(x, y);
      s.closePath();
      const geo = new THREE.ExtrudeGeometry(s, { depth: D, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, zc - D / 2);
      geo.computeVertexNormals();
      geo.userData.boxes = [[-cx, 0, zc - D / 2, -P / 2, WW, zc + D / 2], [P / 2, 0, zc - D / 2, cx, WW, zc + D / 2], [-P / 2, apex, zc - D / 2, P / 2, WW, zc + D / 2], [-bw, WW, zc - D / 2, bw, GH, zc + D / 2]];
      k.mesh(g, geo, ASHLAR, [0, 0, 0]);
    }
    // (The deep base course runs a hair into the passage, so the jambs stand on it all across.)
    for (const sx of [-1, 1]) deep(cb(k, g, [cx - P / 2 + 0.02, BASE_COURSE, D + 0.12], [sx * (P / 2 - 0.01 + (cx - P / 2 + 0.02) / 2), BASE_COURSE / 2, zc], BASE, undefined, 0.03));
    // The ceremonial arch, the great door's twin, all in the castle's dressed stone: on both faces a
    // deep ring of voussoirs (0.6 deep, flush on one radius just proud of the face, every other one a
    // hair prouder), springing from moulded imposts on jambs set flush in the same plane, and a big
    // keystone. Outside, over the opening, a tympanum of the same stone carries the lord's gilt diamond
    // on a slim lintel, the raised portcullis set back behind it with only its spikes showing; the
    // keystone bears the shield.
    const NV = 9, VD = 0.6, VP = 0.16;
    for (const e of [-1, 1]) {
      const fz = zc + e * (D / 2), pz0 = fz + e * (VP / 2 - 0.01);
      for (const sx of [-1, 1]) {
        const put = (rad: number, t: number, size: V3, z: number, color: number) => {
          const x = -off + rad * Math.cos(t), y = spring + rad * Math.sin(t);
          cb(k, g, size, [sx * x, y, z], color, [0, 0, sx > 0 ? t : Math.PI - t], 0.015);
        };
        for (let i = 0; i < NV; i++) {
          const t = (tA * (i + 0.5)) / NV, rr = ra + VD / 2;
          // (Every other stone a hair prouder, so at the joints the stones read one by one.)
          put(rr, t, [VD, (rr * tA) / NV + 0.02, i % 2 ? VP + 0.03 : VP], pz0, DRESS);
        }
        // The impost (a moulded block the ring springs from) on the jamb, the jamb from the base course up.
        cb(k, g, [VD + 0.4, 0.26, VP + 0.14], [sx * (P / 2 + VD / 2 + 0.15), spring - 0.13, fz + e * ((VP + 0.14) / 2 - 0.01)], DRESS, undefined, 0.02);
        cb(k, g, [VD, spring - 0.26 - BASE_COURSE, VP], [sx * (P / 2 + VD / 2), BASE_COURSE + (spring - 0.26 - BASE_COURSE) / 2, pz0], DRESS, undefined, 0.02);
      }
      // (One stone: no taller than a course and a half.)
      cb(k, g, [0.62, 0.8, VP + 0.1], [0, apex + 0.31, fz + e * ((VP + 0.1) / 2 - 0.01)], DRESS, undefined, 0.03);
    }
    {
      const kz = zc - D / 2 - VP - 0.06;
      cb(k, g, [0.4, 0.34, 0.05], [0, apex + 0.42, kz], HERALD_BLUE, undefined, 0.01);
      k.box(g, [0.15, 0.15, 0.03], [0, apex + 0.42, kz - 0.03], PAL.gold, [0, 0, Math.PI / 4]);
      // The tympanum over the opening outside, set a little back in the arch, on its lintel (whose top
      // lies on a course line).
      const lt = Math.ceil((spring + 0.3) / COURSE) * COURSE;
      const s0 = new THREE.Shape(), y0 = lt - spring, n = 10;
      const x0 = Math.sqrt(ra * ra - y0 * y0) - off;
      s0.moveTo(x0, y0);
      for (let i = 1; i <= n; i++) {
        const t = (tA * i) / n;
        s0.lineTo(-off + ra * Math.cos(t), Math.sin(t) * ra);
      }
      for (let i = n - 1; i >= 1; i--) {
        const t = (tA * i) / n;
        s0.lineTo(off - ra * Math.cos(t), Math.sin(t) * ra);
      }
      s0.lineTo(-x0, y0);
      const tz = zc - D / 2 + 0.24;
      k.mesh(g, new THREE.ExtrudeGeometry(s0, { depth: 0.12, bevelEnabled: false }), DRESS, [0, spring, tz - 0.06]);
      k.box(g, [0.9, 0.9, 0.04], [0, spring + (y0 + apex - spring) / 2 - 0.1, tz - 0.08], PAL.gold, [0, 0, Math.PI / 4]);
      cb(k, g, [P + 0.04, lt - spring + 0.01, 0.34], [0, (spring - 0.01 + lt) / 2, tz], DRESS, undefined, 0.02);
    }
    // The portcullis, raised behind the tympanum: its grid filling the arch head, only the spiked
    // foot showing under the lintel outside.
    const pz = zc - D / 2 + 0.6;
    for (let x = -P / 2 + 0.3; x < P / 2 - 0.2; x += 0.42) {
      const top = spring + Math.sqrt(Math.max(0, ra * ra - (Math.abs(x) + off) ** 2)) - 0.05;
      k.box(g, [0.1, top - 3.72, 0.1], [x, (top + 3.72) / 2, pz], IRON);
      k.mesh(g, taper(0.1, 0.1, 0.01, 0.01, 0.25), IRON, [x, 3.6, pz], [Math.PI, 0, 0]);
    }
    // (Its rails run into the grooves in the arch's sides, so the grid hangs in the stone.)
    for (const y of [3.85, 4.6, 5.3, 6.0]) {
      const hw = half(y) + 0.12;
      if (hw > 0.3) k.box(g, [hw * 2, 0.09, 0.12], [0, y, pz], IRON);
    }
    // Along the outer face the gilt frieze and over it the course that carries the parapet, standing
    // out from the face; then the parapet all round the block's top, two courses high, and its coping.
    frieze(k, g, 2 * bw + 0.1, 0, GH - 1.5 * COURSE, zc - D / 2 - 0.02);
    cb(k, g, [2 * bw + 0.1, COURSE, 0.4], [0, GH - COURSE / 2, zc - D / 2 - 0.1], DRESS, undefined, 0.02);
    cb(k, g, [2 * bw, 2 * COURSE, 0.6], [0, GH + COURSE, zc - D / 2], ASHLAR, undefined, 0.03);
    cb(k, g, [2 * bw, 2 * COURSE, 0.5], [0, GH + COURSE, zc + D / 2 - 0.25], ASHLAR, undefined, 0.03);
    // (Its sides run between the front and back stretches, not through them.)
    for (const sx of [-1, 1]) cb(k, g, [0.5, 2 * COURSE, D - 0.8], [sx * (bw - 0.25), GH + COURSE, zc - 0.1], ASHLAR, undefined, 0.03);
    cb(k, g, [2 * bw + 0.1, 0.14, 0.74], [0, GH + 2 * COURSE + 0.07, zc - D / 2], DRESS, undefined, 0.02);
    cb(k, g, [2 * bw + 0.1, 0.14, 0.64], [0, GH + 2 * COURSE + 0.07, zc + D / 2 - 0.25], DRESS, undefined, 0.02);
    // The roof deck stands nearly flush with the parapet, so the block reads as one solid mass.
    cb(k, g, [2 * bw - 0.5, 0.7, D - 0.7], [0, GH + 0.35, zc], DECK, undefined, 0.02);
    for (let i = 0; i < 4; i++) {
      const u = -bw + 0.5 + (i * (2 * bw - 1.0)) / 3;
      cb(k, g, [0.8, 0.75, 0.62], [u, GH + 2 * COURSE + 0.515, zc - D / 2], ASHLAR, undefined, 0.04);
      cb(k, g, [0.8, 0.75, 0.52], [u, GH + 2 * COURSE + 0.515, zc + D / 2 - 0.25], ASHLAR, undefined, 0.04);
    }
    // The lord's banner over the arch on the outer face (facing out, -Z): the middle of the gate
    // front's five flags.
    {
      const out = new THREE.Group();
      // (Hung from a rod against the frieze, under the course that carries the parapet, its tail well
      // clear of the arch.)
      out.position.set(0, 0, zc - D / 2 - 0.19);
      out.rotation.y = Math.PI;
      g.add(out);
      livery(k, out, 0, GH - COURSE - 0.08, 0, 1.2, 1.2);
    }
    // The passage floor: the castle's paving laid on through the gate, a dressed threshold stone across
    // each end.
    paved(k.box(g, [P - 0.1, 0.04, D - 0.72], [0, 0.02, zc], PAVE));
    for (const e of [-1, 1]) cb(k, g, [P - 0.05, 0.08, 0.36], [0, 0.04, zc + e * (D / 2 - 0.18)], DRESS, undefined, 0.03);
  },
  /**
   * The donjon: the great round tower at the castle's high corner (radius `len`, `v` tall), a
   * battered base, string courses at each floor, a corbelled crenellated parapet, and inside the
   * merlon ring the castle's one spire: deep blue slate on a blue-grey eave, gabled lucarnes bedded
   * in the slate, a gold finial, and the lord's banner on a pole above it. Its windows look out over
   * the cour and the bower (never into the range it stands against), one kind to each storey.
   */
  donjon: (k, g, arg) => {
    const r = lenOf(arg) ?? 7, H = vOf(arg) || 13, N = 24, M = 2 * N;
    // Laid in rings of flat stones, all in the castle's one stone on the course lines: the deep battered
    // base course, the drum, a course at each floor, and the crown (a course corbelled out from the drum
    // carrying the parapet ring two courses high, its coping and the merlons, the crown's stones two to
    // each of its bays, a merlon centred on a stone of the coping).
    drumFoot(k, g, r, r + 0.55, r + 0.25);
    drum(k, g, { r, y0: BASE_COURSE, y1: H, n: drumStones(r) }, ASHLAR);
    for (const y of [5, 9]) drumCourse(k, g, r, 0.06, y);
    drum(k, g, { r: r + 0.2, rTop: r + 0.45, y0: H, y1: H + COURSE, n: M }, DRESS);
    k.cyl(g, r - 0.4, r - 0.4, 0.1, [0, H + 0.45, 0], DECK, undefined, M);
    drum(k, g, { r: r + 0.45, rIn: r - 0.25, y0: H + COURSE, y1: H + 3 * COURSE, n: M }, ASHLAR);
    drum(k, g, { r: r + 0.51, rIn: r - 0.31, y0: H + 3 * COURSE, y1: H + 3 * COURSE + 0.12, n: M, bond: false, turn: Math.PI / M }, DRESS);
    for (let i = 0; i < N; i += 2) {
      const a = (i / N) * Math.PI * 2, c = 2 * (r + 0.2) * Math.sin(Math.PI / N) + 0.05;
      cb(k, g, [c * 0.8, 0.7, 0.62], [Math.sin(a) * (r + 0.1), H + 3 * COURSE + 0.47, Math.cos(a) * (r + 0.1)], hash01(i, r) > 0.7 ? ASHLAR_L : ASHLAR, [0, a, 0], 0.05);
    }
    // The spire, standing inside the merlon ring on its eave: royal blue slate banded in gold, four
    // gabled lucarnes with lit windows round it a fifth of the way up, a great gilt orb and spike at
    // its point, and the lord's banner on a pole above.
    const sh = r * 1.6, s0 = H + 0.9, R0 = r + 0.15, slope = R0 / sh;
    spire(k, g, 0, s0, 0, R0, sh, N);
    const tip = s0 + 0.16 + sh;
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2, f = 0.19, rc = R0 * (1 - f), y = s0 + 0.16 + sh * f;
      const d = new THREE.Group();
      d.position.set(Math.sin(a) * rc, y, Math.cos(a) * rc);
      d.rotation.y = a;
      g.add(d);
      // Each a gabled lucarne, all four alike, built out of the slate (local z = 0 on the cone's face
      // at its foot, the cone falling back 0.64 for every unit up): a cream front with its lancet,
      // its cheeks running back into the cone, and a steep slate roof gabled at the front and hipped
      // behind, its slopes running down back into the cone (never a long level ridge standing out of
      // it), so the whole dormer is bedded in the roof; a cream tympanum in the gable, a dressed stone
      // eave and a gilt finial on the gable's point.
      const zf = 0.38, back = -0.5 - 3.0 * slope, ez = zf + 0.08;
      cb(k, d, [1.5, 1.95, zf - back], [0, 0.375, (zf + back) / 2], ASHLAR_B, undefined, 0.04);
      const roofPts = [[0.83, 1.345, ez], [-0.83, 1.345, ez], [0, 2.795, ez], [0.83, 1.345, -1.3], [-0.83, 1.345, -1.3], [0, 1.6, -1.8]].map(([x, y, z]) => new THREE.Vector3(x, y, z));
      k.mesh(d, new ConvexGeometry(roofPts), SLATE_BLUE, [0, 0, 0]);
      k.mesh(d, wedge(0.1, 1.2, 1.36), ASHLAR_B, [0, 1.96, zf + 0.03], [0, Math.PI / 2, 0]);
      cb(k, d, [1.7, 0.12, 0.22], [0, 1.36, zf + 0.02], DRESS, undefined, 0.02);
      lancet(k, d, 0, 0.0, zf, 0.5, 0.85, true);
      k.mesh(d, new THREE.OctahedronGeometry(0.15, 0), PAL.gold, [0, 2.98, zf + 0.08]);
      cb(k, d, [0.05, 0.34, 0.05], [0, 2.78, zf + 0.08], PAL.gold, undefined, 0.01);
    }
    cb(k, g, [0.14, 3.6, 0.14], [0, tip + 1.6 + 1.8, 0], IRON, undefined, 0.02);
    flag(k, g, 0, tip + 5.0, 0, 3.2, 2.0, 1);
    // Its windows, in three columns facing the cour, the bower's court and the west (none toward the
    // range against its east side or the grove behind), each centred in its storey between the
    // bands and each storey its own kind, as a keep is lit: cross loops in the guarded ground floor,
    // a tall lancet lighting the hall floor, and a round window high in the lord's chamber.
    const step = (Math.PI * 2) / N;
    for (const col of [-1, -4, -7]) {
      const a = (col + 0.5) * step, face = new THREE.Group();
      face.position.set(Math.sin(a) * r, 0, Math.cos(a) * r);
      face.rotation.y = a;
      g.add(face);
      arrowLoop(k, face, 0, 3.35, 0);
      lancet(k, face, 0, 5.85, 0.02, 0.7, 2.2);
      oculus(k, face, 0, 11.0, 0, 0.48);
    }
  },
  stall: (k, g, v) => {
    // A market stall: counter, four posts and a striped awning (colours vary).
    const [a, b] = [[0xe8dcc0, 0xa03030], [0xe8dcc0, 0x3a6a9a], [0xe8dcc0, 0x4a7a3a]][(v ?? 0) % 3];
    cb(k, g, [3.0, 0.9, 1.1], [0, 0.45, 0.35], PAL.wood, undefined, 0.04);
    cb(k, g, [3.1, 0.1, 1.2], [0, 0.93, 0.35], WOOD_L, undefined, 0.02);
    for (const [x, z] of [[-1.4, -0.6], [1.4, -0.6], [-1.4, 0.95], [1.4, 0.95]]) cb(k, g, [0.14, 2.5, 0.14], [x, 1.25, z], WOOD_D, undefined, 0.02);
    for (let i = 0; i < 6; i++) k.box(g, [0.5, 0.08, 2.1], [-1.25 + i * 0.5, 2.55, 0.2], i % 2 ? a : b, [0.16, 0, 0]);
    for (let i = 0; i < 5; i++) chunk(k, g, 200 + i + (v ?? 0) * 7, [0.28, 0.22, 0.26], [-1.0 + i * 0.5, 0.98, 0.3], [0xc8a040, 0x8a4a2a, 0x6a8a3a, 0xa03030][i % 4], i);
    cb(k, g, [0.6, 0.6, 0.6], [-1.1, 0.3, -1.0], WOOD_L, [0, 0.3, 0], 0.04);
  },
  lamp_post: (k, g) => {
    // A lit lamp post without its own light (the keep has only a few real lights).
    royalLamp(k, g);
  },
  barrels: (k, g) => {
    for (const [x, z, s] of [[0, 0, 1], [0.72, 0.2, 0.9], [0.3, 0.72, 0.85]] as [number, number, number][]) {
      cb(k, g, [q(0.66 * s), q(0.9 * s), q(0.66 * s)], [x, 0.45 * s, z], WOOD, undefined, 0.19 * s);
      for (const y of [0.18, 0.72]) cb(k, g, [q(0.69 * s), 0.06, q(0.69 * s)], [x, y * s, z], IRON, undefined, 0.19 * s);
    }
  },
  /**
   * A raised timber bed 3 long of one crop in two neat rows (`v`): 0 cabbages, 1 lettuces, 2
   * carrots, 3 leeks, 4 red cabbages, 5 lavender.
   */
  herb_bed: (k, g, arg) => {
    const v = vOf(arg) % 6;
    cb(k, g, [3.0, 0.4, 1.3], [0, 0.2, 0], WOOD_D, undefined, 0.04);
    k.box(g, [2.8, 0.06, 1.1], [0, 0.4, 0], 0x3a2a1e);
    const soil = new THREE.Group();
    soil.position.y = 0.43;
    g.add(soil);
    const step = v === 2 || v === 3 ? 0.32 : 0.52;
    spread(3.0, step, 0.32).forEach((x, i) => {
      for (const z of [-0.27, 0.27]) {
        const seed = i * 1.37 + z * 3, xx = x + (z > 0 ? step / 2 : 0);
        if (xx > 1.25) continue;
        if (v === 0 || v === 4) PLANT.cabbage(k, soil, xx, z, seed, v === 4);
        else if (v === 1) PLANT.lettuce(k, soil, xx, z, seed);
        else if (v === 2) PLANT.carrot(k, soil, xx, z, seed);
        else if (v === 3) PLANT.leek(k, soil, xx, z, seed);
        else PLANT.lavender(k, soil, xx, z, seed);
      }
    });
  },
  lamp: (k, g) => {
    royalLamp(k, g);
    return { obj: g, light: light(g, 0xffb060, 6, 9, 2.7) };
  },
  furnace: (k, g) => {
    // A square brick forge: stone plinth, running-bond brick body with a glowing arched mouth, a
    // tapering hood and chimney, bellows on one side and a coal heap on the other.
    cb(k, g, [2.7, 0.3, 2.3], [0, 0.15, 0], STONE_D, undefined, 0.06);
    k.box(g, [2.1, 1.7, 1.7], [0, 1.15, 0], BRICK_D);
    const brick = [BRICK, BRICK_L, BRICK_D];
    masonry(k, g, { x: 0, z: 0.86, rot: 0, len: 2.4, y0: 0.3, rows: 5, rowH: 0.34, thick: 0.28, seed: 21, shades: brick, unit: 0.6, hole: { u: 0, w: 1.0, h: 1.3 } });
    masonry(k, g, { x: 0, z: -0.86, rot: 0, len: 2.4, y0: 0.3, rows: 5, rowH: 0.34, thick: 0.28, seed: 22, shades: brick, unit: 0.6 });
    for (const sx of [-1, 1]) masonry(k, g, { x: sx * 1.06, z: 0, rot: Math.PI / 2, len: 1.44, y0: 0.3, rows: 5, rowH: 0.34, thick: 0.28, seed: 23 + sx, shades: brick, unit: 0.6 });
    // Mouth: a dark firebox with glowing coals under a stone lintel.
    k.box(g, [0.9, 0.95, 0.5], [0, 0.8, 0.78], DARK);
    k.box(g, [0.8, 0.14, 0.4], [0, 0.4, 0.82], PAL.fire, undefined, PAL.fire, 2.2);
    cb(k, g, [1.3, 0.3, 0.4], [0, 1.45, 0.92], STONE, undefined, 0.05);
    cb(k, g, [2.6, 0.2, 2.1], [0, 2.1, 0], STONE, undefined, 0.05);
    k.mesh(g, taper(2.2, 1.8, 1.0, 0.9, 0.8, 0, -0.2), BRICK_D, [0, 2.6, 0]);
    cb(k, g, [0.85, 1.5, 0.8], [0, 3.75, -0.2], BRICK, undefined, 0.04);
    cb(k, g, [1.05, 0.22, 1.0], [0, 4.55, -0.2], STONE_D, undefined, 0.04);
    k.box(g, [0.55, 0.05, 0.5], [0, 4.67, -0.2], 0x2a0c04, undefined, 0xff5a1a, 0.9);
    // Bellows on a stand (right) and a coal heap (left).
    cb(k, g, [0.5, 0.5, 0.6], [1.6, 0.25, 0.1], WOOD_D, undefined, 0.03);
    k.mesh(g, wedge(0.9, 0.34, 0.6), PAL.leather, [1.6, 0.68, 0.1], [0, Math.PI / 2, 0.1]);
    k.box(g, [0.5, 0.08, 0.08], [1.25, 0.72, 0.1], IRON);
    for (let i = 0; i < 6; i++) chunk(k, g, 30 + i, [0.34, 0.26, 0.3], [-1.55 + (i % 3) * 0.2, 0.3 + Math.floor(i / 3) * 0.15, 0.2 - (i % 2) * 0.35], COAL, i);
    return (() => {
      const f = flame(k, g, 0, 0.45, 0.82, 0.75);
      const l = light(g, 0xff7a30, 10, 8, 1);
      l.position.set(0, 1, 1.8);
      return { obj: g, light: l, tick: (t: number) => { f(t); l.intensity = 9 + Math.sin(t * 11) * 1.5; } };
    })();
  },
  anvil: (k, g) => {
    // The Great Anvil (concept: docs/concepts/anvil.jpg): one forged solid on a single tree stump, nothing under the
    // stump. The iron is one mesh (anvilIron): wide feet, a narrow waist, the body flaring out of it
    // with a square heel and the hardy hole, one long flat face, a small step down and the horn, flat
    // on top and keeled beneath, tapering to its point. Before 'Reforge the Great Anvil' it is
    // rust-brown, cracked across the face and down the flank, the horn snapped off short, on an old
    // grey stump. Reforged: dark iron with a polished face and a bar at working heat on it, on a new
    // stump bound with an iron band, the hammer leaning against it.
    const cracked = new THREE.Group(), reforged = new THREE.Group();
    g.add(cracked, reforged);
    reforged.visible = false;
    const top = 0.64; // the stump's top: the anvil's feet stand here
    k.mesh(cracked, anvilStump(3, top), 0x5a4a3a, [0, 0, 0]);
    k.mesh(reforged, anvilStump(7, top), WOOD_L, [0, 0, 0]);
    const [cIron, cFace, cMarks] = anvilIron(true);
    k.mesh(cracked, cIron, RUSTY, [0, top, 0]);
    k.mesh(cracked, cFace, RUSTY_L, [0, top, 0]);
    k.mesh(cracked, cMarks, DARK, [0, top, 0]);
    const [rIron, rFace, rMarks] = anvilIron(false);
    k.mesh(reforged, rIron, IRON, [0, top, 0]);
    k.mesh(reforged, rFace, IRON_L, [0, top, 0]);
    k.mesh(reforged, rMarks, DARK, [0, top, 0]);
    // The new stump's iron band, with two rivets facing the smith.
    k.cyl(reforged, 0.53, 0.53, 0.09, [0, 0.32, 0], IRON, undefined, 14);
    for (const a of [-0.45, 0.45]) cb(k, reforged, [0.06, 0.06, 0.04], [Math.sin(a) * 0.54, 0.32, Math.cos(a) * 0.54], IRON, [0, a, Math.PI / 4], 0.01);
    // A bar at working heat on the face; the hammer leaning on the stump, ready.
    cb(k, reforged, [0.42, 0.06, 0.1], [0.02, top + ANVIL_FACE + 0.03, 0.02], 0xffb050, [0, 0.12, 0], 0.01, PAL.fire, 2.4);
    cb(k, reforged, [0.06, 0.66, 0.06], [0.52, 0.34, 0.3], WOOD_L, [0, 0, 0.35], 0.01);
    cb(k, reforged, [0.14, 0.14, 0.26], [0.63, 0.08, 0.3], IRON, [0, 0, 0.35], 0.02);
    return {
      obj: g,
      setState: (s) => {
        reforged.visible = s === 'restored';
        cracked.visible = s !== 'restored';
      },
    };
  },
  // ─── Keep dressing (roadsides, yards, gardens) ─────────────────────────────
  /** A post-and-rail fence along local X, `len` long. */
  fence: (k, g, arg) => {
    const L = Math.max(1.5, arg ?? 6), n = Math.max(1, Math.round(L / 1.6));
    for (let i = 0; i <= n; i++) {
      const x = -L / 2 + (i * L) / n;
      cb(k, g, [0.18, 1.1, 0.18], [x, 0.55, 0], WOOD_D, [0, 0, (hash01(i, 5) - 0.5) * 0.06], 0.03);
      k.mesh(g, taper(0.18, 0.18, 0.06, 0.06, 0.12), WOOD_D, [x, 1.16, 0]);
    }
    // Each rail one straight length nailed along the posts' faces from end to end.
    for (const y of [0.45, 0.88]) cb(k, g, [L + 0.1, 0.1, 0.08], [0, y, 0.1], WOOD, undefined, 0.02);
  },
  /**
   * The forge yard's lean-to: a shingled roof on four squared posts on stone pads, built to stand
   * against a wall on its back (-Z) side, sloping down toward the front (+Z), with a deep front
   * beam and knee braces; the Emberforge's chimney rises through it at the back. Kept high and
   * shallow so the hearth under it stays in view of the high camera.
   */
  forge_canopy: (k, g) => {
    const W = 7.0, D = 3.0, back = 3.6, front = 3.2;
    for (const x of [-W / 2 + 0.2, W / 2 - 0.2]) for (const z of [-D / 2 + 0.2, D / 2 - 0.2]) {
      const h = z < 0 ? back : front;
      cb(k, g, [0.5, 0.2, 0.5], [x, 0.1, z], STONE_D, undefined, 0.04);
      cb(k, g, [0.24, h, 0.24], [x, h / 2, z], WOOD_D, undefined, 0.03);
      if (z > 0) for (const e of [-1, 1]) if ((x < 0 && e > 0) || (x > 0 && e < 0)) cb(k, g, [0.9, 0.14, 0.14], [x + e * 0.38, front - 0.42, z], WOOD_D, [0, 0, e * 0.7], 0.02);
    }
    cb(k, g, [W + 0.2, 0.3, 0.26], [0, front - 0.1, D / 2 - 0.2], WOOD, undefined, 0.03);
    cb(k, g, [W + 0.2, 0.26, 0.26], [0, back - 0.1, -D / 2 + 0.2], WOOD, undefined, 0.03);
    for (const x of [-W / 2 + 0.2, W / 2 - 0.2]) cb(k, g, [0.2, 0.2, D], [x, (front + back) / 2 + 0.02, 0], WOOD, [Math.atan2(back - front, D), 0, 0], 0.02);
    const slope = Math.atan2(back - front, D), run = (D + 0.9) / Math.cos(slope);
    cb(k, g, [W + 0.7, 0.16, run], [0, (front + back) / 2 + 0.2, 0.15], 0x9a5438, [slope, 0, 0], 0.03);
    cb(k, g, [W + 0.75, 0.12, 0.2], [0, front + 0.06, D / 2 + 0.55], 0x7a4a34, [slope, 0, 0], 0.02);
  },
  /** A memorial: a stele on three steps with a bronze dragon crest, an undying flame before it. */
  memorial: (k, g) => {
    cb(k, g, [3.0, 0.24, 3.0], [0, 0.12, 0], STONE_DD, undefined, 0.05);
    cb(k, g, [2.3, 0.24, 2.3], [0, 0.36, 0], STONE_D, undefined, 0.05);
    cb(k, g, [1.6, 0.24, 1.2], [0, 0.6, -0.2], STONE, undefined, 0.05);
    k.mesh(g, taper(1.1, 0.46, 0.92, 0.38, 2.2), STONE_L, [0, 1.82, -0.2]);
    cb(k, g, [1.2, 0.22, 0.56], [0, 3.02, -0.2], STONE, undefined, 0.05);
    k.mesh(g, taper(0.9, 0.42, 0.2, 0.2, 0.36), STONE, [0, 3.31, -0.2]);
    // The crest: a bronze diamond with spread wings, and a dark tablet of names below it.
    k.box(g, [0.44, 0.44, 0.06], [0, 2.35, 0.0], 0xb07a3a, [0, 0, Math.PI / 4]);
    for (const e of [-1, 1]) k.mesh(g, wedge(0.5, 0.2, 0.05), 0xb07a3a, [e * 0.38, 2.42, 0.0], [0, 0, e * -0.35]);
    k.box(g, [0.66, 0.66, 0.04], [0, 1.45, 0.01], 0x4a4440);
    for (let i = 0; i < 4; i++) k.box(g, [0.46 - (i % 2) * 0.12, 0.04, 0.02], [0, 1.66 - i * 0.14, 0.04], 0xc8b890);
    // The undying flame in a bowl on the top step.
    k.mesh(g, taper(0.36, 0.36, 0.56, 0.56, 0.22), IRON, [0, 0.83, 0.65]);
    k.box(g, [0.46, 0.04, 0.46], [0, 0.93, 0.65], 0x4a1c0c, undefined, PAL.fire, 0.6);
    return { obj: g, tick: flame(k, g, 0, 0.92, 0.65, 0.55) };
  },
  /**
   * A low stone parapet along local X (`arg` = length): a solid breast wall on a weathered base
   * course under a dressed coping, all the castle's stone, standing straight on the rock's lip (no
   * built footing under it: the rock masses rise to meet the road; worldView).
   */
  parapet: (k, g, arg) => {
    const L = Math.max(2, arg ?? 6);
    cb(k, g, [L + 0.2, 0.24, 0.9], [0, 0.12, 0], BASE, undefined, 0.04);
    cb(k, g, [L, 0.62, 0.62], [0, 0.55, 0], ASHLAR, undefined, 0.04);
    cb(k, g, [L + 0.12, 0.14, 0.78], [0, 0.93, 0], DRESS, undefined, 0.03);
  },
  /**
   * An open balustrade along local X, `len` long (its outer face toward +Z like the parapet's): a
   * plinth running down into the rock, turned balusters of pale stone, a dressed handrail.
   */
  balustrade: (k, g, arg) => {
    // Open: slender pale balusters well apart under a narrow slate rail, so the drop and the sky show
    // through between them from the play camera.
    // (A narrow plinth and rail, so from above the pale balusters and the gaps between them show.)
    const L = Math.max(1, lenOf(arg) ?? 4);
    k.mesh(g, taper(L + 0.1, 1.0, L + 0.1, 0.34, 2.4, 0, -0.33), ASHLAR_W, [0, -1.2, 0.33]);
    cb(k, g, [L + 0.1, 0.16, 0.34], [0, 0.08, 0], DRESS, undefined, 0.03);
    const n = Math.max(2, Math.round(L / 0.42));
    for (let i = 0; i < n; i++) {
      const u = -L / 2 + (L * (i + 0.5)) / n;
      k.cyl(g, 0.07, 0.1, 0.66, [u, 0.49, 0], ASHLAR_L, undefined, 8);
      k.mesh(g, new THREE.IcosahedronGeometry(0.13, 0), ASHLAR_L, [u, 0.4, 0]);
    }
    cb(k, g, [L + 0.12, 0.1, 0.18], [0, 0.87, 0], DRESS, undefined, 0.02);
  },
  /**
   * A low dressed wall kerbing one side of a sloping road, one continuous piece from its foot to its
   * head: along `opt.pts` ([x, z] corners relative to the prop, which stands at height 0) with its
   * top `opt.ys` (each corner's road level) and mitred at every bend, so it follows the road's grade
   * in one even slope with no step or seam: cream ashlar on a slate base under a blue-grey coping,
   * and on its open side (`opt.out`: +1 left of its run, -1 right) a battered retaining face of the
   * castle's honey ashlar running down into the ground beside the road.
   */
  /**
   * The paving of a sloping road laid as one surface along `opt.pts` ([x, z] relative to the prop,
   * which stands at height 0), `opt.w` wide, its top at `opt.ys` at each point: flagstones running
   * edge to edge between the walls that kerb it, no step or jag anywhere along it, laid in the castle
   * paving's own stones (paved). With `opt.sill` its head is finished with a threshold: a course of
   * dressed stones laid square across the road over the joint with the paving beyond, a hair proud of
   * both.
   */
  ramp_paving: (k, g, arg) => {
    const o = (arg?.opt ?? {}) as { pts?: number[][]; ys?: number[]; w?: number; sill?: number };
    const pts = (o.pts ?? [[-2, 0], [2, 0]]).map(([x, z]) => new THREE.Vector2(x, z)), ys = o.ys ?? pts.map(() => 0), w = o.w ?? 4;
    const band = slopedBand(pts, ys.map((y) => y - 0.4), ys, w);
    Object.assign(band.userData.lay, { stone: 2 / 3, row: 1 / 3 });
    k.mesh(g, band, PAVE, [0, 0, 0]);
    if (o.sill) {
      const end = pts[pts.length - 1], d = end.clone().sub(pts[pts.length - 2]).normalize(), across = new THREE.Vector2(-d.y, d.x), top = ys[ys.length - 1] + 0.03;
      const n = Math.max(2, Math.round(w / 0.9)), sw = w / n;
      for (let i = 0; i < n; i++) {
        const c = end.clone().addScaledVector(across, -w / 2 + sw * (i + 0.5));
        cb(k, g, [sw, 0.3, 0.6], [c.x, top - 0.15, c.y], DRESS, [0, Math.atan2(-across.y, across.x), 0], 0.03);
      }
    }
  },
  ramp_wall: (k, g, arg) => {
    const o = (arg?.opt ?? {}) as { pts?: number[][]; ys?: number[]; tops?: number[] };
    const pts = (o.pts ?? [[-2, 0], [2, 0]]).map(([x, z]) => new THREE.Vector2(x, z)), ys = o.ys ?? pts.map(() => 0);
    // (Its coping stands 0.76 over the road, or level with higher ground behind it (`opt.tops`), so
    // the bank it holds back meets its top.)
    const tops = o.tops ?? ys.map((y) => y + 0.76);
    const at = (dy: number) => ys.map((y) => y + dy), top = (dy: number) => tops.map((y) => y + dy);
    // (Its weathered foot runs straight down into the ground under it, never out to one side, so
    // nothing of it shows through the rock beside the road.)
    k.mesh(g, slopedBand(pts, at(-5.0), at(0.4), 0.62), BASE, [0, 0, 0]);
    k.mesh(g, slopedBand(pts, at(0.38), top(-0.1), 0.48), ASHLAR, [0, 0, 0]);
    k.mesh(g, slopedBand(pts, top(-0.12), tops, 0.6), DRESS, [0, 0, 0]);
  },
  /**
   * A pier closing the end of a parapet run: a square shaft of the castle's cream on a weathered
   * base, a moulded dressed cap and a low pyramid of stone on top.
   */
  parapet_pier: (k, g, arg) => {
    // `v`: 0 a low stone pyramid on top, 1 a small urn with a gilt cap, 2 a lantern.
    const v = vOf(arg), z = 0;
    // (Its base course at the parapet's own height, standing on the ground: nothing of it hangs
    // below, down a cliff face.)
    cb(k, g, [1.2, 0.24, 1.2], [0, 0.12, z], BASE, undefined, 0.03);
    cb(k, g, [0.95, 1.0, 0.95], [0, 0.72, z], ASHLAR, undefined, 0.04);
    cb(k, g, [1.15, 0.16, 1.15], [0, 1.26, z], DRESS, undefined, 0.03);
    if (v === 1) {
      k.mesh(g, taper(0.26, 0.26, 0.4, 0.4, 0.14), ASHLAR_L, [0, 1.41, z]);
      k.mesh(g, taper(0.4, 0.4, 0.7, 0.7, 0.42), ASHLAR_L, [0, 1.69, z]);
      cb(k, g, [0.76, 0.08, 0.76], [0, 1.94, z], DRESS, undefined, 0.02);
      ball(k, g, 0.3, [0, 2.12, z], 0x4a7a34);
      k.mesh(g, new THREE.OctahedronGeometry(0.1, 1), PAL.gold, [0, 2.48, z]);
    } else if (v === 2) {
      cb(k, g, [0.42, 0.08, 0.42], [0, 1.38, z], LAMP_NAVY, undefined, 0.02);
      k.box(g, [0.32, 0.42, 0.32], [0, 1.64, z], 0xffcf86, undefined, 0xffa038, 1.4);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(g, [0.05, 0.46, 0.05], [dx * 0.17, 1.64, z + dz * 0.17], LAMP_NAVY);
      k.mesh(g, taper(0.5, 0.5, 0.1, 0.1, 0.22), LAMP_NAVY, [0, 1.96, z]);
      k.mesh(g, new THREE.OctahedronGeometry(0.08, 1), PAL.gold, [0, 2.14, z]);
    } else k.mesh(g, taper(0.95, 0.95, 0.12, 0.12, 0.42), ASHLAR_L, [0, 1.55, z]);
  },
  /**
   * A kerb along local X, `len` long: one border of stones 0.5 wide standing 0.05 proud of the paving,
   * edging a walk, the paving's stone a shade darker. `v` 1: an inlay band instead, of the castle's
   * dressed stone and flush, laid across a walk.
   */
  kerb: (k, g, arg) => {
    const L = Math.max(0.5, lenOf(arg) ?? 4), inlay = vOf(arg) === 1;
    if (inlay) k.mesh(g, laidRun(L, 0.6, 0.1, Math.max(1, Math.round(L / 0.9)), 11), DRESS, [0, -0.03, 0]);
    else k.mesh(g, laidRun(L, 0.5, 0.12, Math.max(1, Math.round(L / (2 * KERB_W))), 13), KERB, [0, -0.01, 0]);
  },
  /**
   * The kerbs round a round plaza, radius `len`: in each quarter one continuous kerb (like a walk's,
   * flush with the paving) that comes in along the straight kerb at `opt.d0` off the X axis (from
   * `opt.x0` off the Z axis, where that kerb stops), turns onto the circle and follows it round to `opt.xc` off
   * the Z axis, turns square across to the straight kerb at `opt.d1` and runs out along it to `opt.x1`,
   * where that kerb takes over: each lawn's edge one kerb, its corners square, never a sharp wedge.
   */
  kerb_ring: (k, g, arg) => {
    const r = lenOf(arg) ?? 10, o = (arg?.opt ?? {}) as { d0?: number; d1?: number; x0?: number; xc?: number; x1?: number };
    const d0 = o.d0 ?? 2, d1 = o.d1 ?? 9, x0 = o.x0 ?? r + 0.5, xc = o.xc ?? 5, x1 = o.x1 ?? xc + 0.6, n = 16;
    const a0 = Math.asin(d0 / r), a1 = Math.acos(xc / r);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const pts = [
        new THREE.Vector2(sx * x0, sz * d0),
        ...Array.from({ length: n + 1 }, (_, i) => {
          const a = a0 + ((a1 - a0) * i) / n;
          return new THREE.Vector2(sx * r * Math.cos(a), sz * r * Math.sin(a));
        }),
        new THREE.Vector2(sx * xc, sz * d1),
        new THREE.Vector2(sx * x1, sz * d1),
      ];
      // (Laid in the walks' kerb stones, one continuous border round the curve; for the audit, each
      // quarter's stretches are one kerb.)
      k.mesh(g, laidBand(pts, KERB_W, 0.12, 2 * KERB_W, sx * 2 + sz + 5), KERB, [0, -0.06, 0]).userData.audit = { band: sx * 2 + sz };
    }
  },
  /**
   * A round paved terrace of radius `len` (its threshold toward +Z): flagstones laid radially in two
   * rings round a round centre stone, flush on a dark bed, a kerb all round broken only for a pale
   * threshold stone where a path comes in.
   */
  round_terrace: (k, g, arg) => {
    const R = lenOf(arg) ?? 2.2, r0 = R * 0.3, r1 = R * 0.64, r2 = R - 0.3;
    // (Laid flush with the ground round it, so whatever stands on it stands on its stones.)
    k.cyl(g, R - 0.25, R - 0.25, 0.05, [0, -0.07, 0], FLAG_D, undefined, 32);
    k.cyl(g, r0 - 0.03, r0 - 0.03, 0.08, [0, -0.04, 0], ASHLAR_L, undefined, 12);
    // Each flagstone cut to its sector of the ring, a fine joint between it and the next.
    for (const [ra, rb, n, off] of [[r0, r1, 8, 0], [r1, r2, 14, 0.5]] as const) {
      for (let i = 0; i < n; i++) {
        const a = ((i + off) / n) * Math.PI * 2, da = Math.PI / n - 0.012 / ((ra + rb) / 2);
        const arcPts = Array.from({ length: 5 }, (_, j) => a + da - (2 * da * j) / 4);
        const outline = [new THREE.Vector2(Math.sin(a - da) * (ra + 0.012), Math.cos(a - da) * (ra + 0.012)), ...arcPts.reverse().map((t) => new THREE.Vector2(Math.sin(t) * (rb - 0.012), Math.cos(t) * (rb - 0.012))), new THREE.Vector2(Math.sin(a + da) * (ra + 0.012), Math.cos(a + da) * (ra + 0.012))];
        k.mesh(g, flatSlab(outline, 0.08), (i + n) % 3 ? FLAG : FLAG_D, [0, -0.08, 0]);
      }
    }
    // The kerb all round in one curved piece, open only for the threshold stone where the path comes in.
    const rk = R - 0.12;
    {
      const a0 = 0.32, kp = Array.from({ length: 41 }, (_, j) => a0 + ((Math.PI * 2 - 2 * a0) * j) / 40).map((t) => new THREE.Vector2(Math.sin(t) * rk, Math.cos(t) * rk));
      k.mesh(g, laidBand(kp, 0.3, 0.12, 0.6, 3), KERB, [0, -0.06, 0]);
    }
    cb(k, g, [1.3, 0.08, 0.42], [0, -0.04, rk], ASHLAR_L, undefined, 0.03);
  },
  /** A plain stone bench (facing +Z): a thick slab seat on two blocks, in the castle's stone. */
  stone_bench: (k, g) => {
    for (const x of [-0.65, 0.65]) cb(k, g, [0.32, 0.42, 0.46], [x, 0.21, 0], ASHLAR_W, undefined, 0.04);
    cb(k, g, [1.8, 0.14, 0.56], [0, 0.49, 0], ASHLAR_L, undefined, 0.03);
  },
  /**
   * Ivy or a climbing rose against a wall (its back on z = 0, growing up its +Z face): leafy masses
   * hugging the face, dense at the foot and thinning upward to a ragged top, `len` wide. `v` 0 ivy
   * (up to 4.5 high), 1 roses on a faint trellis (up to 3 high) with pink and white blooms. `bend`
   * the growth round a drum of that radius (the wall curving away behind it).
   */
  wall_climber: (k, g, arg) => {
    const L = Math.max(1.5, lenOf(arg) ?? 4), rose = vOf(arg) === 1, R: number | undefined = typeof arg === 'object' ? arg?.bend : undefined;
    const top = rose ? 5.0 : 4.8, LEAF = rose ? CLIMBER_ROSE_LEAF : CLIMBER_IVY, seed = Math.round(L * 10) + (rose ? 7 : 0);
    // On a straight wall the climber's foot stands clear of the deep base course; above it the sheet
    // steps back to lie on the wall face itself.
    const hug = (y: number) => (R || y < BASE_COURSE ? 0 : -0.2);
    /** How far the face falls back at u along it (round a drum). */
    const sag = (u: number) => (R ? R - Math.sqrt(Math.max(0, R * R - u * u)) : 0);
    const turn = (u: number) => Math.asin(Math.max(-1, Math.min(1, u / (R ?? 1e9))));
    // Woody stems first: a few leaders climbing from the foot, branching out, under the leaves.
    const leaders = Math.max(2, Math.round(L / 1.2));
    for (let i = 0; i < leaders; i++) {
      // (Kept inside the leaf sheet: in its middle and short of its ragged top, so no bare stem shows.)
      const u0 = (-L / 2 + (L * (i + 0.5)) / leaders) * 0.6, h = top * (0.35 + 0.2 * hash01(seed, i, 9));
      const u1 = u0 * 0.8 + (hash01(seed, i, 8) - 0.5) * 0.3;
      limb(k, g, [u0, 0.05, 0.02 - sag(u0)], [u1, h, 0.02 + hug(h) - sag(u1)], [0.07, 0.05, 0.03, 0.02], WOOD_D);
    }
    // The roses' trellis: a few slender posts and two rails fixed to the wall, all inside the sheet.
    if (rose) {
      for (let i = 0; i <= 2; i++) {
        const u = (-L / 2 + 0.3 + (i * (L - 0.6)) / 2) * 0.5;
        cb(k, g, [0.05, top * 0.5, 0.05], [u, top * 0.25, -0.1 - sag(u)], WOOD_D, undefined, 0.01);
      }
      for (const y of [top * 0.2, top * 0.42]) cb(k, g, [L * 0.5, 0.05, 0.05], [0, y, 0.0 + hug(y)], WOOD_D, undefined, 0.01);
    }
    // A sheet of small flat leaf cards laid almost flat on the face, overlapping like ivy gripping
    // masonry: dense and wide at the foot, the sheet narrowing and thinning as it climbs into a
    // ragged top of tendrils (each column of leaves reaching its own height). No bush stands off it.
    const STEP = 0.11, cols = Math.max(12, Math.round(L / STEP));
    for (let c = 0; c < cols; c++) {
      const u0 = -L / 2 + (L * (c + 0.5)) / cols, edge = Math.abs(u0) / (L / 2);
      // (Neighbouring columns reach similar heights, so the top breaks into a few tapering tendrils
      // of unbroken leaves rather than a scatter of loose ones.)
      const wave = 0.5 + 0.5 * Math.sin(c * 0.55 + seed) * Math.cos(c * 0.23 + seed * 0.7);
      const h = top * (0.42 + 0.5 * wave + 0.08 * hash01(seed, c)) * (1 - 0.4 * edge * edge);
      for (let y = 0.15 + (c % 2) * STEP * 0.5, j = 0; y < h; y += STEP, j++) {
        const f = y / h;
        // The sheet tapers: toward its top only the middle carries on.
        if (edge > 1 - 0.45 * f * f) continue;
        if (hash01(seed, c, j) > 0.985 - 0.12 * f * f) continue;
        const u = u0 + (hash01(seed + 2, c, j) - 0.5) * 0.07, yy = y + (hash01(seed + 6, c, j) - 0.5) * 0.05;
        const sz = 0.075 + hash01(seed + 1, c, j) * 0.035;
        const m = k.mesh(g, CLIMBER_LEAF, LEAF[Math.floor(hash01(seed + 3, c, j) * LEAF.length)], [u, yy, 0.03 + hash01(seed + 7, c, j) * 0.03 + hug(yy) - sag(u)], [(hash01(seed + 8, c, j) - 0.5) * 0.18, turn(u) + (hash01(seed + 9, c, j) - 0.5) * 0.18, hash01(seed + 5, c, j) * 3]);
        m.scale.set(sz, sz * 1.2, 1);
        if (rose && hash01(seed + 4, c, j) > 0.86) k.gem(g, 0.07, [u, yy + 0.03, 0.1 + hug(yy) - sag(u)], CLIMBER_BLOOM[(c + j) % 3]);
      }
    }
  },
  /** A clipped box hedge along local X, `len` long, with leafy lumps on top. */
  hedge: (k, g, arg) => {
    // v: its height (a low garden hedge by default, a tall clipped yew where it frames a court).
    const L = Math.max(1.2, lenOf(arg) ?? 4), H = vOf(arg) || 0.9, T = H > 1.2 ? 1.0 : 0.9;
    cb(k, g, [L, H, T], [0, H / 2, 0], H > 1.2 ? 0x2f5a28 : 0x3e6a2e, undefined, 0.12);
    for (let x = -L / 2 + 0.45; x < L / 2 - 0.2; x += 0.7) {
      const s = 0.5 + hash01(x, 3) * 0.2;
      cb(k, g, [s + 0.2, 0.3, T - 0.2], [x + (hash01(x, 1) - 0.5) * 0.2, H + 0.05, (hash01(x, 2) - 0.5) * 0.12], hash01(x, 4) > 0.5 ? 0x4a7a34 : 0x44722f, [0, hash01(x) * 0.6, 0], 0.12);
    }
  },
  /** A two-wheeled hand cart loaded with sacks and a crate, its shafts resting on the ground. */
  cart: (k, g) => {
    cb(k, g, [1.3, 0.12, 1.9], [0, 0.72, 0], WOOD, undefined, 0.02);
    for (const x of [-0.62, 0.62]) cb(k, g, [0.08, 0.34, 1.9], [x, 0.93, 0], WOOD_D, undefined, 0.02);
    cb(k, g, [1.3, 0.34, 0.08], [0, 0.93, -0.92], WOOD_D, undefined, 0.02);
    for (const x of [-0.78, 0.78]) {
      k.mesh(g, octagon(0.52, 0.12), WOOD_D, [x, 0.52, -0.1]);
      k.mesh(g, octagon(0.14, 0.16), IRON, [x, 0.52, -0.1]);
    }
    cb(k, g, [1.7, 0.08, 0.08], [0, 0.52, -0.1], IRON, undefined, 0.01);
    for (const x of [-0.5, 0.5]) cb(k, g, [0.09, 0.09, 1.7], [x, 0.42, 1.55], WOOD_D, [-0.42, 0, 0], 0.02);
    cb(k, g, [0.6, 0.5, 0.5], [-0.25, 1.03, -0.4], 0xb09a70, [0, 0.3, 0], 0.18);
    cb(k, g, [0.5, 0.46, 0.46], [0.3, 1.01, 0.1], 0xa08a60, [0, -0.2, 0], 0.18);
    cb(k, g, [0.5, 0.45, 0.5], [-0.2, 1.0, 0.5], WOOD_L, [0, 0.2, 0], 0.04);
  },
  /** A straw archery butt on an easel, rings facing +Z, a pennant flying beside it. */
  target: (k, g) => {
    for (const x of [-0.45, 0.45]) cb(k, g, [0.1, 1.6, 0.1], [x, 0.8, -0.2], WOOD_D, undefined, 0.02);
    cb(k, g, [0.1, 1.5, 0.1], [0, 0.7, -0.6], WOOD_D, [-0.4, 0, 0], 0.02);
    cb(k, g, [1.1, 0.08, 0.1], [0, 0.5, -0.2], WOOD_D, undefined, 0.01);
    k.mesh(g, octagon(0.62, 0.3), 0xc8a858, [0, 1.15, 0], [0, Math.PI / 2, 0]);
    ([[0.5, 0xe8dcc0], [0.36, HERALD_BLUE], [0.2, 0xe8dcc0], [0.09, PAL.gold]] as [number, number][]).forEach(([r, c], i) => {
      k.mesh(g, octagon(r, 0.04), c, [0, 1.15, 0.17 + i * 0.03], [0, Math.PI / 2, 0]);
    });
    for (const [x, y] of [[0.12, 1.25], [-0.2, 1.05]]) cb(k, g, [0.03, 0.03, 0.5], [x, y, 0.45], WOOD_L, [0.1, 0.1, 0], 0.01);
    // A pennant on a pole beside it, so the archers can read the wind.
    cb(k, g, [0.06, 2.4, 0.06], [0.7, 1.2, -0.2], WOOD_D, undefined, 0.01);
    k.mesh(g, wedge(0.04, 0.6, 0.32), HERALD_BLUE, [0.7, 2.22, 0.13], [Math.PI / 2, 0, 0]);
    k.box(g, [0.05, 0.32, 0.08], [0.7, 2.22, -0.17], PAL.gold);
  },
  // ─── Castle gardens ───────────────────────────────────────────────────────────
  /**
   * A flower bed `len` long: a low stone kerb round dark soil, planted in tidy rows of one kind of
   * plant (`v`): 0 tulips in drifts of red, gold and white; 1 rose bushes in pink, red and white; 2
   * lavender; 3 a border of blue delphiniums behind white daisies.
   */
  flower_bed: (k, g, arg) => {
    const L = lenOf(arg) ?? 3.2, v = vOf(arg) % 4, W = 1.3;
    cb(k, g, [L, 0.24, W], [0, 0.12, 0], STONE_L, undefined, 0.04);
    k.box(g, [L - 0.24, 0.06, W - 0.24], [0, 0.25, 0], 0x3a2a1e);
    const soil = new THREE.Group();
    soil.position.y = 0.28;
    g.add(soil);
    if (v === 0) {
      const drift = [0xd8323a, 0xf0b828, 0xf4ece0];
      spread(L, 0.3, 0.25).forEach((x, i, all) => {
        const c = drift[Math.min(2, Math.floor((i / all.length) * 3))];
        [-0.32, 0, 0.32].forEach((z, j) => {
          const xx = x + (j === 1 ? 0.15 : 0);
          if (xx < L / 2 - 0.2) PLANT.tulip(k, soil, xx, z, c, 0.34 + hash01(i, j) * 0.08, i + j);
        });
      });
    } else if (v === 1) {
      const cols = [0xe0507a, 0xc8283a, 0xf4ece0];
      spread(L, 0.62, 0.35).forEach((x, i) => {
        for (const z of [-0.26, 0.26]) {
          const xx = x + (z > 0 ? 0.31 : 0);
          if (xx < L / 2 - 0.3) PLANT.rose(k, soil, xx, z, cols[(i + (z > 0 ? 1 : 0)) % 3], 0.95, i * 1.7 + z);
        }
      });
    } else if (v === 2) {
      spread(L, 0.46, 0.28).forEach((x, i) => {
        for (const z of [-0.25, 0.25]) {
          const xx = x + (z > 0 ? 0.23 : 0);
          if (xx < L / 2 - 0.25) PLANT.lavender(k, soil, xx, z, i * 1.3 + z);
        }
      });
    } else {
      spread(L, 0.48, 0.3).forEach((x, i) => PLANT.delphinium(k, soil, x, -0.24, i % 3 ? 0x4a6ad8 : 0x8a7ae0, 0.62 + hash01(i, 5) * 0.12));
      spread(L, 0.36, 0.25).forEach((x, i) => PLANT.daisy(k, soil, x, 0.3, i * 1.9));
    }
  },
  /** Clipped topiary in a square stone planter (`len`: 0 a ball, 1 a cone). */
  topiary: (k, g, arg) => {
    const cone = (lenOf(arg) ?? 0) === 1, standard = (lenOf(arg) ?? 0) === 2;
    cb(k, g, [0.95, 0.7, 0.95], [0, 0.35, 0], STONE_L, undefined, 0.05);
    if (standard) {
      // A clipped standard: a tall clean stem through a smaller clipped ball to a round head.
      cb(k, g, [1.05, 0.12, 1.05], [0, 0.72, 0], DRESS, undefined, 0.03);
      k.box(g, [0.75, 0.05, 0.75], [0, 0.76, 0], 0x3a2a1e);
      cb(k, g, [0.14, 2.2, 0.14], [0, 1.85, 0], WOOD_D, undefined, 0.02);
      k.mesh(g, new THREE.IcosahedronGeometry(0.42, 1), 0x4a7a34, [0, 1.45, 0]).scale.set(1, 0.85, 1);
      k.mesh(g, new THREE.IcosahedronGeometry(0.78, 1), 0x3e6e2e, [0, 2.95, 0]);
      return;
    }
    cb(k, g, [1.05, 0.12, 1.05], [0, 0.72, 0], STONE, undefined, 0.03);
    k.box(g, [0.75, 0.05, 0.75], [0, 0.76, 0], 0x3a2a1e);
    if (cone) {
      k.mesh(g, taper(0.95, 0.95, 0.12, 0.12, 1.9), 0x3e6e2e, [0, 0.78 + 0.95, 0]);
      cb(k, g, [0.7, 0.5, 0.7], [0, 1.05, 0], 0x4a7a34, [0, 0.4, 0], 0.2);
    } else {
      cb(k, g, [0.18, 0.5, 0.18], [0, 1.0, 0], WOOD_D, undefined, 0.02);
      cb(k, g, [1.05, 1.0, 1.05], [0, 1.65, 0], 0x4a7a34, [0, 0.4, 0], 0.32);
      cb(k, g, [0.9, 0.9, 0.9], [0, 1.68, 0], 0x3e6e2e, [0, 1.2, 0], 0.3);
    }
  },
  /**
   * The bailey's centrepiece (facing +Z, toward the gate): a round basin, its wall and moulded coping
   * each one continuous ring of stone (outer radius 5.6) on a low plinth step round a clear pool, a
   * pedestal at its heart and the bronze dragon sitting guard on it, its open jaws pouring the one
   * stream of water into the pool; foam, spray and rings spread where the water lands.
   */
  dragon_fountain: (k, g) => {
    const RO = 5.6, RI = 4.9, H = 0.75, WY = 0.8, S = 2.35, time = { value: 0 };
    // The plinth step, the basin's wall and its coping, each one course laid round the pool in flat
    // stones (a basin's wall is no more bent than a tower's), the coping's joints over the wall's.
    const basin = new THREE.Group(), n = drumStones(RO);
    basin.position.y = 0.2;
    g.add(basin);
    drum(k, g, { r: 6.1, y0: 0, y1: 0.2, n: drumStones(6.1), course: 0.2 }, STONE_D);
    drum(k, basin, { r: RO, rIn: RI, y0: 0, y1: H, n, course: H }, STONE);
    drum(k, basin, { r: RO + 0.1, rIn: RI - 0.1, y0: H, y1: H + 0.14, n, course: H, turn: Math.PI / n, bond: false }, STONE_L);
    // The basin floor, dark under the water so the pool has depth.
    k.cyl(g, RI, RI, 0.1, [0, 0.15, 0], 0x1a2e30, undefined, 48);
    // The dragon's pedestal, carved in the castle's own stone: an octagonal drum of cream ashlar
    // rising out of the water from a blue-grey plinth, a gilt inscription band round it and a
    // moulded blue-grey coping under the dragon's feet.
    k.cyl(g, 2.75, 2.95, 1.0, [0, 0.5, 0], BASE, [0, Math.PI / 8, 0], 8);
    k.cyl(g, 2.45, 2.45, 0.5, [0, 1.25, 0], ASHLAR, [0, Math.PI / 8, 0], 8);
    k.cyl(g, 2.47, 2.47, 0.14, [0, 1.12, 0], GILT, [0, Math.PI / 8, 0], 8);
    k.cyl(g, 2.7, 2.62, 0.16, [0, 1.56, 0], DRESS, [0, Math.PI / 8, 0], 8);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, rr = 2.45 * Math.cos(Math.PI / 8) + 0.02;
      k.box(g, [0.16, 0.16, 0.04], [Math.sin(a) * rr, 1.12, Math.cos(a) * rr], PAL.gold, [0, a, Math.PI / 4]);
    }
    // The dragon sitting guard on the pedestal, its jaws open over the front of the pool.
    const beast = new THREE.Group();
    beast.position.y = 1.64;
    beast.scale.setScalar(S);
    const jaw = sentinelDragon(k, beast).multiplyScalar(S).add(beast.position);
    g.add(beast);
    // The one stream, from the jaws into the pool.
    const impacts: Impact[] = [[0, 4.4, 1]];
    const sheets: [THREE.Vector3[], number, number, number][] = [[pour(jaw, new THREE.Vector3(0, WY, 4.4), 0.7, 28), 0.16, 0.42, 51]];
    for (const [pts, w0, w1, seed] of sheets) {
      const { geo, len } = crossedRibbons(pts, w0, w1);
      const m = new THREE.Mesh(geo, fallingWaterMaterial(time, seed, len, w1));
      m.name = 'fountain-stream';
      m.renderOrder = 2;
      g.add(m);
    }
    // The pool mirrors the dragon and its rock over it (a mirror of only the fountain's own layer).
    const at = new THREE.Vector3();
    const refl = planarReflection(() => water.getWorldPosition(at).y, MIRROR_LAYER);
    const water = new THREE.Mesh(new THREE.CircleGeometry(RI + 0.02, 48).rotateX(-Math.PI / 2), poolWater(time, RI, impacts, refl));
    water.position.y = WY;
    water.name = 'fountain-pool';
    water.renderOrder = 1;
    g.add(water);
    let layered = false;
    water.onBeforeRender = (renderer, scene, camera) => {
      if (!layered) {
        g.traverse((o) => o !== water && (o as THREE.Mesh).isMesh && o.layers.enable(MIRROR_LAYER));
        layered = true;
      }
      refl.render(renderer, scene, camera, water);
    };
    // Where the jaw stream lands: a churn of foam on the water, heaving foam, drifting spray.
    const foamDisc = new THREE.Mesh(brokenFoam(91, 1.0, 11, 0.75), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    foamDisc.position.set(0, WY + 0.03, 4.4);
    foamDisc.name = 'foam-spread';
    foamDisc.material.userData.decal = foamDisc.material.userData.noOcclude = true;
    foamDisc.renderOrder = 3;
    g.add(foamDisc);
    const spray: THREE.Sprite[] = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.SpriteMaterial({ map: mistTexture(), color: 0xe8f2f4, transparent: true, depthWrite: false, opacity: 0.3 });
      const sp = new THREE.Sprite(m);
      sp.name = 'spray';
      sp.renderOrder = 4;
      g.add(sp);
      spray.push(sp);
    }
    return {
      obj: g,
      tick: (t) => {
        time.value = t;
        foamDisc.scale.setScalar(1 + 0.08 * Math.sin(t * 2.3));
        foamDisc.rotation.y = 0.25 * Math.sin(t * 0.6);
        // Spray puffs rise from the landing, swell and fade, one after another.
        spray.forEach((sp, i) => {
          const p = (t * 0.55 + i / spray.length) % 1;
          sp.position.set(Math.sin(i * 2.1) * 0.25, WY + 0.25 + p * 0.9, 4.4 + Math.cos(i * 2.1) * 0.2);
          sp.scale.setScalar(0.7 + p * 1.1);
          sp.material.opacity = 0.32 * Math.sin(p * Math.PI);
        });
      },
    };
  },
  /**
   * One of the two pavilions framing the great door, standing forward of the hall's facade (its back
   * at -Z runs into the hall's wall): a square tower 4 wide rising a storey above the hall's parapet,
   * a lancet on each storey of its front, string courses level with the hall's, quoins standing proud
   * at its front corners and a crenellated crown on a course stepped out from its walls. Its twin
   * across the axis is identical, so the door stands between two equal masses.
   */
  pavilion: (k, g, arg) => {
    // (Its back stands inside the hall's front wall, short of the wall's inner face.)
    const W = lenOf(arg) ?? 4, D0 = -0.9, D1 = 2.1, H = 13.6, d = D1 - D0, zc = (D0 + D1) / 2, cf = crownFoot(H);
    // The deep base course, the walling, and string courses level with the hall's (the floor line and
    // the course under its parapet), all on the course lines, so its courses run on into the hall's
    // front; its front corners turn on quoins standing proud.
    deep(cb(k, g, [W + 0.6, BASE_COURSE, d + 0.3], [0, BASE_COURSE / 2, zc + 0.15], BASE, undefined, 0.05));
    // Lancets on the two upper storeys (the ground floor is left blank behind the champion that
    // stands before it), each sill clear over its string course and its head well under the next. The
    // lower one a real window (the castle's glazing kit, glazedWindow): its opening through the front
    // wall and a small lit chamber behind it on the floor line's course, the walling and that course
    // laid round both.
    // (The chamber's floor on the floor line, its ceiling a hair under the next course; the cavity's
    // floor and ceiling a hair off the course lines, so no two faces meet in one plane there.)
    const sill = 5.75, wh = 2.2, [floorY, ceilY] = PAVILION_COURSES;
    const win = glazedWindow(k, g, 0, sill, D1, { w: 0.82, h: wh, T: 0.6, stone: ASHLAR_B, room: { w: 2.6, d: 1.39, floor: sill - floorY, ceil: ceilY - 0.02 - sill - wh } });
    carved(k, g, [W, cf - COURSE - BASE_COURSE, d], [0, (BASE_COURSE + cf - COURSE) / 2, zc], ASHLAR_B, [win.hole, win.cavity]);
    // The string courses stand proud of the front and sides, their backs just inside the walling's; the
    // lower one cut back round the chamber, its cut faces just inside the walling round the cavity.
    const cav = win.cavity!, inset = { ...cav, x0: cav.x0 - 0.005, x1: cav.x1 + 0.005, z0: cav.z0 - 0.005, z1: cav.z1 + 0.005 };
    carved(k, g, [W + 0.12, COURSE, d + 0.03], [0, floorY + COURSE / 2, zc + 0.045], DRESS, [inset]);
    cb(k, g, [W + 0.12, COURSE, d + 0.03], [0, ceilY + COURSE / 2, zc + 0.045], DRESS, undefined, 0.03);
    lancet(k, g, 0, 9.75, D1, 0.82, 2.2);
    quoins(k, g, { x0: -W / 2, x1: W / 2, z0: D0, z1: D1 }, [[-1, 1], [1, 1]], BASE_COURSE, cf - COURSE, ASHLAR_B, PAVILION_COURSES.map((y): [number, number] => [y, y + COURSE]));
    // The course that carries the crown, stepped out from the walls, the crown standing flush on it two
    // courses high under its coping, the leads on it and merlons round its edge.
    cb(k, g, [W + 0.6, COURSE, d + 0.4], [0, cf - COURSE / 2, zc + 0.2], DRESS, undefined, 0.03);
    cb(k, g, [W + 0.6, 2 * COURSE, d + 0.4], [0, cf + COURSE, zc + 0.2], ASHLAR_B, undefined, 0.04);
    cb(k, g, [W + 0.7, 0.14, d + 0.5], [0, cf + 2 * COURSE + 0.07, zc + 0.2], DRESS, undefined, 0.03);
    k.box(g, [W - 0.4, 0.06, d - 0.4], [0, cf + 2 * COURSE + 0.15, zc], DECK);
    for (const u of spread(W, 1.45, 0.55)) cb(k, g, [0.78, 0.72, 0.5], [u, cf + 2 * COURSE + 0.5, D1 + 0.15], Math.abs(u) < 0.1 ? ASHLAR_L : ASHLAR_B, undefined, 0.04);
    for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) cb(k, g, [0.5, 0.72, 0.72], [sx * (W / 2 + 0.02), cf + 2 * COURSE + 0.5, D0 + 0.6 + i * 1.5], ASHLAR_B, undefined, 0.04);
  },
  /**
   * A gate through a stretch of full-height curtain (the ward's gates in the inner curtain), the
   * passage `len` wide under a pointed arch of dressed voussoirs with a hood mould on both faces, the
   * blue leaves standing open in the reveal on the ward side, a lantern either side of the arch on its
   * bailey (+Z) face (the ward face stays plain) and the curtain's wall walk carried on over it.
   */
  ward_gate: (k, g, arg) => gateway(k, g, lenOf(arg) ?? 4, { door: -1, lanterns: [1] }),
  /**
   * The postern: a narrow gate `len` wide through a stretch of full-height curtain under a pointed
   * arch of pale dressed stone on both faces, its blue leaves standing open in the reveal on the
   * bailey side, three steps out
   * onto the belvedere and a lantern either side of the arch on both faces.
   */
  postern: (k, g, arg) => gateway(k, g, lenOf(arg) ?? 2, { door: 1, steps: true, lanterns: [-1, 1] }),
  /**
   * The round stair turret east of the great door (radius `len`, its platform at `v` + 1.4): the
   * donjon's answer across the axis, so the door is framed by two round masses. Built in the
   * donjon's own language (a deep battered base course, cream ashlar, courses at the donjon's
   * heights, slits climbing with the stair, two lancets toward the court), a gilt frieze and the
   * towers' crown, and a blue-slate spire a stage lower than the door tower's.
   */
  door_turret: (k, g, arg) => {
    const r = lenOf(arg) ?? 2.1, H = vOf(arg) || 11, N = 16, P = H + 1.4;
    drumFoot(k, g, r, r + 0.5, r + 0.15);
    drum(k, g, { r, y0: BASE_COURSE, y1: P, n: drumStones(r) }, ASHLAR);
    for (const y of [5, 9]) drumCourse(k, g, r, 0.06, y);
    drumFrieze(k, g, 0, 0, r, crownFoot(P) - 1.5 * COURSE, N);
    crown(k, g, 0, 0, r, P, N, false);
    spire(k, g, 0, P + 0.9, 0, r + 0.1, r * 2.3, N, 1, 1.1);
    const step = (Math.PI * 2) / N;
    // (Between the courses, never crossed by one.)
    for (const y of [2.3, 6.2]) {
      const face = new THREE.Group();
      face.position.set(Math.sin(step / 2) * r, 0, Math.cos(step / 2) * r);
      face.rotation.y = step / 2;
      g.add(face);
      lancet(k, face, 0, y, 0.02, 0.44, 1.9, true, 0.5);
    }
    for (const [a, y] of [[2.5, 3.0], [3.5, 6.2], [4.5, 8.4], [-2.5, 3.6], [-3.5, 7.2]]) {
      const t = a * step;
      k.box(g, [0.16, 0.9, 0.1], [Math.sin(t) * (r + 0.02), y, Math.cos(t) * (r + 0.02)], DARK, [0, t, 0]);
    }
  },
  /**
   * The paddock's field shelter `len` wide (open to +Z, its back to -Z): a stone lean-to under a flat stone roof
   * behind a low crenellated parapet, like the stable range; three open bays between stone piers, a
   * hay rack along the back wall, straw on the floor.
   */
  field_shelter: (k, g, arg) => {
    const W = lenOf(arg) ?? 6.8, D = 2.6, H = 3.0;
    // (The side walls stand against the back wall's ends, not through them.)
    cb(k, g, [W, H, 0.5], [0, H / 2, -D / 2 + 0.25], ASHLAR, undefined, 0.04);
    for (const sx of [-1, 1]) cb(k, g, [0.5, H, D - 0.5], [sx * (W / 2 - 0.25), H / 2, 0.25], ASHLAR, undefined, 0.04);
    for (const sx of [-1, 1]) cb(k, g, [0.5, H, 0.5], [sx * 1.15, H / 2, D / 2 - 0.25], ASHLAR, undefined, 0.04);
    // The flat stone roof one course of the dressed stone, the parapet a course over it, its merlons.
    cb(k, g, [W + 0.3, COURSE, D + 0.3], [0, H + COURSE / 2, 0.05], DRESS, undefined, 0.03);
    cb(k, g, [W + 0.4, COURSE, 0.36], [0, H + 1.5 * COURSE, D / 2 + 0.05], ASHLAR, undefined, 0.03);
    for (const sx of [-1, 1]) cb(k, g, [0.36, COURSE, D - 0.03], [sx * (W / 2 + 0.02), H + 1.5 * COURSE, -0.115], ASHLAR, undefined, 0.03);
    // Merlons at one even spacing round the whole parapet (along its front and back along both
    // returns), so it reads as one crenellated top, never a stub with a lone merlon.
    for (let i = 0; i < 6; i++) cb(k, g, [0.6, 0.5, 0.4], [-W / 2 + 0.3 + (i * (W - 0.6)) / 5, H + 2.5 * COURSE, D / 2 + 0.05], ASHLAR, undefined, 0.04);
    for (const sx of [-1, 1]) for (const z of [-D / 2 + 0.3, 0.05]) cb(k, g, [0.4, 0.5, 0.6], [sx * (W / 2 + 0.02), H + 2.5 * COURSE, z], ASHLAR, undefined, 0.04);
    for (const sx of [-1, 1]) cb(k, g, [W - 0.8, 0.22, 0.12], [0, sx > 0 ? 0.9 : 0.12, -D / 2 + 0.56], WOOD_D, undefined, 0.02);
    // The hay rack: slats leaning out from the back wall over a manger, hay heaped in it.
    for (let i = 0; i < 12; i++) cb(k, g, [0.06, 1.0, 0.06], [-W / 2 + 0.9 + (i * (W - 1.8)) / 11, 1.6, -D / 2 + 0.75], WOOD, [0.35, 0, 0], 0.01);
    cb(k, g, [W - 1.6, 0.1, 0.1], [0, 2.1, -D / 2 + 0.95], WOOD_D, undefined, 0.02);
    for (let i = 0; i < Math.floor((W - 1.6) / 1.05); i++) chunk(k, g, 950 + i, [1.1, 0.5, 0.5], [-W / 2 + 1.3 + i * 1.05, 1.35, -D / 2 + 0.68], 0xd8b45a, i);
    cb(k, g, [W - 1.0, 0.5, 0.5], [0, 0.25, -D / 2 + 0.75], WOOD_D, undefined, 0.03);
    for (let i = 0; i < 3; i++) chunk(k, g, 960 + i, [1.3, 0.12, 0.9], [-1.5 + i * 1.5, 0.06, 0.4], 0xc8a048, i * 0.7);
  },
  /**
   * A field gate between two square stone piers (2.5 apart, centred on x = 0) with ball finials; the
   * timber gate stands open, swung a quarter turn into the field (toward -Z).
   */
  gate_piers: (k, g) => {
    for (const sx of [-1, 1]) {
      cb(k, g, [0.7, 0.2, 0.7], [sx * 1.25, 0.1, 0], STONE_D, undefined, 0.03);
      cb(k, g, [0.56, 1.5, 0.56], [sx * 1.25, 0.95, 0], STONE_L, undefined, 0.04);
      cb(k, g, [0.7, 0.14, 0.7], [sx * 1.25, 1.75, 0], STONE, undefined, 0.03);
      ball(k, g, 0.24, [sx * 1.25, 2.02, 0], STONE_L);
    }
    const leaf = new THREE.Group();
    // Swung open a quarter turn into the field (toward -Z), standing square to the fence, clear of its rails.
    leaf.position.set(-0.95, 0, -0.12);
    leaf.rotation.y = Math.PI / 2;
    g.add(leaf);
    for (const y of [0.35, 0.75, 1.1]) cb(k, leaf, [1.9, 0.1, 0.07], [0.95, y, 0], WOOD, undefined, 0.02);
    for (const x of [0.05, 1.85]) cb(k, leaf, [0.1, 1.2, 0.09], [x, 0.7, 0], WOOD_D, undefined, 0.02);
    cb(k, leaf, [0.1, 1.9, 0.07], [0.95, 0.72, 0], WOOD, [0, 0, Math.atan2(0.75, 1.8)], 0.02);
  },
  /**
   * A rose pergola over a seat (facing +Z): three pointed timber arches on posts, joined by rails and
   * slats, climbing roses in pink and white clusters over the top and down the posts, a lantern hung
   * under the middle arch, a seat inside at the back with a trellis behind it.
   */
  pergola: (k, g) => {
    const W = 3.2, D = 1.6, H = 2.3, LEAF = [0x3e6e2e, 0x4a7a34, 0x56883c], ROSE = [0xe0507a, 0xf08aa8, 0xf6eee2];
    // Each arch springs from its posts' tops and rises a unit to its point.
    const { arc, ys } = pointedArch(W, 1 / 0.62, 6), lift = H - ys;
    for (const z of [-D / 2, 0, D / 2]) {
      for (const sx of [-1, 1]) {
        cb(k, g, [0.3, 0.14, 0.3], [sx * W / 2, 0.07, z], STONE_L, undefined, 0.03);
        cb(k, g, [0.14, H + 0.02, 0.14], [sx * W / 2, H / 2, z], WOOD_D, undefined, 0.02);
        for (let i = 0; i < arc.length - 1; i++) {
          const a = arc[i], b = arc[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
          cb(k, g, [len + 0.05, 0.13, 0.13], [sx * (a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + lift, z], WOOD_D, [0, 0, sx > 0 ? ang : Math.PI - ang], 0.01);
        }
      }
    }
    const top = (x: number) => lift + (() => {
      const ax = Math.abs(x);
      for (let i = 0; i < arc.length - 1; i++) if (ax <= arc[i][0] && ax >= arc[i + 1][0]) {
        const t = (arc[i][0] - ax) / (arc[i][0] - arc[i + 1][0] || 1);
        return arc[i][1] + (arc[i + 1][1] - arc[i][1]) * t;
      }
      return arc[arc.length - 1][1];
    })();
    for (let i = 0; i < 7; i++) {
      const x = -W / 2 + 0.2 + (i * (W - 0.4)) / 6;
      cb(k, g, [0.07, 0.07, D + 0.3], [x, top(x) + 0.06, 0], WOOD, undefined, 0.01);
    }
    for (const sx of [-1, 1]) cb(k, g, [0.08, 0.08, D], [sx * W / 2, H - 0.05, 0], WOOD, undefined, 0.01);
    // The seat at the back and a trellis behind it.
    for (const z of [-0.5, -0.32]) cb(k, g, [2.3, 0.08, 0.16], [0, 0.48, z], WOOD_L, undefined, 0.02);
    for (const x of [-1.05, 1.05]) cb(k, g, [0.12, 0.46, 0.4], [x, 0.23, -0.4], WOOD_D, undefined, 0.02);
    for (let i = 0; i < 7; i++) cb(k, g, [0.05, H - 0.3, 0.05], [-W / 2 + 0.3 + (i * (W - 0.6)) / 6, (H - 0.3) / 2 + 0.15, -D / 2], WOOD, undefined, 0.01);
    for (const y of [0.9, 1.5, 2.0]) cb(k, g, [W - 0.2, 0.05, 0.05], [0, y, -D / 2], WOOD, undefined, 0.01);
    // Roses: soft leafy masses along the arches' crowns and twining up the posts, bloom clusters in them.
    // (Every bloom sits in a leafy mass, so none hangs in the air.)
    for (let i = 0; i < 9; i++) {
      const x = -W / 2 + 0.15 + (i * (W - 0.3)) / 8, z = (hash01(i, 3) - 0.5) * (D + 0.2), r = 0.42 + hash01(i, 5) * 0.12;
      ball(k, g, r, [x, top(x) + 0.2, z], LEAF[i % 3], [1.2, 0.7, 1.1]);
      for (let j = 0; j < 3; j++) {
        const a = hash01(i, j + 9) * Math.PI * 2;
        k.gem(g, 0.075, [x + Math.cos(a) * r * 0.6, top(x) + 0.2 + r * 0.45, z + Math.sin(a) * r * 0.55], ROSE[(i + j) % 3]);
      }
    }
    for (const sx of [-1, 1]) for (const z of [-D / 2, D / 2]) for (let j = 0; j < 3; j++) {
      ball(k, g, 0.24, [sx * (W / 2 + 0.06), 0.5 + j * 0.62, z + 0.05], LEAF[j % 3], [1, 1.4, 1]);
      k.gem(g, 0.08, [sx * (W / 2 + 0.2), 0.58 + j * 0.62, z + 0.16], ROSE[(j + (sx > 0 ? 1 : 0)) % 3]);
    }
    // The lantern hung under the middle arch on a short chain: warm glass in a navy cage under a
    // little hood, a gold cap and finial.
    const ly = top(0) - 0.72;
    for (let i = 0; i < 4; i++) k.box(g, [0.035, 0.09, 0.035], [0, top(0) - 0.06 - i * 0.09, 0], LAMP_NAVY, [0, (i % 2) * (Math.PI / 2), 0]);
    k.mesh(g, new THREE.OctahedronGeometry(0.05, 0), PAL.gold, [0, ly + 0.36, 0]);
    k.mesh(g, taper(0.32, 0.32, 0.08, 0.08, 0.14), LAMP_NAVY, [0, ly + 0.25, 0]);
    cb(k, g, [0.3, 0.05, 0.3], [0, ly + 0.16, 0], PAL.gold, undefined, 0.01);
    k.box(g, [0.2, 0.26, 0.2], [0, ly, 0], 0xffcf86, undefined, 0xffa038, 1.4);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(g, [0.04, 0.3, 0.04], [dx * 0.11, ly, dz * 0.11], LAMP_NAVY);
    cb(k, g, [0.26, 0.05, 0.26], [0, ly - 0.15, 0], LAMP_NAVY, undefined, 0.01);
  },
  /** Reeds in a clump at the waterline: slim leaning blades, a few with brown cattail heads. */
  reeds: (k, g) => {
    for (let i = 0; i < 11; i++) {
      const a = hash01(i, 1) * Math.PI * 2, r = hash01(i, 2) * 0.6, h = 0.9 + hash01(i, 3) * 0.8;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, lean = (hash01(i, 4) - 0.5) * 0.4;
      limb(k, g, [x, -0.1, z], [x + lean, h, z + lean * 0.6], [0.06, 0.04, 0.01, 0.01], i % 3 ? 0x5a7a34 : 0x6e8a3e);
      if (i % 4 === 0) cb(k, g, [0.08, 0.26, 0.08], [x + lean * 0.8, h * 0.82, z + lean * 0.5], 0x6a4a2a, [lean * 0.4, 0, 0], 0.02);
    }
  },
  /**
   * A rounded stone breaking a stream's surface (the water flowing toward +Z), a smaller one beside
   * it, and a short trail of broken foam drifting downstream from them.
   */
  stream_stone: (k, g, arg) => {
    const sd = Math.round((lenOf(arg) ?? 1) * 7);
    chunk(k, g, 980 + sd, [0.75, 0.62, 0.62], [0, -0.66, 0], 0x7a7470, hash01(sd, 1) * 3);
    chunk(k, g, 981 + sd, [0.42, 0.42, 0.38], [0.5 * (hash01(sd, 2) > 0.5 ? 1 : -1), -0.7, 0.25], 0x6a6466, hash01(sd, 3) * 3);
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
    m.userData.decal = m.userData.noOcclude = true;
    const f = new THREE.Mesh(brokenFoam(200 + sd, 0.55, 6, 0.6), m);
    f.position.set(0, -0.255, 0.55);
    f.scale.set(0.8, 1, 1.5);
    f.renderOrder = 3;
    g.add(f);
  },
  /**
   * Water spilling off the island's edge (flowing toward +Z): it curls over the lip in a widening sheet
   * and falls away into the Veil, fading as it drops, mist drifting up off it. `v` 0: the end of a
   * stream; 1: a spring breaking out at the brink of the castle rock from a mossy cleft between
   * rounded masses of the rock, ferns and moss over them, falling the rock's whole height.
   */
  edge_fall: (k, g, arg) => {
    const time = { value: 0 }, spring = vOf(arg) === 1;
    const ROCK = 0x5e6572, ROCK_D = 0x4e5462, MOSS = [0x5a7a34, 0x66863a, 0x4e6e30];
    const pts = pour(new THREE.Vector3(0, -0.25, -0.6), new THREE.Vector3(0, spring ? -26 : -18, spring ? 5.5 : 4.5), 0.05, 30);
    const { geo, len } = crossedRibbons(pts, spring ? 1.6 : 2.2, 4.2);
    const fall = new THREE.Mesh(geo, fallingWaterMaterial(time, 83, len, 4.2, true));
    fall.name = 'waterfall';
    fall.renderOrder = 2;
    g.add(fall);
    if (spring) {
      // The cleft: rounded masses either side of the spout and a broad one over its head, wet and
      // dark round the water, moss over their crowns and ferns along the lip.
      for (const sx of [-1, 1]) {
        chunk(k, g, 980 + sx, [1.8, 1.7, 2.0], [sx * 1.45, -0.5, -0.9], sx < 0 ? ROCK : ROCK_D, sx * 0.4);
        chunk(k, g, 982 + sx, [1.1, 0.9, 1.2], [sx * 2.4, -0.4, -0.1], ROCK_D, -sx * 0.5);
        ball(k, g, 0.55, [sx * 1.45, 1.15, -0.95], MOSS[(sx + 1) / 2], [1.4, 0.4, 1.3]);
        ball(k, g, 0.3, [sx * 2.4, 0.45, -0.1], MOSS[2], [1.3, 0.45, 1.2]);
      }
      chunk(k, g, 984, [2.4, 1.3, 1.6], [0, 0.2, -1.9], ROCK, 0.1);
      chunk(k, g, 985, [1.2, 0.5, 0.9], [0, -0.45, -0.75], ROCK_WET, 0);
      ball(k, g, 0.7, [0, 1.42, -1.9], MOSS[1], [1.6, 0.4, 1.1]);
      for (const [x, z, r] of [[-0.8, -0.35, 0.22], [0.75, -0.3, 0.2], [-2.0, 0.35, 0.18], [1.9, 0.4, 0.2]]) ball(k, g, r, [x, 0.0, z], MOSS[Math.abs(Math.round(x * 3)) % 3], [1.5, 0.5, 1.3]);
    } else for (const sx of [-1, 1]) chunk(k, g, 970 + sx, [0.9, 0.5, 0.8], [sx * 1.5, -0.35, -0.2], ROCK, sx);
    const mist: THREE.Sprite[] = [];
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTexture(), color: 0xf2f4f8, transparent: true, depthWrite: false, opacity: 0.3 }));
      sp.name = 'spray';
      sp.renderOrder = 4;
      g.add(sp);
      mist.push(sp);
    }
    return {
      obj: g,
      tick: (t) => {
        time.value = t;
        mist.forEach((sp, i) => {
          const p = (t * 0.12 + i / mist.length) % 1;
          sp.position.set(Math.sin(i * 2.3) * 1.2, -3 - i * (spring ? 3.6 : 2.2) + p * 2.5, 1.2 + i * (spring ? 0.7 : 0.5));
          sp.scale.setScalar(2.5 + p * 3);
          sp.material.opacity = 0.32 * Math.sin(p * Math.PI);
        });
      },
    };
  },
  /** A low clipped box hedge along local X, `len` long, 0.5 high and 0.5 thick (parterre edging). */
  /**
   * A clipped box border along an outline (`opt.pts`: [x, z] corners relative to the prop, closed into
   * a loop when `opt.closed`): one continuous low hedge, mitred at every corner and ending square, its
   * clipped top a shade lighter, each laid as one extruded shape so no two pieces of box ever overlap.
   */
  box_border: (k, g, arg) => {
    const o = (arg?.opt ?? {}) as { pts?: number[][]; closed?: boolean };
    const pts = (o.pts ?? [[-1, 0], [1, 0]]).map(([x, z]) => new THREE.Vector2(x, z));
    k.mesh(g, mitredBand(pts, !!o.closed, 0.5, 0.44, 0.05), 0x3e6a2e, [0, 0, 0]);
    k.mesh(g, mitredBand(pts, !!o.closed, 0.4, 0.08), 0x4a7a34, [0, 0.44, 0]);
  },
  /**
   * An ornamental garden tree on a straight clean trunk, its crown built of leafy blocks like the
   * island's other trees (`v`: 0 a clipped standard, one squared head; 1 pink blossom, 2 golden, 3 a
   * fruit tree hung with apples, each a big block with smaller ones swelling out of it), in a square
   * stone planter when `len` is 1. About 4.6 tall, the crown about 3 across. Blossom drops a few
   * petals on the ground round its foot.
   */
  garden_tree: (k, g, arg) => {
    const v = vOf(arg) % 4, potted = lenOf(arg) === 1;
    const pal = GARDEN_LEAF[v];
    const y0 = potted ? 0.62 : 0;
    if (potted) {
      cb(k, g, [1.5, 0.55, 1.5], [0, 0.28, 0], ASHLAR_L, undefined, 0.05);
      cb(k, g, [1.62, 0.12, 1.62], [0, 0.58, 0], DRESS, undefined, 0.03);
      k.box(g, [1.25, 0.05, 1.25], [0, 0.6, 0], 0x3a2a1e);
    }
    // (The trunk runs on up into the crown, so the head sits on it.)
    k.mesh(g, taper(0.3, 0.3, 0.18, 0.18, 2.7), WOOD_D, [0, y0 + 1.35, 0]);
    cb(k, g, [0.4, 0.22, 0.4], [0, y0 + 0.11, 0], WOOD_D, [0, 0.4, 0], 0.08);
    const cy = y0 + 3.1;
    if (v === 0) {
      // A clipped standard: one squared head of close-clipped green, a smaller block crowning it.
      cb(k, g, [2.2, 1.9, 2.2], [0, cy, 0], pal[1], [0, 0.3, 0], 0.32);
      cb(k, g, [1.5, 0.7, 1.5], [0, cy + 1.05, 0], pal[2], [0, 0.75, 0], 0.22);
      cb(k, g, [1.3, 0.5, 2.3], [0, cy - 0.55, 0], pal[0], [0, 1.1, 0], 0.18);
      return;
    }
    // A full head of bloom (or leaf): one big block with smaller ones swelling out of it, each its own
    // shade and turned a little, a little leaf showing under the blossom.
    cb(k, g, [2.4, 1.6, 2.4], [0, cy + 0.1, 0], pal[0], [0, 0.2, 0], 0.26);
    const lobes: V3[] = [[0.85, -0.1, 0.4], [-0.8, 0.0, 0.45], [0.25, 0.05, -0.85], [-0.4, -0.2, 0.9], [0.1, 0.7, 0.1], [-0.65, 0.4, -0.5], [0.7, 0.45, -0.4]];
    lobes.forEach(([x, y, z], i) => {
      const s = 1.15 + hash01(i, v) * 0.35;
      cb(k, g, [s, s * 0.78, s], [x, cy + y, z], pal[(i % 2) + 1], [0, hash01(i, 7) * 1.2, 0], 0.18);
    });
    if (v !== 3) for (const [x, y, z] of [[0.75, -0.62, -0.3], [-0.65, -0.58, -0.4], [0.05, -0.7, 0.65]] as V3[]) cb(k, g, [0.9, 0.55, 0.9], [x, cy + y, z], GARDEN_LEAF[3][1], [0, x, 0], 0.14);
    if (v === 3) {
      // Apples on the outside of the crown.
      for (let i = 0; i < 16; i++) {
        const a = hash01(i, 11) * Math.PI * 2, b = (hash01(i, 12) - 0.35) * 1.2, r = 1.4;
        k.gem(g, 0.11, [Math.cos(a) * Math.cos(b) * r, cy + Math.sin(b) * r * 0.85, Math.sin(a) * Math.cos(b) * r], i % 3 ? 0xc8342a : 0xe8a030);
      }
      return;
    }
    // Fallen petals on the ground (or the planter's soil) round its foot.
    for (let i = 0; i < (potted ? 5 : 12); i++) {
      const a = hash01(i, 21) * Math.PI * 2, r = potted ? 0.25 + hash01(i, 22) * 0.35 : 0.4 + hash01(i, 22) * 0.8;
      k.box(g, [0.12, 0.02, 0.09], [Math.cos(a) * r, y0 + 0.03, Math.sin(a) * r], pal[1 + (i % 2)], [0, a, 0]);
    }
  },
  /** A garden bench (facing +Z): an oak seat and back on stone ends. */
  garden_bench: (k, g) => {
    for (const x of [-0.9, 0.9]) {
      cb(k, g, [0.22, 0.44, 0.5], [x, 0.22, 0], STONE_L, undefined, 0.04);
      cb(k, g, [0.16, 0.5, 0.12], [x, 0.7, -0.2], STONE_L, undefined, 0.03);
    }
    for (const z of [-0.12, 0.08]) cb(k, g, [2.1, 0.08, 0.18], [0, 0.48, z], WOOD_L, undefined, 0.02);
    for (const y of [0.72, 0.9]) cb(k, g, [2.0, 0.12, 0.06], [0, y, -0.22], WOOD_L, [-0.12, 0, 0], 0.02);
  },
  /** A great stone urn on a square pedestal, spilling flowers over its rim. */
  urn: (k, g) => {
    // In the castle's stone: a blue-grey plinth, a cream pedestal and bowl, blue-grey mouldings; a
    // clipped box ball standing in the bowl (like the cour's topiary), a ring of flowers round it.
    cb(k, g, [1.0, 0.18, 1.0], [0, 0.09, 0], BASE, undefined, 0.03);
    cb(k, g, [0.78, 0.7, 0.78], [0, 0.53, 0], ASHLAR, undefined, 0.04);
    cb(k, g, [0.92, 0.12, 0.92], [0, 0.94, 0], DRESS, undefined, 0.03);
    k.mesh(g, taper(0.32, 0.32, 0.5, 0.5, 0.18), ASHLAR_L, [0, 1.09, 0]);
    k.mesh(g, taper(0.5, 0.5, 1.0, 1.0, 0.62), ASHLAR_L, [0, 1.49, 0]);
    cb(k, g, [1.08, 0.12, 1.08], [0, 1.84, 0], DRESS, undefined, 0.03);
    ball(k, g, 0.52, [0, 2.36, 0], 0x4a7a34);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      cb(k, g, [0.14, 0.12, 0.14], [Math.sin(a) * 0.44, 1.97, Math.cos(a) * 0.44], [0xd8486a, 0xf4ece0, 0xe86aa8][i % 3], [0, a, 0], 0.04);
    }
  },
  /**
   * The great door's two leaves, boarded, studded and iron-strapped, standing open inward from the jambs
   * of an opening `len` wide (hinged at its edges, the prop on the wall's inner face).
   */
  great_doors: (k, g, arg) => {
    // The hall's great door: two leaves standing open into the hall, boarded in the stained oak and
    // strapped in iron like every castle door, a ring at the hero's hand on each face.
    const W = lenOf(arg) ?? 4, hw = DOORS.great.w, H = DOORS.great.h, a = 1.15;
    for (const sx of [-1, 1]) {
      const leaf = new THREE.Group();
      leaf.position.set(sx * (W / 2 - 0.1), 0, 0);
      leaf.rotation.y = sx < 0 ? a : Math.PI - a;
      g.add(leaf);
      royalLeaf(k, leaf, hw, H, 'great', 0.14);
    }
  },
  /** A sundial: a dressed stone baluster with a bronze dial and its gnomon. */
  sundial: (k, g) => {
    cb(k, g, [1.1, 0.2, 1.1], [0, 0.1, 0], STONE_D, undefined, 0.03);
    k.mesh(g, taper(0.56, 0.56, 0.36, 0.36, 0.7), STONE_L, [0, 0.55, 0]);
    k.mesh(g, taper(0.36, 0.36, 0.6, 0.6, 0.2), STONE_L, [0, 1.0, 0]);
    cb(k, g, [0.78, 0.1, 0.78], [0, 1.15, 0], STONE, undefined, 0.02);
    k.mesh(g, octagon(0.32, 0.04), 0x8c6a3e, [0, 1.22, 0], [0, 0, Math.PI / 2]);
    k.mesh(g, wedge(0.04, 0.24, 0.42), 0x8c6a3e, [0, 1.36, 0]);
  },
  /**
   * A horse in the castle's blocky style (facing +Z, `v` its coat: chestnut, bay or grey): a deep
   * squared barrel, four straight block legs on dark hooves, a thick neck carried up and forward, a
   * long squared head with a dark muzzle, ears, eyes, a dark mane and forelock and a tail falling
   * from the rump; `len` 1 grazing, its neck and head down to the grass.
   */
  horse: (k, g, arg) => {
    const graze = lenOf(arg) === 1, v = vOf(arg) % 3, coat = [0x8a5430, 0x4a3024, 0xb8aea2][v], dark = 0x231812;
    const shade = new THREE.Color(coat).multiplyScalar(0.84).getHex(), muzzle = v === 2 ? 0x6a625a : 0x2e2018;
    // The barrel, the chest and the rump, squared and chunky.
    cb(k, g, [0.6, 0.6, 1.5], [0, 1.28, 0], coat, undefined, 0.1);
    cb(k, g, [0.56, 0.5, 0.34], [0, 1.24, 0.74], shade, undefined, 0.08);
    cb(k, g, [0.64, 0.56, 0.5], [0, 1.34, -0.6], coat, undefined, 0.1);
    // Four straight legs, a darker shade below the knee, on dark hooves.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * 0.19, z = sz * 0.58;
      cb(k, g, [0.17, 0.5, 0.2], [x, 0.78, z], coat, undefined, 0.03);
      cb(k, g, [0.14, 0.5, 0.16], [x, 0.32, z], shade, undefined, 0.02);
      cb(k, g, [0.18, 0.12, 0.22], [x, 0.06, z + 0.02], dark, undefined, 0.02);
    }
    // The neck, carried up and forward from the shoulders (or down to the grass), the mane along it.
    const nb: V3 = [0, 1.48, 0.66], nt: V3 = graze ? [0, 0.82, 1.18] : [0, 2.12, 1.02];
    const nl = Math.hypot(nt[1] - nb[1], nt[2] - nb[2]), na = Math.atan2(nt[2] - nb[2], nt[1] - nb[1]);
    const nc: V3 = [0, (nb[1] + nt[1]) / 2, (nb[2] + nt[2]) / 2];
    cb(k, g, [0.3, nl + 0.2, 0.42], nc, coat, [na, 0, 0], 0.08);
    const back = graze ? 1 : -1;
    cb(k, g, [0.1, nl + 0.05, 0.12], [0, nc[1] + 0.16 * (graze ? -0.6 : 0.6), nc[2] + back * 0.2], dark, [na, 0, 0], 0.02);
    // The head: long and squared, tilted nose-down, a dark muzzle, ears, eyes and forelock.
    const hd = new THREE.Group();
    hd.position.set(0, nt[1] + (graze ? -0.18 : 0.04), nt[2] + (graze ? 0.12 : 0.2));
    hd.rotation.x = graze ? 1.25 : 0.5;
    g.add(hd);
    cb(k, hd, [0.28, 0.3, 0.64], [0, 0, 0.12], coat, undefined, 0.06);
    cb(k, hd, [0.26, 0.24, 0.18], [0, -0.03, 0.47], muzzle, undefined, 0.05);
    if (v === 0) k.box(hd, [0.08, 0.02, 0.36], [0, 0.155, 0.2], 0xf0e6d8);
    for (const sx of [-1, 1]) {
      cb(k, hd, [0.07, 0.16, 0.06], [sx * 0.08, 0.21, -0.12], coat, [0, 0, sx * 0.15], 0.02);
      k.box(hd, [0.03, 0.05, 0.06], [sx * 0.145, 0.06, 0.02], dark);
      k.box(hd, [0.03, 0.03, 0.03], [sx * 0.06, -0.06, 0.565], dark);
    }
    cb(k, hd, [0.14, 0.06, 0.16], [0, 0.17, -0.02], dark, undefined, 0.02);
    // The tail falling from the rump.
    cb(k, g, [0.13, 0.78, 0.15], [0, 1.16, -0.86], dark, [0.26, 0, 0], 0.03);
  },
  /**
   * The spring's fall (`len` above the pool, its back to -Z against the castle rock): the water
   * breaks out of a mossy cleft in a shoulder of rock partway down the face, ferns and moss round its
   * lip and the rock dark and wet below it, falls onto a ledge where it splashes, and drops again in
   * a wider, fraying sheet into the pool, churning foam that spreads in rings, mist rising off it.
   */
  spring_fall: (k, g, arg) => {
    const Y = lenOf(arg) ?? 10, time = { value: 0 };
    const ROCK = 0x5e6572, ROCK_D = 0x4e5462, WET = ROCK_WET, FERN = [0x5e7e34, 0x6c8c3c, 0x7a9a46];
    /**
     * A cushion of moss draped over a ledge: broad flat lobes run together along it, sunk into the
     * rock and spilling a little over its front, never a row of round buttons.
     */
    const cushion = (x: number, y: number, z: number, w: number, seed: number) => {
      const n = Math.max(2, Math.round(w / 0.32));
      for (let i = 0; i < n; i++) {
        const u = x - w / 2 + (w * (i + 0.5)) / n + (hash01(seed, i, 4) - 0.5) * 0.12, r = 0.2 + hash01(seed, i) * 0.12;
        ball(k, g, r, [u, y - 0.04 + (hash01(seed, i, 2) - 0.6) * 0.06, z + (hash01(seed, i, 3) - 0.5) * 0.14], FERN[Math.abs(i + seed) % 3], [1.5, 0.45, 1.2]);
        if (hash01(seed, i, 5) > 0.55) ball(k, g, r * 0.7, [u + 0.05, y - 0.2, z + 0.26], FERN[Math.abs(i + seed + 1) % 3], [1.1, 0.9, 0.5]);
      }
    };
    /** Ivy trailing down a face from a crack: a few lumps at its root and a strand of small leaves hugging the rock below. */
    const trail = (x: number, y: number, z: number, len: number, seed: number) => {
      cushion(x, y, z, 0.35, seed);
      for (let j = 0; j < Math.round(len / 0.16); j++) {
        const dx = (hash01(seed, j, 7) - 0.5) * 0.12 + Math.sin(j * 1.3 + seed) * 0.05;
        k.box(g, [0.15, 0.15, 0.04], [x + dx, y - 0.12 - j * 0.16, z + 0.02], FERN[Math.abs(j + seed) % 3], [0, 0, hash01(seed, j) * 1.5]);
      }
    };
    const cY = Y * 0.6, ledge = Y * 0.3;
    // The shoulder of rock the spring breaks out of: big blocks either side running up to the road's
    // lip, overhanging rock over the cleft, and down the middle a band of wet, dark rock half again
    // as wide as the fall, mossy along its edges.
    for (const sx of [-1, 1]) {
      chunk(k, g, 930 + sx, [1.7, Y - 0.5, 2.8], [sx * 1.7, -0.3, -1.6], sx < 0 ? ROCK : ROCK_D, sx * 0.12);
      chunk(k, g, 934 + sx, [1.2, cY * 0.7, 1.6], [sx * 1.35, -0.3, -0.5], ROCK_D, sx * 0.3);
    }
    chunk(k, g, 937, [2.4, Y - cY - 1.6, 2.2], [0.1, cY + 1.1, -1.8], ROCK_D, 0.08);
    chunk(k, g, 938, [2.2, cY + 0.6, 1.4], [0, -0.3, -1.85], WET, 0);
    for (const [x, y0, y1, z] of [[-0.75, 0, cY, -1.15], [0.75, ledge, cY + 0.6, -1.15], [0, cY + 1.0, Y - 1.2, -1.0]]) chunk(k, g, 960 + Math.round(x * 10 + y0), [1.0, y1 - y0, 0.6], [x, y0, z], WET, x * 0.3);
    // The wet band runs on up behind the upper fall to the top of the face, about half again as wide
    // as the fall, moss and ferns along its edges.
    chunk(k, g, 942, [3.0, Y - cY - 1.0, 0.5], [0, cY + 0.7, -1.25], WET, 0.1);
    for (const sx of [-1, 1]) for (const y of [ledge + 0.7, cY - 0.5]) trail(sx * 1.05, y, -0.72, 0.9, 970 + Math.round(y * 10) + sx);
    // The cleft: an irregular V-shaped fissure under overlapping lips of rock, darkening inward (wet
    // rock, then deep shadow at its back, no straight edge anywhere); the water spills over a rounded
    // mossy lip, ferns hanging over its edges.
    for (const sx of [-1, 1]) {
      chunk(k, g, 950 + sx, [0.9, 1.5, 1.0], [sx * 0.62, cY - 0.25, -0.95], ROCK, sx * 0.55);
      chunk(k, g, 952 + sx, [0.7, 0.9, 0.8], [sx * 0.35, cY + 0.75, -1.0], ROCK_D, -sx * 0.4);
    }
    // Inside it the wet rock only darkens by steps (no black box), and spurs of rock stand into the
    // gap from both sides at different heights, so its outline is ragged from the cleft to the ledge.
    chunk(k, g, 954, [0.7, 1.0, 0.5], [0, cY + 0.05, -1.35], 0x3e3a40, 0.2);
    chunk(k, g, 955, [0.4, 0.6, 0.4], [0.05, cY + 0.2, -1.5], 0x302c32, -0.3);
    for (const [x, y, sy, sd] of [[-0.62, ledge + 1.0, 1.3, 957], [0.66, ledge + 1.8, 1.0, 958], [-0.58, cY - 1.5, 0.8, 959], [0.6, ledge + 0.45, 0.7, 961]]) {
      chunk(k, g, sd, [0.62, sy, 0.9], [x, y, -1.1], x < 0 ? ROCK : ROCK_D, x * 0.8);
    }
    chunk(k, g, 956, [1.1, 1.0, 0.9], [0, cY + 1.05, -0.95], ROCK, 0.35);
    // The lip the water spills over: a rounded, water-worn stone with moss draped over its ends.
    chunk(k, g, 939, [1.0, 0.42, 0.9], [0, cY - 0.32, -0.85], WET, 0.1);
    cushion(0, cY + 0.06, -0.66, 0.5, 939);
    // Ivy trailing from the cleft's cracks either side of the spout, flat on the wet rock.
    for (const [x, y, z, l] of [[-0.75, cY + 0.9, -0.5, 1.1], [0.72, cY + 1.0, -0.52, 1.3], [-0.9, cY + 0.15, -0.42, 0.8], [0.88, cY + 0.1, -0.45, 0.9]] as number[][]) trail(x, y, z, l, Math.round(x * 100 + y * 10));
    // Moss seated on the tops of the rock masses over the cleft and at the head of the face (each on
    // the top of the block it grows on, half sunk into it, never floating clear of the stone).
    for (const [x, y, z, w] of [[-0.38, cY + 1.15, -1.0, 0.55], [0.36, cY + 1.15, -1.0, 0.55], [0, Y - 0.75, -1.5, 1.1], [-1.65, Y - 1.08, -1.55, 0.9], [1.65, Y - 1.08, -1.55, 0.9]]) cushion(x, y, z, w, Math.round(x * 10 + y));
    // The ledge the first fall lands on: a chunky shelf of the cliff's own rock, a metre thick, run
    // across between the shoulders and merged into them (their masses lap over its ends), wet and dark
    // on top, its lip rounded and water-worn where the water sheets off it.
    chunk(k, g, 945, [3.3, ledge + 0.3, 1.6], [0, -0.3, -0.55], ROCK_D, 0.05);
    chunk(k, g, 946, [2.9, 1.7, 1.9], [0, ledge - 1.6, 0.1], WET, 0.12);
    round(k, g, [-1.1, ledge - 0.42, 0.5], [1.15, ledge - 0.4, 0.46], 0.44, 0.4, WET, 0.8);
    for (const sx of [-1, 1]) {
      chunk(k, g, 947 + sx, [1.2, ledge + 0.9, 1.7], [sx * 1.35, -0.3, -0.1], ROCK, sx * 0.4);
      chunk(k, g, 941 + sx, [1.1, 1.3, 1.5], [sx * 1.2, ledge - 0.9, 0.1], ROCK_D, -sx * 0.3);
      cushion(sx * 1.2, ledge + 0.38, 0.1, 0.6, 941 + sx);
    }
    // The two drops of one stream: the spout off the cleft's lip falls onto the ledge right at its
    // worn lip and runs straight on over it as the lower fall, the same water the same width where the
    // two meet, spreading only a little as it drops to the pool.
    const brink = new THREE.Vector3(0, ledge + 0.06, 1.04);
    const sheets: [THREE.Vector3[], number, number, number][] = [
      [pour(new THREE.Vector3(0, cY - 0.05, -0.55), brink, 0.25, 18), 0.75, 1.1, 71],
      [pour(brink, new THREE.Vector3(0, -0.2, 1.6), 0.12, 22), 1.1, 1.6, 72],
    ];
    for (const [pts, w0, w1, seed] of sheets) {
      const { geo, len } = crossedRibbons(pts, w0, w1);
      const fall = new THREE.Mesh(geo, fallingWaterMaterial(time, seed, len, w1));
      fall.name = 'waterfall';
      fall.renderOrder = 2;
      g.add(fall);
    }
    // Churning water where the fall lands: patches of broken foam that heave out of step, and broken
    // arcs of foam spreading from the landing and fading, each at its own pace, drifting downstream.
    const foam: THREE.Mesh[] = [];
    const foamAt: [V3, number, number][] = [[[0, -0.22, 1.6], 0.85, 18], [[0.1, -0.215, 2.05], 0.65, 12], [[0, ledge + 0.1, 0.62], 0.45, 8]];
    foamAt.forEach(([at, r, n], i) => {
      const f = new THREE.Mesh(brokenFoam(80 + i, r, n, 0.6), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
      f.position.set(...at);
      f.material.userData.decal = f.material.userData.noOcclude = true;
      f.renderOrder = 3;
      f.name = 'foam';
      g.add(f);
      foam.push(f);
    });
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, opacity: 0.5 });
      m.userData.decal = m.userData.noOcclude = true;
      const ring = new THREE.Mesh(foamArcs(90 + i), m);
      ring.position.set(0, -0.21 + i * 0.002, 1.6);
      ring.rotation.y = i * 2.1;
      ring.name = 'foam-ring';
      ring.renderOrder = 3;
      g.add(ring);
      rings.push(ring);
    }
    const mist: THREE.Sprite[] = [];
    for (let i = 0; i < 7; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTexture(), color: 0xeef6f8, transparent: true, depthWrite: false, opacity: 0.3 }));
      sp.name = 'spray';
      sp.renderOrder = 4;
      g.add(sp);
      mist.push(sp);
    }
    return {
      obj: g,
      tick: (t) => {
        time.value = t;
        foam.forEach((f, i) => {
          f.scale.setScalar(0.9 + 0.15 * Math.sin(t * 3.3 + i * 1.9));
          f.rotation.y = 0.2 * Math.sin(t * 0.7 + i);
        });
        rings.forEach((r, i) => {
          const speed = [0.31, 0.24, 0.37][i], p = (t * speed + i * 0.37) % 1;
          r.scale.setScalar(0.8 + p * (1.8 + i * 0.35));
          r.position.z = 1.6 + p * 0.6;
          (r.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - p) * (1 - p) * Math.min(1, p * 5);
        });
        // A low mist hugging the rock off the foot (big, slow, faint), and a thin fan of spray off
        // the ledge's lip.
        mist.forEach((sp, i) => {
          const foot = i < 5, p = (t * (foot ? 0.25 : 0.6) + i / mist.length) % 1;
          sp.position.set(Math.sin(i * 2.3) * (foot ? 0.8 : 0.35 * (1 + p)), (foot ? -0.1 : ledge - 0.1) + p * (foot ? 1.8 : 0.5), (foot ? 1.35 : 0.95 + p * 0.4) + Math.cos(i * 2.3) * 0.3);
          sp.scale.setScalar((foot ? 1.6 : 0.35) + p * (foot ? 2.2 : 0.5));
          sp.material.opacity = (foot ? 0.22 : 0.14) * Math.sin(p * Math.PI);
        });
      },
    };
  },
  /**
   * A knight in stone on a stepped plinth (facing +Z), the lord's champion: plate armour and a
   * crested helm, a cloak down the back, hands folded on the pommel of a sword planted point down
   * before him, a kite shield leaning at his side.
   */
  champion: (k, g) => {
    // Warm marble on a carved plinth in the castle's stone, the lord's blue and gold on his tabard.
    const S = MARBLE, SD = MARBLE_D, SL = MARBLE_L;
    cb(k, g, [2.0, 0.45, 2.0], [0, 0.225, 0], BASE, undefined, 0.06);
    cb(k, g, [1.6, 0.9, 1.6], [0, 0.9, 0], ASHLAR, undefined, 0.06);
    cb(k, g, [0.9, 0.4, 0.05], [0, 0.9, 0.81], ASHLAR_L, undefined, 0.02);
    k.box(g, [0.24, 0.24, 0.04], [0, 0.9, 0.84], PAL.gold, [0, 0, Math.PI / 4]);
    cb(k, g, [1.75, 0.14, 1.75], [0, 1.42, 0], DRESS, undefined, 0.03);
    const y = 1.49;
    // Legs, knee cops and sabatons.
    for (const s of [-1, 1]) {
      cb(k, g, [0.26, 0.98, 0.3], [s * 0.17, y + 0.5, 0], S, undefined, 0.06);
      cb(k, g, [0.22, 0.16, 0.12], [s * 0.17, y + 0.62, 0.16], SL, undefined, 0.04);
      cb(k, g, [0.28, 0.14, 0.44], [s * 0.17, y + 0.07, 0.07], SD, undefined, 0.04);
    }
    // The tasset skirt, belt and breastplate with its ridge.
    k.mesh(g, taper(0.8, 0.52, 0.62, 0.44, 0.46), S, [0, y + 1.1, 0]);
    cb(k, g, [0.68, 0.1, 0.48], [0, y + 1.34, 0], SD, undefined, 0.03);
    k.mesh(g, taper(0.62, 0.44, 0.84, 0.5, 0.78), S, [0, y + 1.78, 0]);
    k.mesh(g, wedge(0.08, 0.06, 0.7), SL, [0, y + 1.78, 0.25], [Math.PI / 2, 0, 0]);
    // The tabard over the breastplate: the lord's blue falling in two folds, the gold diamond on it.
    for (const sx of [-1, 1]) cb(k, g, [0.27, 0.95, 0.05], [sx * 0.14, y + 1.5, 0.29], sx < 0 ? HERALD_BLUE : HERALD_BLUE_D, [0.05, 0, 0], 0.01);
    k.box(g, [0.2, 0.2, 0.05], [0, y + 1.78, 0.33], PAL.gold, [0, 0, Math.PI / 4]);
    // The cloak hanging down the back from a rolled collar at the shoulders, falling in deep folds
    // (pleats standing out of it at different depths), its hem flaring a little.
    // (Modelled all round: seen from behind on the parterre's walks he shows a full draped cloak in
    // four deep folds over the belt, a clasped collar, the helm's crest and his sword's pommel.)
    k.mesh(g, taper(1.04, 0.24, 0.84, 0.16, 1.9), SD, [0, y + 1.12, -0.32], [-0.06, 0, 0]);
    cb(k, g, [0.92, 0.18, 0.4], [0, y + 2.04, -0.18], S, undefined, 0.08);
    for (const [i, dz, w] of [[-1.5, 0.07, 0.24], [-0.5, 0.16, 0.28], [0.5, 0.1, 0.26], [1.5, 0.18, 0.22]] as const) {
      k.mesh(g, taper(w, 0.2, w * 0.6, 0.12, 1.84), i === -0.5 || i === 1.5 ? SL : S, [i * 0.23, y + 1.08, -0.4 - dz], [-0.08, 0, i * 0.04]);
    }
    k.mesh(g, taper(1.0, 0.16, 1.0, 0.16, 0.12), SD, [0, y + 0.22, -0.5], [-0.06, 0, 0]);
    for (const sx of [-1, 1]) k.box(g, [0.12, 0.12, 0.06], [sx * 0.34, y + 2.06, 0.02], PAL.gold, [0, 0, Math.PI / 4]);
    // The sword belt round him, over the cloak at the back, its buckle on the hip.
    cb(k, g, [0.72, 0.1, 0.5], [0, y + 1.3, 0], SL, undefined, 0.03);
    cb(k, g, [0.86, 0.1, 0.16], [0, y + 1.3, -0.52], SD, [-0.06, 0, 0], 0.03);
    // A second sword slung across his back, its pommel and grip over the right shoulder.
    cb(k, g, [0.08, 1.2, 0.06], [0.14, y + 1.5, -0.58], SL, [-0.06, 0, -0.5], 0.02);
    cb(k, g, [0.34, 0.06, 0.08], [0.34, y + 1.96, -0.58], SL, [-0.06, 0, -0.5], 0.02);
    cb(k, g, [0.06, 0.26, 0.06], [0.45, y + 2.09, -0.58], SD, [-0.06, 0, -0.5], 0.01);
    cb(k, g, [0.11, 0.11, 0.11], [0.5, y + 2.24, -0.58], SL, [0, Math.PI / 4, 0], 0.03);
    // Pauldrons, arms bent to the hands on the pommel.
    for (const s of [-1, 1]) {
      cb(k, g, [0.38, 0.26, 0.52], [s * 0.5, y + 2.1, 0], SL, [0, 0, s * -0.3], 0.1);
      limb(k, g, [s * 0.48, y + 2.02, 0.02], [s * 0.4, y + 1.56, 0.24], [0.2, 0.22, 0.18, 0.2], S);
      limb(k, g, [s * 0.4, y + 1.56, 0.24], [s * 0.1, y + 1.42, 0.44], [0.18, 0.2, 0.17, 0.19], S);
    }
    cb(k, g, [0.34, 0.2, 0.22], [0, y + 1.44, 0.46], SD, undefined, 0.05);
    // The sword planted before him: pommel, grip, crossguard, the blade to the plinth.
    cb(k, g, [0.13, 0.13, 0.13], [0, y + 1.62, 0.46], SL, [0, Math.PI / 4, 0], 0.03);
    cb(k, g, [0.66, 0.08, 0.1], [0, y + 1.26, 0.46], SL, undefined, 0.02);
    k.mesh(g, taper(0.05, 0.04, 0.16, 0.05, 1.18), SL, [0, y + 0.64, 0.46]);
    // The helm: a great helm with a visor slit, its top closing in a low rounded crown with a short
    // ridged comb running front to back along it (sitting on the helm, never a fin standing off it).
    cb(k, g, [0.2, 0.14, 0.2], [0, y + 2.24, 0], SD, undefined, 0.03);
    cb(k, g, [0.38, 0.44, 0.42], [0, y + 2.5, 0.01], S, undefined, 0.1);
    k.box(g, [0.28, 0.05, 0.03], [0, y + 2.56, 0.22], 0x2e2c28);
    k.box(g, [0.04, 0.16, 0.03], [0, y + 2.44, 0.22], 0x2e2c28);
    k.mesh(g, taper(0.36, 0.4, 0.2, 0.24, 0.12), S, [0, y + 2.77, 0.01]);
    cb(k, g, [0.07, 0.11, 0.36], [0, y + 2.86, 0.0], SL, undefined, 0.025);
    // A kite shield leaning against his side.
    k.mesh(g, taper(0.1, 0.07, 0.56, 0.07, 0.86), SD, [-0.56, y + 0.46, 0.12], [-0.08, 0.35, 0.1]);
    cb(k, g, [0.18, 0.18, 0.04], [-0.57, y + 0.62, 0.17], SL, [0, 0.35, Math.PI / 4], 0.02);
  },
  /** A stone planter box of flowers. */
  planter: (k, g) => {
    cb(k, g, [1.4, 0.5, 0.8], [0, 0.25, 0], STONE_L, undefined, 0.05);
    k.box(g, [1.2, 0.05, 0.6], [0, 0.5, 0], 0x3a2a1e);
    for (let i = 0; i < 6; i++) {
      const x = -0.45 + (i % 3) * 0.45, z = i < 3 ? -0.14 : 0.14;
      cb(k, g, [0.3, 0.26, 0.3], [x, 0.62, z], 0x4a7a34, [0, i, 0], 0.1);
      cb(k, g, [0.14, 0.1, 0.14], [x + 0.04, 0.78, z], [0xd05a8a, 0xe8c040, 0xe8dcc0, 0x8a5aa0][i % 4], [0, i, 0], 0.03);
    }
  },
  /**
   * A field plot of one crop (`v`): 0 cabbages, 1 lettuces, 2 carrots, 3 leeks, 4 red cabbages, in
   * three rows on ridged dark soil, each plant the kitchen garden's own a size up (field-grown), so
   * every plot reads as what grows in it.
   */
  veg_patch: (k, g, arg) => {
    const v = vOf(arg) % 5;
    cb(k, g, [3.2, 0.2, 1.8], [0, 0.1, 0], 0x4a3624, undefined, 0.06);
    const S = 1.4, rows = new THREE.Group();
    rows.position.y = 0.2;
    rows.scale.setScalar(S);
    g.add(rows);
    const step = v === 2 || v === 3 ? 0.36 : 0.6;
    for (const z of [-0.55, 0, 0.55]) {
      // (Each row on its own ridge of turned earth, a shade darker than the plot.)
      k.box(rows, [2.9 / S, 0.05 / S, 0.36 / S], [0, 0.0, z / S], 0x3a2a1c);
      spread(2.9, step, step / 2).forEach((x, i) => {
        const seed = i * 1.37 + z * 5.1, px = x / S, pz = z / S;
        if (v === 0 || v === 4) PLANT.cabbage(k, rows, px, pz, seed, v === 4);
        else if (v === 1) PLANT.lettuce(k, rows, px, pz, seed);
        else if (v === 2) PLANT.carrot(k, rows, px, pz, seed);
        else PLANT.leek(k, rows, px, pz, seed);
      });
    }
  },
  /** A round haystack with a pitchfork leaning on it. */
  haystack: (k, g) => {
    k.mesh(g, taper(1.9, 1.9, 1.3, 1.3, 1.0), 0xc8a858, [0, 0.5, 0], [0, 0.4, 0]);
    k.mesh(g, taper(1.3, 1.3, 0.2, 0.2, 0.9), 0xb8984a, [0, 1.45, 0], [0, 0.4, 0]);
    cb(k, g, [0.06, 1.8, 0.06], [0.95, 0.9, 0.3], WOOD_L, [0, 0, 0.3], 0.01);
    cb(k, g, [0.3, 0.2, 0.04], [0.68, 1.75, 0.3], IRON, [0, 0, 0.3], 0.01);
  },
  /** A garden scarecrow: sack head, hat, ragged coat on a cross. */
  scarecrow: (k, g) => {
    cb(k, g, [0.12, 2.2, 0.12], [0, 1.1, 0], WOOD_D, undefined, 0.02);
    cb(k, g, [1.3, 0.1, 0.1], [0, 1.6, 0], WOOD_D, undefined, 0.02);
    cb(k, g, [0.6, 0.7, 0.34], [0, 1.4, 0], 0x5a6a3a, undefined, 0.08);
    cb(k, g, [0.34, 0.36, 0.32], [0, 2.02, 0], 0xb09a70, undefined, 0.08);
    k.mesh(g, taper(0.6, 0.6, 0.26, 0.26, 0.28), 0x5a4230, [0, 2.3, 0]);
    for (const x of [-0.55, 0.55]) cb(k, g, [0.24, 0.3, 0.3], [x, 1.52, 0], 0x5a6a3a, undefined, 0.06);
  },
  /** A chopping stump with an axe bitten into it and split logs around it. */
  stump: (k, g) => {
    cb(k, g, [0.7, 0.55, 0.7], [0, 0.27, 0], 0x4a3020, undefined, 0.2);
    k.mesh(g, octagon(0.3, 0.02), 0xa08058, [0, 0.55, 0], [0, 0, Math.PI / 2]);
    cb(k, g, [0.06, 0.8, 0.06], [0.2, 0.85, 0], WOOD_L, [0, 0, -0.5], 0.01);
    cb(k, g, [0.26, 0.1, 0.05], [0.02, 0.6, 0], IRON_L, [0, 0, -0.5], 0.01);
    for (let i = 0; i < 3; i++) cb(k, g, [0.5, 0.22, 0.22], [-0.6 + i * 0.1, 0.11, 0.45 - i * 0.35], 0x8a6a44, [0, i * 0.9, 0], 0.04);
  },
  board: (k, g) => {
    for (const sx of [-1, 1]) cb(k, g, [0.14, 2.3, 0.14], [sx * 0.85, 1.15, 0], PAL.wood, undefined, 0.02);
    cb(k, g, [1.9, 1.2, 0.1], [0, 1.4, 0], PAL.wood, undefined, 0.02);
    k.box(g, [0.5, 0.6, 0.02], [-0.4, 1.45, 0.06], 0xe8dcc0, [0, 0, 0.05]);
    k.box(g, [0.5, 0.5, 0.02], [0.35, 1.35, 0.06], 0xe8dcc0, [0, 0, -0.08]);
    k.mesh(g, wedge(2.3, 0.4, 0.6), SLATE, [0, 2.25, 0]);
  },
  forgeheart: (k, g) => {
    // The Emberforge (concept: docs/concepts/emberforge.jpg): a waist-high hearth of dressed stone with a brick-arched ash
    // pit behind an iron door, a fire pot of coals inside a stone rim, brick cheeks and a back wall
    // carrying a stone hood that narrows into the forge's own brick chimney (it rises through the
    // lean-to's roof), and the great bellows hung on its west side, its nozzle over the rim into the
    // fire. Nothing stands under it. Cold: soot-black stone, dead grey coals, the bellows sagging,
    // bricks fallen at its foot. Restored: warm stone, the pot full of glowing coals and flame.
    const cold = new THREE.Group(), hot = new THREE.Group();
    g.add(cold, hot);
    hot.visible = false;
    const W = 1.7, D = 1.3, T = 0.24, RIM = 0.75, TOP = 1.55;
    const build = (p: Obj, stone: number[], brick: number[], leather: number, seed: number, ruined: boolean) => {
      const wall = (s: Omit<WallSpec, 'seed' | 'unit'>, sd: number) => masonry(k, p, { ...s, seed: seed + sd, unit: 0.42 });
      // The body: four stone walls three courses high, the front opened for the ash pit.
      wall({ x: 0, z: D / 2 - T / 2, rot: 0, len: W, y0: 0, rows: 3, rowH: 0.25, thick: T, shades: stone, hole: { u: 0, w: 0.62, h: RIM } }, 0);
      wall({ x: 0, z: -D / 2 + T / 2, rot: 0, len: W, y0: 0, rows: 3, rowH: 0.25, thick: T, shades: stone }, 1);
      for (const sx of [-1, 1]) wall({ x: sx * (W / 2 - T / 2), z: 0, rot: Math.PI / 2, len: D - 2 * T, y0: 0, rows: 3, rowH: 0.25, thick: T, shades: stone }, 2 + sx);
      cb(k, p, [W - 2 * T, RIM - 0.05, D - 2 * T], [0, (RIM - 0.05) / 2, 0], stone[2], undefined, 0.02);
      // The ash pit: an iron door under a round brick arch.
      k.box(p, [0.44, 0.36, 0.04], [0, 0.2, D / 2 - T + 0.02], IRON);
      k.box(p, [0.22, 0.04, 0.02], [0, 0.26, D / 2 - T + 0.045], DARK);
      for (let i = 0; i < 7; i++) {
        const a = (i / 6) * Math.PI;
        cb(k, p, [0.15, 0.1, T - 0.02], [Math.cos(a) * 0.25, 0.42 + Math.sin(a) * 0.2, D / 2 - T / 2], brick[i % 2], [0, 0, a - Math.PI / 2], 0.02);
      }
      // The fire pot's rim: a course of stone across the front and down both sides.
      wall({ x: 0, z: D / 2 - 0.15, rot: 0, len: W, y0: RIM, rows: 1, rowH: 0.15, thick: 0.3, shades: stone }, 5);
      for (const sx of [-1, 1]) wall({ x: sx * (W / 2 - 0.15), z: -0.03, rot: Math.PI / 2, len: 0.76, y0: RIM, rows: 1, rowH: 0.15, thick: 0.3, shades: stone }, 6 + sx);
      // Brick back wall and cheeks round the fire, the stone hood on them, the chimney out of it.
      wall({ x: 0, z: -D / 2 + T / 2, rot: 0, len: W, y0: RIM, rows: 4, rowH: (TOP - RIM) / 4, thick: T, shades: brick }, 10);
      for (const sx of [-1, 1]) wall({ x: sx * (W / 2 - T / 2), z: -0.155, rot: Math.PI / 2, len: 0.51, y0: RIM + 0.15, rows: 3, rowH: (TOP - RIM - 0.15) / 3, thick: T, shades: brick }, 11 + sx);
      k.mesh(p, taper(W + 0.1, 0.85, 0.72, 0.56, 0.55, 0, -0.1), stone[0], [0, TOP + 0.275, -0.225]);
      cb(k, p, [0.6, 2.4, 0.48], [0, 3.2, -0.325], brick[0], undefined, 0.03);
      cb(k, p, [0.74, 0.16, 0.62], [0, 4.48, -0.325], stone[1], undefined, 0.03);
      // The bellows: a leather bag between its nozzle and an outer board, hung from a post.
      const droop = ruined ? 0.18 : 0;
      k.mesh(p, taper(0.75, 0.6, 0.18, 0.18, 0.55), leather, [-1.2, 1.05 - droop / 2, 0.3], [droop, 0, -Math.PI / 2]);
      cb(k, p, [0.06, 0.8, 0.62], [-1.5, 1.05 - droop, 0.3], WOOD_D, [droop, 0, 0], 0.02);
      cb(k, p, [0.12, 1.45, 0.12], [-1.6, 0.725, 0.3], WOOD_D, undefined, 0.02);
      k.mesh(p, taper(0.09, 0.09, 0.06, 0.06, 0.5), IRON, [-0.73, 0.97, 0.3], [0, 0, -Math.PI / 2]);
      if (ruined) for (const [x, z, r] of [[1.0, 0.75, 0.4], [1.12, 0.45, 1.3], [0.7, 0.86, 2.2]]) cb(k, p, [0.22, 0.1, 0.12], [x, 0.05, z], brick[1], [0, r, 0], 0.02);
    };
    build(cold, SOOT, BRICK_SOOT, 0x5a4230, 31, true);
    build(hot, SAND, [BRICK, BRICK_L, BRICK_D], PAL.leather, 31, false);
    // The coals: dead and grey, or banked high and glowing with a flame on them.
    for (let i = 0; i < 9; i++) chunk(k, cold, 900 + i, [0.24, 0.12, 0.22], [-0.42 + (i % 3) * 0.42, RIM, -0.3 + Math.floor(i / 3) * 0.28], 0x4a4644, i);
    k.box(hot, [W - 0.62, 0.05, 0.74], [0, RIM + 0.03, -0.03], 0x3a1206, undefined, PAL.fire, 0.9);
    for (let i = 0; i < 9; i++) chunk(k, hot, 900 + i, [0.24, 0.12, 0.22], [-0.42 + (i % 3) * 0.42, RIM, -0.3 + Math.floor(i / 3) * 0.28], i % 3 ? COAL : 0xff8a30, i, i % 3 ? 0 : PAL.fire, 1.6);
    k.box(hot, [0.38, 0.03, 0.28], [0, 4.57, -0.325], 0x2a0c04, undefined, 0xff5a1a, 0.9);
    const f = flame(k, hot, 0, RIM + 0.05, -0.1, 0.55);
    const l = light(hot, 0xff7a30, 8, 7, 1.2);
    l.position.z = 0.6;
    return {
      obj: g,
      light: l,
      tick: (t: number) => {
        f(t);
        l.intensity = 7 + Math.sin(t * 11) * 1.2;
      },
      setState: (s) => {
        cold.visible = s !== 'restored';
        hot.visible = s === 'restored';
      },
    };
  },
  tent: (k, g, v) => {
    // A goblin hide tent: an A-frame of stitched hides with crossed poles at each end.
    const hides = [[0x8a6a48, 0x6e5238], [0x7a5a3a, 0x5a4230], [0x8a4a34, 0x6a3a2a]][(v ?? 0) % 3];
    k.mesh(g, wedge(2.6, 1.7, 2.3), hides[0], [0, 0.85, 0], [0, Math.PI / 2, 0]);
    k.mesh(g, wedge(0.04, 1.1, 1.0), DARK, [0, 0.55, 1.29], [0, Math.PI / 2, 0]);
    // Stitched seams between hide panels, lying on the slopes (atan(1.15 / 1.7) from vertical).
    for (const x of [0.62, -0.62]) {
      k.box(g, [0.05, 0.1, 2.62], [x + Math.sign(x) * 0.03, 1.7 * (1 - Math.abs(x) / 1.15), 0], hides[1], [0, 0, Math.sign(x) * 0.595]);
      k.box(g, [0.05, 0.9, 0.08], [x * 0.9 + Math.sign(x) * 0.03, 1.7 * (1 - Math.abs(x * 0.9) / 1.15), 0.35], hides[1], [0, 0, Math.sign(x) * 0.595]);
    }
    for (const z of [-1.2, 1.2]) for (const e of [-1, 1]) cb(k, g, [0.09, 2.3, 0.09], [e * 0.28, 1.05, z], WOOD_D, [0, 0, e * 0.4], 0.02);
    cb(k, g, [0.1, 0.1, 2.9], [0, 1.72, 0], WOOD_D, undefined, 0.02);
    cb(k, g, [0.2, 0.18, 0.22], [0.32, 2.15, 1.2], BONE, undefined, 0.04);
  },
  banner: (k, g) => {
    // Goblin war banner: tattered red hide with a bone skull, on a spiked pole in a rock pile.
    cb(k, g, [0.13, 3.3, 0.13], [0, 1.65, 0], WOOD_D, undefined, 0.02);
    k.mesh(g, taper(0.13, 0.13, 0.01, 0.01, 0.4), IRON, [0, 3.5, 0]);
    cb(k, g, [1.2, 0.1, 0.1], [0, 3.05, 0], WOOD_D, undefined, 0.02);
    cb(k, g, [1.05, 1.4, 0.05], [0, 2.3, 0.06], 0x8a2a1e, undefined, 0.01);
    for (const x of [-0.36, 0.36]) cb(k, g, [0.32, 0.35, 0.05], [x, 1.43, 0.06], 0x8a2a1e, undefined, 0.01);
    cb(k, g, [0.36, 0.32, 0.06], [0, 2.4, 0.1], BONE, undefined, 0.03);
    cb(k, g, [0.24, 0.12, 0.06], [0, 2.2, 0.1], BONE_D, undefined, 0.02);
    for (const e of [-1, 1]) k.box(g, [0.08, 0.08, 0.02], [e * 0.08, 2.43, 0.135], DARK);
    for (let i = 0; i < 4; i++) chunk(k, g, 110 + i, [0.45, 0.35, 0.4], [Math.cos(i * 1.6) * 0.3, -0.05, Math.sin(i * 1.6) * 0.3], 0x6a6258, i);
  },
  weapon_rack: (k, g) => {
    for (const x of [-0.9, 0.9]) for (const e of [-1, 1]) cb(k, g, [0.1, 1.5, 0.1], [x, 0.7, e * 0.22], WOOD_D, [e * -0.3, 0, 0], 0.02);
    cb(k, g, [2.0, 0.1, 0.1], [0, 1.35, 0], WOOD, undefined, 0.02);
    cb(k, g, [2.0, 0.08, 0.08], [0, 0.35, 0.3], WOOD, undefined, 0.02);
    for (const [x, tilt] of [[-0.6, 0.15], [-0.2, -0.1], [0.55, 0.1]]) {
      cb(k, g, [0.06, 1.9, 0.06], [x, 0.95, 0.12], WOOD_L, [0.25, 0, tilt], 0.01);
      // The spear's head on the top of its shaft.
      const top = new THREE.Vector3(0, 0.92, 0).applyEuler(new THREE.Euler(0.25, 0, tilt)).add(new THREE.Vector3(x, 0.95, 0.12));
      k.mesh(g, prism(0.12, 0.35, 0.6), IRON_L, [top.x, top.y, top.z], [0.25, 0, tilt]);
    }
    cb(k, g, [0.07, 1.2, 0.07], [0.2, 0.6, 0.28], WOOD, [0.3, 0, 0.05], 0.01);
    {
      // The axe's head on the top of its haft.
      const head = new THREE.Vector3(0.1, 0.48, 0).applyEuler(new THREE.Euler(0.3, 0, 0.05)).add(new THREE.Vector3(0.2, 0.6, 0.28));
      cb(k, g, [0.3, 0.26, 0.05], [head.x, head.y, head.z], IRON, [0.3, 0, 0.05], 0.02);
    }
    // Two kite shields leaning on its front, painted in the lord's colours.
    for (const [x, c] of [[-0.55, HERALD_BLUE_D], [0.45, HERALD_BLUE]] as [number, number][]) {
      cb(k, g, [0.56, 0.62, 0.06], [x, 0.62, 0.42], c, [-0.22, 0, 0], 0.02);
      k.mesh(g, wedge(0.56, 0.36, 0.06), c, [x, 0.13, 0.52], [Math.PI - 0.22, 0, 0]);
      k.box(g, [0.18, 0.18, 0.03], [x, 0.66, 0.46], PAL.gold, [-0.22, 0, Math.PI / 4]);
    }
  },
  campfire: (k, g) => {
    // Read from above: a dark ash bed inside a ring of grey stones, two charred logs crossed over
    // glowing coals, and a tall flame. The light hangs high so the stones stay stone-coloured.
    decal(k.mesh(g, raggedDisc(61, 14, 0.8, 0.95, 0.2), 0x241e1a, [0, 0.03, 0]));
    const stones = [0x6a6560, 0x5c5752, 0x77716a];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + hash01(i, 3) * 0.2;
      chunk(k, g, 50 + i, [0.34, 0.26, 0.3], [Math.cos(a) * 0.82, -0.04, Math.sin(a) * 0.82], stones[i % 3], -a);
    }
    k.box(g, [0.62, 0.08, 0.62], [0, 0.06, 0], 0x5a1a04, [0, 0.4, 0], PAL.fire, 1.4);
    for (const [a, y] of [[0.62, 0.16], [-0.62, 0.3]] as [number, number][]) {
      cb(k, g, [0.22, 0.2, 1.35], [0, y, 0], 0x4a3020, [0, a, 0], 0.07);
      for (const e of [-1, 1]) cb(k, g, [0.23, 0.21, 0.16], [Math.sin(a) * e * 0.6, y, Math.cos(a) * e * 0.6], 0x1e1612, [0, a, 0], 0.06);
    }
    const f = flame(k, g, 0, 0.22, 0, 1.3);
    const f2 = flame(k, g, 0.22, 0.2, 0.12, 0.7), f3 = flame(k, g, -0.18, 0.2, -0.14, 0.6);
    const l = light(g, 0xff8a3a, 10, 11, 2.6);
    return { obj: g, light: l, tick: (t) => { f(t); f2(t + 0.4); f3(t + 0.9); l.intensity = 9.5 + Math.sin(t * 13) * 1.5; } };
  },
  // ─── Cinderwing's den ──────────────────────────────────────────────────────
  /**
   * A glowing lava fissure running along local +Z (variant `v` picks its wander): a molten core in a
   * wider glowing crack, lipped both sides by cooled basalt, widest at its source (z = 0) and
   * pinching out at the far end, with a couple of short side cracks. Walkable (it hugs the floor).
   */
  lava_seam: (k, g, v) => {
    const seed = (v ?? 0) * 17 + 3;
    const L = 6.5 + hash01(seed, 1) * 3, n = Math.round(L / 0.6);
    const pts: [number, number][] = [];
    let x = 0;
    for (let i = 0; i <= n; i++) {
      pts.push([x, (i / n) * L]);
      x += (hash01(seed, i) - 0.5) * 0.7;
    }
    const lips = [BASALT, BASALT_D, BASALT_L];
    const run = (p: [number, number][], w0: number, s: number) => {
      for (let i = 0; i < p.length - 1; i++) {
        const [ax, az] = p[i], [bx, bz] = p[i + 1];
        const len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bx - ax, bz - az);
        const t = i / (p.length - 1);
        const w = q(Math.max(0.08, w0 * Math.pow(1 - t, 0.7) * (0.8 + hash01(s, i, 2) * 0.4)));
        const mx = (ax + bx) / 2, mz = (az + bz) / 2, px = Math.cos(ang), pz = -Math.sin(ang);
        // Deep red glow in the crack, a thin hot core only where it is wide (bloom does the rest).
        decal(k.box(g, [w, 0.05, q(len + 0.14)], [mx, 0.06, mz], 0x3a0c02, [0, ang, 0], 0xc8300a, 0.9));
        if (w > 0.3) decal(k.box(g, [q(w * 0.3), 0.05, q(len + 0.06)], [mx, 0.075, mz], 0xff9040, [0, ang, 0], 0xff7a20, 1.2));
        for (const side of [-1, 1]) {
          const lw = 0.26 + w * 0.35;
          chunk(k, g, s + i * 2 + (side > 0 ? 1 : 0), [q(lw), q(0.12 + w * 0.18), q(len * 0.95 + 0.12)], [mx + px * side * (w / 2 + lw * 0.32), -0.03, mz + pz * side * (w / 2 + lw * 0.32)], lips[(i + (side > 0 ? 1 : 0)) % 3], ang);
        }
      }
    };
    run(pts, 0.7, seed);
    // Side cracks off the main fissure.
    for (const [at, turn] of [[Math.floor(n * 0.3), 0.9], [Math.floor(n * 0.6), -1.0]] as [number, number][]) {
      const [sx, sz] = pts[at];
      const dir = turn + (hash01(seed, at) - 0.5) * 0.4;
      const branch: [number, number][] = [];
      for (let i = 0; i < 4; i++) branch.push([sx + Math.sin(dir) * i * 0.55, sz + Math.cos(dir) * i * 0.55]);
      run(branch, 0.32, seed + 50 + at);
    }
  },
  /**
   * Cooled lava crust set into the floor: an elongated patch (along local X) of flat basalt plates,
   * cut like a dried mud flat (Voronoi cells with a narrow gap between them) and standing barely
   * proud of the ground, a dull red glow down in the cracks.
   */
  crust: (k, g, v) => {
    const s = (v ?? 0) * 11 + 5;
    // The glow bed stops short of the rim: the cracks glow in the heart of the patch and go dark
    // toward its edge.
    const glow = decal(k.mesh(g, raggedDisc(s, 18, 0.95, 1.02, 0.12), 0x140402, [0, 0.015, 0], undefined, 0x7a1804, 0.4));
    glow.scale.set(CRUST_RX * 0.62, 1, CRUST_RZ * 0.62);
    decal(k.mesh(g, raggedDisc(s + 1, 18, 0.95, 1.02, 0.12), 0x1e1614, [0, 0.01, 0])).scale.set(CRUST_RX * 0.95, 1, CRUST_RZ * 0.95);
    const cols = [0x3a2e2a, 0x322828, BASALT];
    crustPlates(s).forEach((geo, i) => decal(k.mesh(g, geo, cols[i % 3], [0, 0, 0])));
  },
  /** Scorch mark: a small charred core (the terrain paints the wide soft burn), embers still glowing. */
  scorch: (k, g, v) => {
    const s = (v ?? 0) + 1;
    decal(k.mesh(g, raggedDisc(92 + s, 18, 0.46, 0.58, 0.35), 0x1e1512, [0, 0.03, 0]));
    decal(k.mesh(g, raggedDisc(95 + s, 12, 0.24, 0.3, 0.3), 0x0f0b0a, [0, 0.04, 0]));
    for (let i = 0; i < 5; i++) {
      const a = hash01(s, i) * 6.3, r = 0.12 + hash01(s, i, 1) * 0.45;
      decal(k.box(g, [0.07, 0.02, 0.07], [Math.cos(a) * r, 0.05, Math.sin(a) * r], 0x5a1a04, [0, a, 0], 0xff5a10, 1.4));
    }
  },
  /** A cluster of blocky basalt columns (octagonal, flat-topped, stepped heights), one fallen. */
  basalt_columns: (k, g, v) => {
    const s = (v ?? 0) * 7 + 1, n = 5 + ((v ?? 0) % 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + hash01(s, i) * 0.5;
      const r = i === 0 ? 0 : 0.55 + hash01(s, i, 1) * 0.35;
      const w = q(0.62 + hash01(s, i, 2) * 0.22), h = q((i === 0 ? 3.6 : 1.1 + hash01(s, i, 3) * 2.4) * (0.85 + hash01(s) * 0.3));
      const x = Math.cos(a) * r, z = Math.sin(a) * r, rot = hash01(s, i, 4) * 0.8;
      k.mesh(g, chamferBox(w, h, w, q(w * 0.24)), i % 2 ? BASALT : BASALT_D, [x, h / 2 - 0.2, z], [0, rot, 0]);
      k.mesh(g, chamferBox(q(w * 0.9), 0.1, q(w * 0.9), q(w * 0.2)), BASALT_L, [x, h - 0.17, z], [0, rot, 0]);
    }
    const fa = hash01(s, 9) * 6.3;
    k.mesh(g, chamferBox(0.6, 0.6, 2.0, 0.14), BASALT, [Math.cos(fa) * 1.5, 0.22, Math.sin(fa) * 1.5], [0, fa, 0.05]);
    for (let i = 0; i < 4; i++) chunk(k, g, s + 30 + i, [0.4, 0.3, 0.35], [Math.cos(fa + 1 + i) * 1.3, -0.05, Math.sin(fa + 1 + i) * 1.3], BASALT_D, i);
  },
  /** Ember crystals: a burst of glowing orange-red shards out of a basalt knuckle. */
  ember_crystals: (k, g, v) => {
    const s = (v ?? 0) * 5 + 2;
    chunk(k, g, 180 + s, [1.4, 0.5, 1.2], [0, -0.1, 0], BASALT, 0.4);
    const n = 4 + ((v ?? 0) % 2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + hash01(s, i) * 0.6, r = i === 0 ? 0 : 0.35;
      const h = q(i === 0 ? 2.3 : 1.0 + hash01(s, i, 1) * 0.9), w = q(i === 0 ? 0.46 : 0.28 + hash01(s, i, 2) * 0.1);
      k.mesh(g, prism(w, h, 0.3), i % 2 ? 0xff8a3a : 0xff5a1a, [Math.cos(a) * r, 0.1, Math.sin(a) * r], [Math.sin(a) * 0.45 * (r > 0 ? 1 : 0.2), a, -Math.cos(a) * 0.45 * (r > 0 ? 1 : 0.2)], 0xff3a08, 1.5);
    }
  },
  /** An ember vent at a wall's foot: glowing crystals in a cracked basalt knuckle that light the way. */
  ember_vent: (k, g) => {
    chunk(k, g, 186, [1.9, 0.6, 1.6], [0, -0.15, 0], BASALT_D, 0.7);
    BUILDERS.ember_crystals(k, g, 2);
    const l = light(g, 0xff7a3a, 4.2, 10, 1.6);
    return { obj: g, light: l, tick: (t: number) => (l.intensity = 4.2 + Math.sin(t * 2.3 + g.id) * 0.5) };
  },
  /**
   * Cinderwing's hoard ledge: a raised two-tier basalt shelf with steps down the front, heaped with
   * gold, a chest, skulls and swords of the fallen, ember crystals at its back corners.
   */
  hoard_ledge: (k, g) => {
    const slabs: [number, number, number, number, number, number][] = [
      // x, z, w, d, h, y
      [-1.6, 0.2, 3.6, 3.8, 0.7, -0.1], [1.7, -0.2, 3.4, 4.0, 0.72, -0.1], [0, -1.2, 5.8, 2.4, 0.7, -0.1],
      [-0.6, -0.6, 3.4, 2.6, 0.55, 0.55], [1.2, -0.9, 2.6, 2.2, 0.55, 0.55],
    ];
    slabs.forEach(([x, z, w, d, h, y], i) => chunk(k, g, 200 + i, [w, h, d], [x, y, z], i < 3 ? BASALT : BASALT_L, hash01(i, 5) * 0.2 - 0.1));
    for (let i = 0; i < 3; i++) cb(k, g, [2.4 - i * 0.3, 0.2, 0.5], [0.1, 0.1 + i * 0.2, 2.35 - i * 0.4], i % 2 ? BASALT_L : BASALT, undefined, 0.05);
    const hoard = new THREE.Group();
    hoard.position.set(0.2, 1.05, -0.6);
    hoard.scale.setScalar(1.35);
    g.add(hoard);
    BUILDERS.hoard(k, hoard);
    for (const [x, z, a] of [[-2.2, 0.9, 0.5], [2.4, 0.6, -0.8]] as [number, number, number][]) {
      const bones = new THREE.Group();
      bones.position.set(x, 0.6, z);
      bones.rotation.y = a;
      g.add(bones);
      bonePile(k, bones, x > 0 ? 3 : 0);
    }
    for (const [x, tilt] of [[-1.0, 0.35], [1.6, -0.3]] as [number, number][]) {
      cb(k, g, [0.08, 1.3, 0.04], [x, 1.5, 0.4], IRON_L, [0.2, 0, tilt], 0.01);
      cb(k, g, [0.34, 0.07, 0.1], [x - tilt * 0.55, 1.0, 0.3], IRON, [0.2, 0, tilt], 0.02);
    }
    for (const sx of [-1, 1]) {
      const c = new THREE.Group();
      c.position.set(sx * 2.7, 0.5, -1.7);
      g.add(c);
      BUILDERS.ember_crystals(k, c, sx > 0 ? 1 : 0);
    }
  },
  /** A cooled lava tongue: a low, lumpy run of black basalt plates along local +Z (`len` long). */
  basalt_ridge: (k, g, arg) => {
    const len = Math.max(2, arg ?? 5), n = Math.round(len / 0.9);
    for (let i = 0; i < n; i++) {
      const z = -len / 2 + (i + 0.5) * (len / n), t = Math.sin(((i + 0.5) / n) * Math.PI);
      const w = q(1.2 + t * 0.8 + hash01(len, i) * 0.4), h = q(0.35 + t * 0.45 + hash01(len, i, 1) * 0.2);
      chunk(k, g, 230 + i, [w, h, 1.1], [(hash01(len, i, 2) - 0.5) * 0.4, -0.08, z], i % 2 ? BASALT : BASALT_D, (hash01(len, i, 3) - 0.5) * 0.4);
      if (t > 0.5) chunk(k, g, 250 + i, [q(w * 0.6), q(h * 0.6), 0.7], [(hash01(len, i, 4) - 0.5) * 0.3, h - 0.2, z], BASALT_L, hash01(i, 4));
    }
  },
  // ─── Cave floor dressing ──────────────────────────────────────────────────
  /** A heap of broken rock (variant picks the arrangement); `v` ≥ 10 uses basalt. */
  rubble: (k, g, v) => {
    const s = (v ?? 0) % 10, cols = (v ?? 0) >= 10 ? [BASALT, BASALT_D, BASALT_L] : [0x6a5a4a, 0x5a4a3c, 0x7a6a58];
    const n = 5 + (s % 3);
    for (let i = 0; i < n; i++) {
      const a = hash01(s, i) * 6.3, r = i === 0 ? 0 : 0.35 + hash01(s, i, 1) * 0.55;
      const sz = i === 0 ? 0.75 : 0.25 + hash01(s, i, 2) * 0.35;
      chunk(k, g, 300 + s * 10 + i, [q(sz * 1.2), q(sz * 0.8), q(sz)], [Math.cos(a) * r, -0.04, Math.sin(a) * r], cols[i % 3], a);
    }
  },
  /** A still puddle of seep water on the cave floor (dark, glossy). */
  puddle: (k, g, v) => {
    // Shallow seep water: a damp patch darkening the floor round it, and the water itself, both
    // fading out to nothing at an irregular edge (no hard outline), glossy so it catches the
    // lantern light. A few stones at the edge.
    const s = v ?? 0;
    const damp = new THREE.Mesh(softDisc(120 + s, 1.45, [0.02, 0.012, 0.008], 0.45), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    damp.position.y = 0.03;
    damp.name = 'puddle-damp';
    const water = new THREE.Mesh(softDisc(125 + s, 1.05, [0.025, 0.055, 0.06], 0.85), new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, roughness: 0.05, metalness: 0, envMap: studioEnv(), envMapIntensity: 0.4 }));
    water.position.y = 0.045;
    water.name = 'puddle-water';
    for (const m of [damp, water]) {
      (m.material as THREE.Material).userData.decal = true;
      m.renderOrder = 1;
      g.add(m);
    }
    for (let i = 0; i < 3; i++) chunk(k, g, 130 + s * 3 + i, [0.3, 0.14, 0.24], [Math.cos(i * 2.2 + s) * 1.15, -0.03, Math.sin(i * 2.2 + s) * 0.95], 0x5a4a3c, i);
  },
  /** Loose ore chips on the floor (`v` = 0 copper, 1 tin, 2 iron, 3 coal). */
  ore_chips: (k, g, v) => {
    const cols = [[0x46a88c, 0xd07a3a], [0xd8e0e8, 0xbcc8d0], [0xb4603a, 0x8a4028], [COAL, COAL]][(v ?? 0) % 4];
    for (let i = 0; i < 7; i++) {
      const a = hash01(v ?? 0, i) * 6.3, r = 0.2 + hash01(v ?? 0, i, 1) * 0.8;
      chunk(k, g, 140 + (v ?? 0) * 7 + i, [0.2, 0.13, 0.17], [Math.cos(a) * r, -0.02, Math.sin(a) * r], cols[i % 2], a);
    }
  },
  /** A timber support set spanning a tunnel (posts, cap beam, braces, a hanging lantern); `len` = span. */
  mine_frame: (k, g, len) => mineFrame(k, g, len ?? 4, false),
  mine_frame_lit: (k, g, len) => mineFrame(k, g, len ?? 4, true),
  /** Timber shoring against a cave wall, facing +Z: posts, a cap beam and lagging planks. */
  shoring: (k, g) => {
    for (const x of [-1.2, 1.2]) cb(k, g, [0.26, 2.7, 0.26], [x, 1.35, 0], WOOD_D, undefined, 0.04);
    cb(k, g, [3.0, 0.3, 0.32], [0, 2.75, 0], WOOD, undefined, 0.04);
    for (let i = 0; i < 4; i++) cb(k, g, [2.2, 0.26, 0.08], [0, 0.5 + i * 0.55, -0.16], i % 2 ? WOOD : 0x5a3a22, [0, 0, (hash01(i) - 0.5) * 0.04], 0.02);
    for (const sx of [-1, 1]) cb(k, g, [0.12, 0.8, 0.12], [sx * 0.95, 2.35, 0.02], WOOD_D, [0, 0, sx * 0.8], 0.02);
    cb(k, g, [0.3, 0.3, 0.3], [-1.6, 0.15, 0.3], WOOD_L, [0, 0.3, 0], 0.04);
  },
  /** A mine cart tipped on its side, its ore spilled across the floor. */
  minecart_tipped: (k, g) => {
    const cart = new THREE.Group();
    cart.position.set(0, 0.62, 0);
    cart.rotation.z = 1.35;
    g.add(cart);
    BUILDERS.minecart(k, cart);
    cart.traverse((o) => o.position.y -= o === cart ? 0 : 0.62);
    for (let i = 0; i < 7; i++) chunk(k, g, 150 + i, [0.34, 0.24, 0.3], [-0.9 - hash01(i) * 0.9, -0.04, (hash01(i, 1) - 0.5) * 1.3], 0xb4743a, i, 0x3a1a00, 0.3);
  },
  crates: (k, g) => {
    // A crate stack with a lashed lid and an octagonal barrel.
    cb(k, g, [0.85, 0.75, 0.85], [0, 0.375, 0], WOOD_L, [0, 0.3, 0], 0.04);
    for (const y of [0.12, 0.62]) cb(k, g, [0.89, 0.07, 0.89], [0, y, 0], WOOD_D, [0, 0.3, 0], 0.03);
    cb(k, g, [0.6, 0.5, 0.6], [0.1, 1.0, 0.05], WOOD_L, [0, -0.2, 0], 0.04);
    cb(k, g, [0.64, 0.06, 0.64], [0.1, 1.1, 0.05], WOOD_D, [0, -0.2, 0], 0.03);
    cb(k, g, [0.55, 0.8, 0.55], [0.8, 0.4, 0.35], PAL.leather, undefined, 0.16);
    for (const y of [0.18, 0.62]) cb(k, g, [0.59, 0.06, 0.59], [0.8, y, 0.35], IRON, undefined, 0.17);
  },
  burrow: (k, g) => {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      chunk(k, g, 130 + i, [0.6, 0.35, 0.5], [Math.cos(a) * 0.75, -0.05, Math.sin(a) * 0.75], i % 2 ? 0x6a5a40 : 0x5a4a34, -a);
    }
    k.box(g, [0.9, 0.06, 0.9], [0, 0.03, 0], PAL.black, [0, 0.4, 0]);
  },
  boulder: (k, g) => {
    chunk(k, g, 140, [1.5, 1.1, 1.3], [0, -0.1, 0], 0x7a7068, 0.4);
    chunk(k, g, 141, [0.8, 0.6, 0.7], [0.8, -0.1, 0.4], 0x6a6058, 1.4);
  },
  pillar: (k, g) => {
    cb(k, g, [0.8, 0.3, 0.8], [0, 0.15, 0], STONE_D, undefined, 0.05);
    cb(k, g, [0.52, 2.6, 0.52], [0, 1.6, 0], STONE, undefined, 0.1);
    cb(k, g, [0.8, 0.3, 0.8], [0, 3.0, 0], STONE_D, undefined, 0.05);
  },
  pillar_broken: (k, g) => {
    cb(k, g, [0.8, 0.3, 0.8], [0, 0.15, 0], STONE_D, undefined, 0.05);
    cb(k, g, [0.52, 1.2, 0.52], [0, 0.9, 0], STONE, [0.05, 0, 0.04], 0.1);
    cb(k, g, [0.52, 1.1, 0.52], [0.9, 0.27, 0.3], STONE, [0, 0.5, Math.PI / 2], 0.1);
    chunk(k, g, 150, [0.4, 0.3, 0.35], [-0.5, 0, 0.4], BLOCKS[2], 1);
  },
  brazier: (k, g) => {
    // Kept low: an iron bowl of coals giving a warm pool of light, not a beacon (bloom only just
    // catches the coals).
    k.mesh(g, taper(0.6, 0.6, 0.3, 0.3, 0.16), IRON, [0, 0.08, 0]);
    cb(k, g, [0.16, 0.6, 0.16], [0, 0.46, 0], IRON, undefined, 0.02);
    k.mesh(g, taper(0.42, 0.42, 0.8, 0.8, 0.3), IRON, [0, 0.9, 0]);
    k.box(g, [0.66, 0.06, 0.66], [0, 1.03, 0], 0x4a1c0c, undefined, PAL.fire, 0.4);
    const f = flame(k, g, 0, 0.95, 0, 0.7);
    g.traverse((o) => {
      if (o.name === 'flame') ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5;
    });
    const l = light(g, 0xff7a3a, 3.2, 7, 1.5);
    return { obj: g, light: l, tick: (t: number) => { f(t); l.intensity = 3.2 + Math.sin(t * 9 + g.id) * 0.3; } };
  },
  /**
   * A length of ruined city wall along local X (`arg` = { len, v }): a sunk plinth course and a few
   * courses of big ashlar blocks in running bond, broken down to a stepped top (the height and the
   * way it has fallen come from `v`), with the odd block fallen at its foot. Bold, few pieces.
   * `v` ≥ 10000: a drowned wall, only its broken top breaking the water.
   */
  ruin_wall: (k, g, arg) => {
    const len = Math.max(1.6, arg?.len ?? 4), v = arg?.v ?? 800;
    const drowned = v >= 10000, sd = v % 100;
    const H = drowned ? 0.5 + hash01(sd, 1) * 0.5 : Math.max(0.6, Math.floor((v % 10000) / 100) / 10 * 1.5);
    const shades = [0x7a7870, 0x6e6a66, 0x6a6860];
    const D = 0.9, rowH = 0.6, y0 = drowned ? -1.25 : 0.2;
    if (!drowned) cb(k, g, [q(len + 0.2), 1.3, D + 0.2], [0, -0.45, 0], 0x6a6860, undefined, 0.06);
    const rows = Math.max(1, Math.round((H - (drowned ? -1.25 : 0.2)) / rowH));
    // Broken profile: which fraction of the length still stands at each height.
    const mode = Math.floor(hash01(sd, 2) * 4);
    const prof = (x: number) => {
      const t = x / len + 0.5;
      return mode === 0 ? 1 - t * 0.75 : mode === 1 ? 0.25 + t * 0.75 : mode === 2 ? 1 - Math.sin(t * Math.PI) * 0.6 : 0.55 + Math.sin(t * Math.PI) * 0.45;
    };
    for (let r = 0; r < rows; r++) {
      let x = -len / 2 + (r % 2 ? 0 : -0.5);
      let b = 0;
      while (x < len / 2 - 0.05) {
        const bl = 1.2 + hash01(sd, r, b) * 1.0;
        const a = Math.max(-len / 2, x), e = Math.min(len / 2, x + bl);
        x += bl;
        b++;
        if (e - a < 0.45) continue;
        const mid = (a + e) / 2;
        // Rows above the standing profile are gone; the top row keeps only its highest stretch.
        if ((r + 1) / rows > prof(mid) + 0.08) continue;
        const inset = hash01(sd, r, b, 5) * 0.08;
        cb(k, g, [q(e - a - 0.06), rowH - 0.04, q(D - inset)], [mid, y0 + r * rowH + rowH / 2, (hash01(sd, r, b, 6) - 0.5) * 0.08], shades[(r + b) % 3], undefined, 0.07);
      }
    }
    if (!drowned && hash01(sd, 9) < 0.55) {
      // One block fallen at the foot, lying askew.
      const side = hash01(sd, 10) < 0.5 ? -1 : 1, fx = (hash01(sd, 11) - 0.5) * len * 0.6;
      cb(k, g, [1.3, 0.55, 0.8], [fx, 0.22, side * 1.05], shades[1], [0.08 * side, 0.4 + hash01(sd, 12), 0.1], 0.07);
    }
  },
  /** A dry-cracked market fountain: an octagonal curb (one block fallen out) round a pool of rainwater. */
  fountain_ruin: (k, g) => {
    const R = 2.75;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (i === 3) {
        cb(k, g, [2.1, 0.55, 0.55], [Math.sin(a) * (R + 1.0), 0.2, Math.cos(a) * (R + 1.0)], 0x6e6a66, [0.1, a + 0.5, 0.25], 0.07);
        continue;
      }
      cb(k, g, [2.25, 0.6, 0.55], [Math.sin(a) * R, 0.3, Math.cos(a) * R], i % 2 ? 0x7a7870 : 0x6e6a66, [0, a, 0], 0.07);
    }
    k.cyl(g, R - 0.2, R - 0.2, 0.1, [0, 0.12, 0], PUDDLE, [0, Math.PI / 8, 0], 8);
  },
  /**
   * A market stall the flood knocked down (faces +Z): its stone counter still standing but split,
   * one post upright with a scrap of rotted awning, the other two fallen across the counter, the
   * shelf board slid off and a spill of broken crates and pots at its foot (`v` varies the spill).
   */
  stall_ruin: (k, g, v) => {
    const s = v ?? 0, side = s % 2 ? -1 : 1;
    // Split stone counter: two blocks, the second tipped and sunk.
    cb(k, g, [1.6, 0.8, 0.9], [-0.75 * side, 0.4, 0], 0x7a7870, [0, 0.05 * side, 0], 0.06);
    cb(k, g, [1.3, 0.72, 0.9], [0.85 * side, 0.26, 0.05], 0x6e6a66, [0.08, -0.12 * side, 0.16 * side], 0.06);
    cb(k, g, [1.7, 0.1, 1.0], [-0.72 * side, 0.85, 0], 0x5a3a22, [0, 0.05 * side, 0.03], 0.02);
    // The standing post and its scrap of faded awning.
    cb(k, g, [0.16, 2.3, 0.16], [-1.45 * side, 1.15, -0.55], WOOD_D, [0.04, 0, 0.05 * side], 0.02);
    const cloth = s % 3 === 0 ? 0x7a3a34 : s % 3 === 1 ? 0x3e5a6e : 0x5a6a3a;
    cb(k, g, [0.9, 0.05, 0.8], [-1.05 * side, 2.2, -0.3], cloth, [0.5, 0.2 * side, -0.25 * side], 0.01);
    cb(k, g, [0.5, 0.05, 0.5], [-0.9 * side, 1.85, 0.2], cloth, [1.1, 0.3 * side, -0.2 * side], 0.01);
    // Fallen posts across the counter and the shelf board slid to the ground.
    cb(k, g, [0.16, 2.2, 0.16], [0.2 * side, 1.0, 0.2], WOOD_D, [0.25, 0.4 * side, 1.15 * side], 0.02);
    cb(k, g, [0.16, 2.0, 0.16], [1.2 * side, 0.12, 0.9], WOOD_D, [Math.PI / 2, 0.9 * side, 0], 0.02);
    cb(k, g, [1.4, 0.08, 0.4], [0.3 * side, 0.08, 0.85], WOOD_L, [0.1, 0.35 * side, 0.08], 0.02);
    // The spill: a broken crate, a tipped jar and potsherds.
    cb(k, g, [0.6, 0.45, 0.6], [1.7 * side, 0.2, -0.3], WOOD_L, [0.2, 0.6 + s, 0.15], 0.03);
    amphora(k, g, [0.9 * side, 0.22, 1.35], [Math.PI / 2 - 0.2, s * 1.3, 0], s);
    for (let i = 0; i < 4; i++) cb(k, g, [0.2, 0.05, 0.14], [(0.2 + hash01(s, i) * 1.4) * side, 0.03, 1.1 + hash01(s, i, 2) * 0.7], 0xa0583a, [0, hash01(s, i, 3) * 6, 0.1], 0.01);
  },
  /** A cluster of clay amphorae: some standing, one tipped over, one broken open (`v` varies it). */
  amphorae: (k, g, v) => {
    const s = v ?? 0;
    const spots: [number, number][] = [[0, 0], [0.62, 0.2], [0.2, 0.62], [-0.45, 0.5]];
    spots.forEach(([x, z], i) => {
      if (i === 3 && s % 2) return;
      if (i === 1) amphora(k, g, [x + 0.3, 0.24, z + 0.2], [Math.PI / 2 - 0.15, s * 1.7 + 0.6, 0], s + i);
      else amphora(k, g, [x, 0, z], [0, s + i, 0], s + i, i === 2);
    });
  },
  /** A broken well: an octagonal stone curb with a gap knocked in it, its winch beam fallen. */
  well_ruin: (k, g) => {
    const R = 0.95;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (i === 5) {
        // The knocked-out block lies beside the gap.
        cb(k, g, [0.8, 0.45, 0.4], [Math.sin(a) * (R + 0.75), 0.18, Math.cos(a) * (R + 0.75)], 0x6e6a66, [0.15, a + 0.6, 0.3], 0.05);
        continue;
      }
      const hgt = i === 4 || i === 6 ? 0.55 : 0.8;
      cb(k, g, [0.82, hgt, 0.36], [Math.sin(a) * R, hgt / 2, Math.cos(a) * R], i % 2 ? 0x7a7870 : 0x6e6a66, [0, a, 0], 0.05);
    }
    k.mesh(g, octagon(R - 0.1, 0.05), 0x10181a, [0, 0.5, 0], [0, 0, Math.PI / 2]);
    // One upright of the winch frame still stands; the beam and the other lie in the court.
    cb(k, g, [0.16, 1.6, 0.16], [-1.05, 0.8, 0], WOOD_D, [0, 0, 0.06], 0.02);
    cb(k, g, [0.16, 1.6, 0.16], [1.5, 0.1, 0.8], WOOD_D, [Math.PI / 2, 0.7, 0], 0.02);
    cb(k, g, [1.9, 0.14, 0.14], [0.6, 0.09, 1.55], WOOD_D, [0, 0.35, 0], 0.02);
  },
  /** Big paving slabs keeping a narrow way across a slumped causeway (along local Z; `arg` = span). */
  sunken_slabs: (k, g, arg) => {
    const span = Math.max(2, arg ?? 4), n = Math.max(2, Math.round(span / 1.3));
    for (let i = 0; i < n; i++) {
      const z = -span / 2 + (i + 0.5) * (span / n), s = hash01(i, span, 3);
      cb(k, g, [q(2.1 + s * 0.3), 0.36, q(span / n - 0.12)], [(s - 0.5) * 0.25, -0.16 + s * 0.08, z], i % 2 ? 0x6e6a66 : 0x7a7870, [(s - 0.5) * 0.06, (s - 0.5) * 0.2, (hash01(i, 7) - 0.5) * 0.08], 0.05);
    }
    // Slabs that went under, tipped at the sides of the gap.
    for (const sx of [-1, 1]) cb(k, g, [1.3, 0.3, 1.5], [sx * 1.9, -0.42, (hash01(sx, span) - 0.5) * span * 0.5], 0x6a6860, [0, 0.3 * sx, sx * 0.32], 0.05);
  },
  /**
   * The drowned temple's great portico (faces +Z; about 17 wide, 4.5 deep, 6.5 high): a stepped
   * platform carrying six tall square columns before the dark doorway of the cella wall, a heavy
   * architrave still spanning four of them; the fifth has snapped, its drums and a fallen lintel
   * lying across the steps, and the last stands alone. Built of the same big ashlar as the walls.
   */
  temple_portico: (k, g) => {
    const S1 = 0x6a6860, S2 = 0x6e6a66, S3 = 0x7a7870, S4 = 0x84827a;
    // Platform: three broad steps.
    cb(k, g, [17.4, 0.4, 4.8], [0, 0.15, -0.2], S1, undefined, 0.06);
    cb(k, g, [16.6, 0.4, 4.2], [0, 0.55, -0.4], S2, undefined, 0.06);
    cb(k, g, [15.8, 0.4, 3.6], [0, 0.95, -0.6], S3, undefined, 0.06);
    const base = 1.15;
    // The cella wall behind: big courses, a tall doorway in the middle (dark inside), its top
    // broken down toward the sides.
    const wallZ = -2.1;
    for (let r = 0; r < 7; r++) {
      const y = base + r * 0.72 + 0.36;
      let x = -7.6 + (r % 2 ? 0.7 : 0);
      for (let b = 0; x < 7.6; b++) {
        const bl = 1.5 + hash01(r, b, 41) * 0.9, a = x, e = Math.min(7.6, x + bl);
        x += bl;
        const mid = (a + e) / 2;
        if (Math.abs(mid) < 1.5 && r < 5) continue;
        // The top courses survive only toward the middle.
        if (r >= 5 && Math.abs(mid) > 7.2 - (r - 4) * 2.2) continue;
        cb(k, g, [q(e - a - 0.06), 0.68, 0.9], [mid, y, wallZ], [S1, S2, S3][(r + b) % 3], undefined, 0.07);
      }
    }
    // The doorway: a deep dark opening under a lintel.
    k.box(g, [2.9, 3.5, 0.2], [0, base + 1.75, wallZ - 0.3], 0x101416);
    cb(k, g, [3.8, 0.6, 1.0], [0, base + 3.86, wallZ], S4, undefined, 0.06);
    // Columns: base block, a shaft of three drums, a capital.
    const xs = [-6.5, -3.9, -1.3, 1.3, 3.9, 6.5];
    const colZ = 0.4, H = 4.6;
    xs.forEach((x, i) => {
      const broken = i === 4;
      cb(k, g, [1.25, 0.35, 1.25], [x, base + 0.17, colZ], S1, undefined, 0.05);
      const drums = broken ? 1 : 3;
      for (let d = 0; d < drums; d++) cb(k, g, [0.9 - d * 0.03, H / 3 - 0.04, 0.9 - d * 0.03], [x, base + 0.35 + (d + 0.5) * (H / 3), colZ], d % 2 ? S2 : S3, [0, hash01(i, d) * 0.06, 0], 0.08);
      if (!broken) cb(k, g, [1.3, 0.4, 1.3], [x, base + 0.35 + H + 0.2, colZ], S4, undefined, 0.06);
    });
    // The architrave over the first four columns, in two long blocks with a cornice.
    const top = base + 0.35 + H + 0.4;
    cb(k, g, [5.4, 0.75, 1.3], [-5.2, top + 0.37, colZ], S2, undefined, 0.06);
    cb(k, g, [5.2, 0.75, 1.3], [0, top + 0.37, colZ], S3, [0, 0, 0.012], 0.06);
    cb(k, g, [10.8, 0.3, 1.55], [-2.6, top + 0.9, colZ], S4, undefined, 0.05);
    // Beams back to the cella wall (the portico's roof is gone; only a few remain).
    for (const x of [-5.2, -1.3]) cb(k, g, [0.6, 0.5, 2.6], [x, top + 0.4, -0.85], S1, undefined, 0.05);
    // The fall: the snapped column's drums and a lintel block across the steps.
    cb(k, g, [0.9, 1.4, 0.9], [4.6, 0.9, 1.9], S3, [Math.PI / 2, 0.5, 0], 0.08);
    cb(k, g, [0.88, 1.4, 0.88], [5.9, 0.75, 2.6], S2, [Math.PI / 2, 1.2, 0.1], 0.08);
    cb(k, g, [3.6, 0.7, 1.2], [3.2, 1.5, 1.3], S2, [0.12, 0.25, -0.2], 0.06);
    chunk(k, g, 470, [0.7, 0.4, 0.6], [6.9, 0.35, 2.2], S1, 0.6);
  },
  /**
   * A drowned arcade (an aqueduct or a city gallery) rising out of the water along local X:
   * square piers carrying blocky stepped arches, the deck above broken off at one end. Its base is
   * well below the surface. `arg` = number of bays (2..4).
   */
  drowned_arcade: (k, g, arg) => {
    const bays = Math.max(2, Math.min(4, arg ?? 3)), span = 3.2, len = bays * span;
    const S = [0x6a6860, 0x6e6a66, 0x7a7870];
    const y0 = -1.6, pierH = 3.2;
    for (let i = 0; i <= bays; i++) {
      const x = -len / 2 + i * span;
      const h = i === bays ? pierH * 0.55 : pierH;
      cb(k, g, [1.0, h, 1.2], [x, y0 + h / 2, 0], S[i % 3], undefined, 0.06);
      if (i === bays) continue;
      cb(k, g, [1.2, 0.3, 1.3], [x, y0 + pierH + 0.15, 0], S[2], undefined, 0.04);
    }
    // Every bay but the last (whose far pier has broken off) still carries its arch.
    for (let i = 0; i < bays - 1; i++) {
      const x = -len / 2 + (i + 0.5) * span;
      // A stepped arch: two corbel blocks narrowing the opening, a keystone course across.
      for (const sx of [-1, 1]) cb(k, g, [0.7, 0.45, 1.15], [x + sx * (span / 2 - 0.75), y0 + pierH + 0.52, 0], S[1], undefined, 0.05);
      cb(k, g, [span + 0.2, 0.55, 1.2], [x, y0 + pierH + 1.0, 0], S[(i + 1) % 3], undefined, 0.05);
      // The deck's parapet blocks, some fallen away.
      if (hash01(i, bays) < 0.7) cb(k, g, [span * 0.8, 0.4, 0.4], [x + (hash01(i, 3) - 0.5) * 0.5, y0 + pierH + 1.48, 0.42], S[i % 3], undefined, 0.04);
    }
    // The broken end: a fallen voussoir block half in the water.
    cb(k, g, [1.3, 0.55, 1.0], [len / 2 - 0.9, -0.35, 0.9], S[0], [0.3, 0.6, 0.2], 0.05);
  },
  /** The temple's stepped dais with the altar on top (faces +Z). */
  temple_dais: (k, g) => {
    const DAIS = [0x6a6860, 0x6e6a66, 0x7a7870];
    const steps: [number, number, number][] = [[10.4, 5.4, 0.3], [8.2, 4.4, 0.3], [6.0, 3.4, 0.3]];
    let y = -0.05;
    steps.forEach(([sw, sd, sh], i) => {
      cb(k, g, [sw, sh, sd], [0, y + sh / 2, -(5.4 - sd) / 2 * 0.6], DAIS[i], undefined, 0.06);
      y += sh;
    });
    const top = y, zc = -(5.4 - 3.4) / 2 * 0.6;
    // The altar: a heavy block on a footing, a darker slab lid, the seal's socket glowing faintly.
    cb(k, g, [3.0, 0.3, 1.6], [0, top + 0.15, zc - 0.2], STONE_DD, undefined, 0.05);
    cb(k, g, [2.6, 0.8, 1.2], [0, top + 0.7, zc - 0.2], 0x6e6a66, undefined, 0.06);
    cb(k, g, [2.9, 0.2, 1.5], [0, top + 1.2, zc - 0.2], 0x7a7870, undefined, 0.04);
    k.box(g, [0.9, 0.05, 0.6], [0, top + 1.32, zc - 0.2], 0x4a1c0c, undefined, PAL.fire, 0.35);
    // Two tall broken stelae behind it.
    for (const sx of [-1, 1]) cb(k, g, [0.9, sx > 0 ? 2.4 : 3.1, 0.6], [sx * 2.4, top + (sx > 0 ? 1.2 : 1.55), zc - 1.1], 0x6e6a66, [0, 0, sx * 0.03], 0.08);
  },
  /**
   * The cultists' dais (the way in runs along local +X): three stepped
   * square tiers of dark basalt-grey stone, a ritual circle inlaid in the top (a ring and four
   * spokes, a faint ember glow), and the altar block at the back with the cult's sigil stone.
   */
  ritual_dais: (k, g) => {
    const SH = [0x4a4440, 0x554c48, 0x5e5650];
    const tiers: [number, number][] = [[8.2, 0.3], [6.6, 0.3], [5.0, 0.28]];
    let y = -0.05;
    tiers.forEach(([s, h], i) => {
      cb(k, g, [s, h, s], [0, y + h / 2, 0], SH[i], undefined, 0.07);
      y += h;
    });
    const top = y, GLOW = 0x6a2410;
    // Ritual circle: an octagonal ring of thin inlaid strips with four spokes to a centre stone.
    const R = 1.7;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      k.box(g, [1.36, 0.03, 0.12], [Math.sin(a) * R, top + 0.015, Math.cos(a) * R], GLOW, [0, a, 0], PAL.fire, 0.35);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      k.box(g, [0.09, 0.03, 1.1], [Math.sin(a) * 0.95, top + 0.015, Math.cos(a) * 0.95], GLOW, [0, a, 0], PAL.fire, 0.3);
    }
    cb(k, g, [0.6, 0.12, 0.6], [0, top + 0.06, 0], 0x3a3230, [0, Math.PI / 4, 0], 0.04);
    // The altar at the back (−X), facing the way in: a heavy block, a slab lid, a sigil stone.
    cb(k, g, [1.3, 0.9, 2.4], [-1.6, top + 0.45, 0], 0x3e3634, undefined, 0.06);
    cb(k, g, [1.5, 0.18, 2.6], [-1.6, top + 0.99, 0], 0x554c48, undefined, 0.04);
    k.mesh(g, taper(0.55, 0.3, 0.3, 0.16, 1.3, 0, 0), 0x3a3230, [-1.95, top + 1.73, 0]);
    k.box(g, [0.05, 0.36, 0.16], [-1.66, top + 1.7, 0], GLOW, undefined, PAL.fire, 0.6);
    k.box(g, [0.05, 0.12, 0.34], [-1.66, top + 1.62, 0], GLOW, undefined, PAL.fire, 0.6);
  },
  /**
   * An obelisk of the processional way (`arg` = 0 standing, 1 broken off, 2 toppled): a tapered
   * dark shaft on a stepped plinth with a pyramid cap and a line of faint runes on its face (+Z).
   */
  obelisk: (k, g, v) => {
    const s = v ?? 0, OB = 0x3e3634, OB_L = 0x4a4240, RUNE = 0x8a2a14;
    cb(k, g, [1.3, 0.3, 1.3], [0, 0.1, 0], 0x554c48, undefined, 0.05);
    cb(k, g, [1.0, 0.3, 1.0], [0, 0.4, 0], OB_L, undefined, 0.05);
    if (s === 0) {
      k.mesh(g, taper(0.72, 0.72, 0.46, 0.46, 3.4, 0, 0), OB, [0, 2.25, 0]);
      k.mesh(g, taper(0.5, 0.5, 0.02, 0.02, 0.5, 0, 0), OB_L, [0, 4.2, 0]);
      for (const y of [1.3, 1.9, 2.5]) k.box(g, [0.18, 0.2, 0.04], [0, y, 0.33 - (y - 0.55) * 0.038], RUNE, undefined, PAL.fire, 0.4);
    } else {
      // Broken off at a slant, the top lying where it fell.
      k.mesh(g, taper(0.72, 0.72, 0.6, 0.6, 1.5, 0, 0), OB, [0, 1.3, 0]);
      k.mesh(g, taper(0.62, 0.62, 0.62, 0.62, 0.3, 0.12, 0), OB_L, [0, 2.1, 0], [0, 0, 0.12]);
      k.box(g, [0.18, 0.2, 0.04], [0, 1.3, 0.35], RUNE, undefined, PAL.fire, 0.4);
      if (s === 2) {
        const top = new THREE.Group();
        top.position.set(2.1, 0.3, 0.3);
        top.rotation.set(0, 0.35, -Math.PI / 2 + 0.06);
        g.add(top);
        k.mesh(top, taper(0.6, 0.6, 0.46, 0.46, 2.1, 0, 0), OB, [0, 1.05, 0]);
        k.mesh(top, taper(0.5, 0.5, 0.02, 0.02, 0.5, 0, 0), OB_L, [0, 2.35, 0]);
      }
    }
  },
  /** A cult banner: a tall iron-shod pole with a crossbar and a long crimson cloth bearing the sigil. */
  cult_banner: (k, g) => {
    cb(k, g, [0.6, 0.3, 0.6], [0, 0.1, 0], 0x4a4240, undefined, 0.05);
    cb(k, g, [0.14, 3.8, 0.14], [0, 1.9, 0], WOOD_D, undefined, 0.02);
    k.mesh(g, taper(0.14, 0.14, 0.01, 0.01, 0.4), IRON, [0, 4.0, 0]);
    cb(k, g, [1.2, 0.1, 0.1], [0, 3.55, 0], IRON, undefined, 0.02);
    cb(k, g, [1.0, 2.0, 0.05], [0, 2.5, 0.07], 0x6a2020, undefined, 0.01);
    for (const x of [-0.27, 0.27]) cb(k, g, [0.46, 0.4, 0.05], [x, 1.31, 0.07], 0x6a2020, undefined, 0.01);
    // The sigil: a dark ring with an ember eye.
    cb(k, g, [0.46, 0.46, 0.04], [0, 2.75, 0.11], 0x2a1414, [0, 0, Math.PI / 4], 0.02);
    k.box(g, [0.16, 0.16, 0.03], [0, 2.75, 0.135], 0xc85020, [0, 0, Math.PI / 4], PAL.fire, 0.35);
  },
  altar: (k, g) => {
    cb(k, g, [3.4, 0.3, 2.0], [0, 0.15, 0], STONE_DD, undefined, 0.05);
    cb(k, g, [3, 0.8, 1.6], [0, 0.7, 0], STONE_D, undefined, 0.06);
    cb(k, g, [3.2, 0.2, 1.8], [0, 1.2, 0], STONE, undefined, 0.04);
    k.box(g, [1, 0.05, 0.8], [0, 1.32, 0], PAL.fire, undefined, PAL.fire, 1.2);
  },
  bones: (k, g, v) => bonePile(k, g, v ?? 0),
  hoard: (k, g) => {
    // Stepped heaps of gold, scattered coins, ingots, an open chest and a ruby.
    cb(k, g, [1.8, 0.2, 1.4], [0, 0.1, 0], PAL.gold, [0, 0.3, 0], 0.08, 0x5a3a00);
    cb(k, g, [1.2, 0.2, 0.9], [0.1, 0.3, 0], PAL.gold, [0, 0.7, 0], 0.08, 0x5a3a00);
    cb(k, g, [0.6, 0.2, 0.5], [0.05, 0.5, 0.05], PAL.gold, [0, 0.2, 0], 0.06, 0x5a3a00);
    for (let i = 0; i < 9; i++) k.mesh(g, octagon(0.14, 0.04), PAL.gold, [Math.sin(i * 2.1) * 1.4, 0.03, Math.cos(i * 1.7) * 1.1], [0, i, Math.PI / 2], 0x5a3a00);
    for (let i = 0; i < 3; i++) k.mesh(g, taper(0.5, 0.24, 0.4, 0.16, 0.14), PAL.gold, [0.9 + i * 0.1, 0.07 + i * 0.14, -0.5], [0, 0.4 + i * 0.3, 0], 0x5a3a00);
    cb(k, g, [0.24, 0.24, 0.24], [0.2, 0.7, 0], 0xe0304a, [0.6, 0.6, 0], 0.05, 0xa01a2a, 0.6);
    cb(k, g, [0.9, 0.55, 0.62], [-1.0, 0.28, -0.5], PAL.wood, [0, 0.4, 0], 0.04);
    cb(k, g, [0.94, 0.08, 0.66], [-1.0, 0.5, -0.5], IRON, [0, 0.4, 0], 0.03);
  },
  lantern: (k, g) => {
    cb(k, g, [0.34, 0.44, 0.34], [0, 2.2, 0], IRON, undefined, 0.04);
    k.box(g, [0.24, 0.3, 0.24], [0, 2.2, 0], 0xffd080, undefined, 0xffb040, 2.5);
    cb(k, g, [0.1, 2.2, 0.1], [0, 1.1, 0], PAL.wood, undefined, 0.02);
    k.mesh(g, taper(0.4, 0.4, 0.1, 0.1, 0.16), IRON, [0, 2.5, 0]);
    return { obj: g, light: light(g, 0xffa050, 12, 12, 2.2) };
  },
  // A miner's wall lamp: a timber post set against the rock (its back at -Z), an arm reaching out
  // over the floor and a lantern hanging from it, throwing a warm pool across the wall and the ore
  // in front of it.
  wall_lantern: (k, g) => {
    chunk(k, g, 171, [0.55, 0.28, 0.5], [0, -0.06, -0.1], 0x5a4a3c, 0.4);
    cb(k, g, [0.26, 2.9, 0.26], [0, 1.45, -0.1], WOOD_D, [0.03, 0, 0], 0.04);
    cb(k, g, [0.2, 0.2, 1.05], [0, 2.82, 0.32], WOOD, undefined, 0.03);
    cb(k, g, [0.1, 0.5, 0.1], [0, 2.45, 0.1], WOOD_D, [0.75, 0, 0], 0.02);
    k.box(g, [0.04, 0.36, 0.04], [0, 2.56, 0.7], IRON);
    cb(k, g, [0.32, 0.4, 0.32], [0, 2.2, 0.7], IRON, undefined, 0.03);
    k.box(g, [0.22, 0.28, 0.22], [0, 2.2, 0.7], 0xffd890, undefined, 0xffb040, 2.8);
    k.mesh(g, taper(0.38, 0.38, 0.1, 0.1, 0.14), IRON, [0, 2.4, 0.7]);
    const l = light(g, 0xffa458, 15, 12, 2.0);
    l.position.z = 1.0;
    return { obj: g, light: l };
  },
  crystal: (k, g) => {
    k.mesh(g, prism(0.26, 0.9, 0.35), 0xff8a3a, [0, 0, 0], [0.2, 0.4, 0.1], 0xff5a1a);
    k.mesh(g, prism(0.18, 0.6, 0.35), 0xff8a3a, [0.25, 0, 0.1], [-0.3, 1.2, -0.3], 0xff5a1a);
  },
  chest: (k, g) => {
    const on = new THREE.Group();
    g.add(on);
    cb(k, on, [1, 0.6, 0.7], [0, 0.3, 0], PAL.wood, undefined, 0.04);
    cb(k, on, [1.04, 0.22, 0.74], [0, 0.71, 0], PAL.leather, undefined, 0.04);
    for (const x of [-0.32, 0.32]) k.box(on, [0.08, 0.84, 0.76], [x, 0.42, 0], IRON);
    k.box(on, [0.2, 0.2, 0.06], [0, 0.52, 0.37], PAL.gold);
    return { obj: g, setState: (s) => (on.visible = s === 'restored') };
  },
  pedestal: (k, g) => {
    cb(k, g, [1.0, 0.2, 1.0], [0, 0.1, 0], STONE_D, undefined, 0.05);
    k.mesh(g, taper(0.64, 0.64, 0.46, 0.46, 0.75), STONE, [0, 0.575, 0]);
    cb(k, g, [0.72, 0.14, 0.72], [0, 1.02, 0], STONE_D, undefined, 0.04);
    const frag = new THREE.Group();
    g.add(frag);
    k.box(frag, [0.3, 0.06, 0.24], [0, 1.14, 0], 0x3a2a24, [0, 0.4, 0]);
    k.box(frag, [0.14, 0.03, 0.1], [0, 1.18, 0], PAL.fire, [0, 0.4, 0], PAL.fire, 2);
    return { obj: g, setState: (s) => (frag.visible = s !== 'taken'), tick: (t) => (frag.position.y = Math.sin(t * 2) * 0.05) };
  },
  gate: (k, g) => {
    // The sealed lair gate: a basalt masonry wall with buttresses, merlons and an iron door
    // bearing a glowing octagonal seal.
    const dark = [0x4a4240, 0x3e3634, 0x554c48];
    masonry(k, g, { x: 0, z: 0, rot: 0, len: 5.2, y0: 0, rows: 7, rowH: 0.72, thick: 1.2, seed: 31, shades: dark, unit: 1.2, hole: { u: 0, w: 3.0, h: 3.9 } });
    cb(k, g, [3.6, 0.6, 1.3], [0, 4.1, 0.05], 0x3a3230, undefined, 0.06);
    for (const sx of [-1, 1]) k.mesh(g, taper(1.0, 1.6, 0.6, 1.0, 5.4, 0, -0.2), 0x3a3230, [sx * 2.75, 2.7, 0.1]);
    for (const x of [-2, -0.7, 0.7, 2]) cb(k, g, [0.8, 0.6, 1.0], [x, 5.34, 0], dark[0], undefined, 0.05);
    k.box(g, [3.0, 3.9, 0.4], [0, 1.95, 0], DARK);
    const door = new THREE.Group();
    g.add(door);
    cb(k, door, [3, 3.8, 0.4], [0, 1.9, 0.4], IRON, undefined, 0.05);
    for (const y of [0.7, 1.9, 3.1]) k.box(door, [3.04, 0.12, 0.06], [0, y, 0.62], 0x2e2e34);
    const sealGeo = octagon(0.8, 0.1);
    const seal = k.mesh(door, sealGeo, PAL.fire, [0, 2, 0.66], [0, Math.PI / 2, 0], PAL.fire);
    seal.name = 'seal';
    const l = light(g, 0xff5a1a, 6, 8, 2);
    l.position.z = 1.5;
    return {
      obj: g, light: l,
      tick: (t) => ((seal.material as THREE.MeshStandardMaterial).emissiveIntensity = 1 + Math.sin(t * 2) * 0.5),
      setState: (s) => {
        door.visible = s !== 'open';
        l.color.setHex(s === 'open' ? 0xff2a1a : 0xff5a1a);
      },
    };
  },
};

/**
 * Merge a kit-built prop's static meshes: within each parent group, unnamed meshes sharing a
 * material become one mesh. A palisade drops from ~60 draw calls to 2, a tower from hundreds of
 * blocks to a handful, a portal's rune inlays to one. Groups toggled by setState and named parts
 * animated by tick (flames, seals) stay separate, so behaviour is unchanged.
 */
export function mergeStatic(root: THREE.Object3D, lay?: (m: THREE.Mesh) => MasonOpts | null) {
  const parents = new Set<THREE.Object3D>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.parent && !o.children.length) parents.add(o.parent);
  });
  for (const parent of parents) {
    const groups = new Map<THREE.Material, THREE.Mesh[]>();
    for (const c of parent.children) {
      if (!(c instanceof THREE.Mesh) || c.children.length || c.name || Array.isArray(c.material)) continue;
      const m = c.material;
      if (!(m instanceof THREE.MeshStandardMaterial)) continue;
      const list = groups.get(m) ?? [];
      list.push(c);
      groups.set(m, list);
    }
    for (const [mat, meshes] of groups) {
      // Single meshes are baked too, so every static part shares the prop's own space (painted
      // patterns line up across its parts and follow the prop as a whole).
      // (Dressed stone takes its own stone layout first, in its own space: see masonry.ts.)
      const merged = mergeGeometries(meshes.map((m) => {
        m.updateMatrix();
        const mason = lay?.(m);
        let geo = mason ? masonGeometry(m.geometry, mason).applyMatrix4(m.matrix) : m.geometry.clone().applyMatrix4(m.matrix);
        for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'aMason' && k !== 'aMasonK' && k !== 'aMasonF') geo.deleteAttribute(k);
        if (geo.index) geo = geo.toNonIndexed();
        return geo;
      }));
      if (!merged) continue;
      for (const m of meshes) m.removeFromParent();
      parent.add(new THREE.Mesh(merged, mat));
    }
  }
}

/**
 * The geometry audit (tests/castle-geometry.test.ts): while `on`, every finished prop and building
 * keeps the list of its parts as built, before its static meshes are merged, so the audit can test
 * each block against the others (clipping, floating, doors and windows on their walls).
 */
export const PART_AUDIT = { on: false };

/** One dressed-stone part's stone layout (see masonLayout): its bounds and course breaks in the prop's space. */
export interface CourseRecord {
  color: number;
  box: THREE.Box3;
  breaks: number[];
  /** Its course height (the deep base course is laid in its own). */
  course: number;
  /** Laid as one stone, or laying its own stones (voussoirs, kerbs, a band along a run): no courses. */
  single: boolean;
  laid: boolean;
}

/** One built part: its geometry's bounds in its own space, placed by `m` in the prop's space. */
export interface Part {
  /** 'cyl': a cylinder or cone round its own Y axis (radius `r` at its foot, `rTop` at its top); 'box' anything else (its bounds). */
  shape: 'box' | 'cyl';
  m: THREE.Matrix4;
  min: THREE.Vector3;
  max: THREE.Vector3;
  r: number;
  rTop: number;
  color: number;
  /** What the part is, where a rule needs to know (userData.part: 'door-leaf', 'handle', 'glass', 'doorway'…). */
  tag?: string;
  /** Extra facts a tagged part carries (userData.audit: a door's class and size…). */
  info?: Record<string, unknown>;
  /** Effects (water, foam, flames) take no part in the solid checks. */
  fx: boolean;
  /** See-through (glass) or cloth: it hangs on or sits in a solid, but is no solid itself. */
  thin: boolean;
  /** Its bounds are not its body (a ring round a hole, the spandrels round an opening). */
  hollow: boolean;
  /** A ring round its own Y axis: inner radius (its outer radius is `r`). */
  rIn: number;
  /** Which mesh it came from (the boxes one shaped mesh lists share it). */
  mesh: number;
  /** Part of a furnishing inside a building (a table, a cask), not of its architecture. */
  fit: boolean;
  /** A cylinder's number of flat sides (a drum is a polygon: what stands on it stands on a facet). */
  sides?: number;
  /**
   * A drum laid in rings of flat stones, each course turned half a stone on the next (masonry.ts,
   * laidDrum): no one facet runs up it, so what stands on it hugs the round of its corners.
   */
  round?: boolean;
  /** A true box (a block or a chamfered block): its bounds are its faces. */
  box?: boolean;
  /** A drum cut back where doorways open in it: the audit sees the whole drum, the doorways stand in it. */
  notched?: boolean;
}

function recordParts(g: THREE.Object3D) {
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert(), parts: Part[] = [];
  let mesh = 0;
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    mesh++;
    let fit = false;
    for (let a: THREE.Object3D | null = o; a && a !== g; a = a.parent) if (a.userData.furnishing) fit = true;
    const geo = o.geometry as THREE.BufferGeometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    const p = geo as THREE.CylinderGeometry, ring = geo.userData.ring as [number, number] | undefined;
    const laid = geo.userData.drum as { r: number; rTop: number; sides: number } | undefined;
    const cyl = p.type === 'CylinderGeometry' || p.type === 'ConeGeometry' || !!ring;
    const fx = !(mat instanceof THREE.MeshStandardMaterial) || o.name === 'flame';
    // A shape whose bounds are not its body (an arch through a wall, a border round a bed) lists the
    // boxes it fills: [min…, max…] in its own space, or a box turned about Y ({ c, h, ry }).
    type Box = number[] | { c: number[]; h: number[]; ry: number };
    const boxes = (geo.userData.boxes as Box[] | undefined) ?? [[...geo.boundingBox!.min.toArray(), ...geo.boundingBox!.max.toArray()]];
    const base = inv.clone().multiply(o.matrixWorld);
    for (const bx of boxes) parts.push({
      shape: cyl ? 'cyl' : 'box',
      ...(Array.isArray(bx)
        ? { m: base.clone(), min: new THREE.Vector3(bx[0], bx[1], bx[2]), max: new THREE.Vector3(bx[3], bx[4], bx[5]) }
        : { m: base.clone().multiply(new THREE.Matrix4().makeRotationY(bx.ry).setPosition(bx.c[0], bx.c[1], bx.c[2])), min: new THREE.Vector3(-bx.h[0], -bx.h[1], -bx.h[2]), max: new THREE.Vector3(bx.h[0], bx.h[1], bx.h[2]) }),
      r: laid ? laid.r : ring ? ring[1] : cyl ? (p.parameters.radiusBottom ?? (p.parameters as unknown as { radius: number }).radius ?? 0) : 0,
      rTop: laid ? laid.rTop : ring ? ring[1] : cyl ? (p.parameters.radiusTop ?? 0) : 0, rIn: ring ? ring[0] : 0,
      color: mat instanceof THREE.MeshStandardMaterial ? mat.color.getHex() : 0, tag: o.userData.part ?? (o.name === 'glass' || o.name === 'cloth' || o.name === 'room' ? o.name : undefined), info: o.userData.audit, fx,
      thin: !fx && (!!(mat as THREE.Material).transparent || o.name === 'glass' || o.name === 'cloth' || o.name === 'room'), hollow: !!geo.userData.hollow, mesh, fit,
      sides: p.type === 'CylinderGeometry' ? p.parameters.radialSegments : laid?.sides, round: !!laid,
      box: !geo.userData.boxes && (p.type === 'BoxGeometry' || !!geo.userData.box), notched: !!geo.userData.notched,
    });
  });
  g.userData.parts = parts;
}

/** The painted pattern a finished prop's material takes (see finishProp), or null when it takes none. */
function paintKindOf(m: THREE.MeshStandardMaterial): PaintKind | null {
  const hex = m.color.getHex();
  if (m.userData.cloth || METALS.has(hex) || BRONZES.has(hex) || hex === MEMBRANE || hex === ROCK_WET || hex === PUDDLE || GLOSSY.has(hex)) return null;
  return m.emissive.getHex() === 0 || m.emissiveIntensity === 0 ? paintFor(hex) : null;
}

/**
 * The stone layout of a finished prop's dressed stone (masonry.ts): for each part painted as masonry
 * or ashlar, its courses run up from the prop's foot, broken at every band that crosses its faces (a
 * string course, a plinth, a coping: any long, low part laid over it), so the courses fit whole
 * between the bands, every part of one face shares them, and over the last band they run on at one
 * course height. The castle lays all its bands on the course lines (masonry.ts), so its courses are
 * one height everywhere and line up from piece to piece.
 */
function masonLayout(g: THREE.Object3D) {
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert();
  const parts: { mesh: THREE.Mesh; box: THREE.Box3; mason: boolean; color: number; square: boolean }[] = [];
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material) || !(o.material instanceof THREE.MeshStandardMaterial) || o.material.transparent) return;
    const geo = o.geometry as THREE.BufferGeometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const kind = paintKindOf(o.material), m = inv.clone().multiply(o.matrixWorld), e = m.elements;
    // (Square: upright and turned about Y by right angles only.)
    const square = Math.abs(e[1]) < 1e-4 && Math.abs(e[9]) < 1e-4 && (Math.abs(e[0]) < 1e-4 || Math.abs(e[2]) < 1e-4);
    parts.push({ mesh: o, box: geo.boundingBox!.clone().applyMatrix4(m), mason: kind === 'masonry' || kind === 'ashlar', color: o.material.color.getHex(), square });
  });
  const stone = parts.filter((p) => p.mason);
  if (!stone.length) return () => null;
  // The courses count up from the ground the prop stands on (its origin), where its walling reaches it
  // (a foundation sunk below it, a floor or a threshold laid a hair into it, moves no course), or from
  // the walling's own foot where that stands clear above it.
  const walling = stone.filter((p) => p.box.max.y - p.box.min.y >= 0.2);
  const foot = Math.max(0, Math.min(...(walling.length ? walling : stone).map((p) => p.box.min.y)));
  // A band is a long, low course of stone (a sill or a lintel is no course, and lays none of its own
  // into the walling).
  const bands = stone.filter((p) => p.box.max.y - p.box.min.y <= 0.8 && Math.max(p.box.max.x - p.box.min.x, p.box.max.z - p.box.min.z) >= 2);
  const of = new Map<THREE.Mesh, (typeof parts)[number]>(parts.map((p) => [p.mesh, p]));
  return (mesh: THREE.Mesh): MasonOpts | null => {
    const p = of.get(mesh);
    if (!p?.mason) return null;
    const b = p.box, dx = b.max.x - b.min.x, dz = b.max.z - b.min.z, alongX = dx >= dz;
    // (Across its faces, and along them.)
    const ax = alongX ? 'z' : 'x', run = alongX ? 'x' : 'z';
    // (A part laid in the deliberate other size names its course height and stone length, and is
    // laid in courses of its own: see `deep`.)
    const course = mesh.userData.course as number | undefined, stoneLen = mesh.userData.stone as number | undefined;
    const ys = course ? [foot, b.min.y, b.max.y] : [foot];
    // (A band is one course of its own: its foot and top lie on course lines, the same lines the
    // walling behind it is laid to, so a course standing proud round a drum lines up with its stones.
    // A strip of walling under or over an opening is no band: it lies flush on the walling of its own
    // stone over or under it, in the courses of the wall it is part of.)
    const strip = stone.some((q) => q !== p && q.color === p.color && Math.abs(q.box.min[ax] - b.min[ax]) < 0.03 && Math.abs(q.box.max[ax] - b.max[ax]) < 0.03 && (Math.abs(q.box.min.y - b.max.y) < 0.02 || Math.abs(q.box.max.y - b.min.y) < 0.02) && Math.min(q.box.max[run], b.max[run]) - Math.max(q.box.min[run], b.min[run]) > 0.05);
    if (!course && b.max.y - b.min.y <= 0.8 && !strip) ys.push(b.min.y, b.max.y);
    if (!course) for (const q of bands) {
      if (q === p || q.box.min.y <= b.min.y + 0.02 && q.box.max.y >= b.max.y - 0.02) continue;
      const qb = q.box;
      if (qb.max.x < b.min.x - 0.3 || qb.min.x > b.max.x + 0.3 || qb.max.z < b.min.z - 0.3 || qb.min.z > b.max.z + 0.3) continue;
      // It crosses the part's face: it stands proud of it, against it. (A floor, a deck or a roof
      // reaching in from it is no band on it, nor is the walling laid flush beside it.)
      const outA = qb.max[ax] - b.max[ax], outB = b.min[ax] - qb.min[ax];
      if (Math.max(outA, outB) < 0.03 || outA > 0.6 || outB > 0.6) continue;
      // (A thin strip, a gutter's edge or a threshold, is no course, but for a coping laid on its top.)
      if (qb.max.y - qb.min.y < 0.15 && Math.abs(qb.min.y - b.max.y) > 0.02) continue;
      const cover = alongX ? Math.min(qb.max.x, b.max.x) - Math.max(qb.min.x, b.min.x) : Math.min(qb.max.z, b.max.z) - Math.max(qb.min.z, b.min.z);
      if (cover < 0.7 * (alongX ? dx : dz)) continue;
      ys.push(qb.min.y, qb.max.y);
    }
    // The whole face a square part is laid in: the parts of its stone and its wall's thickness that
    // run on from it edge to edge, along X and along Z.
    const reach = (ax: 'x' | 'z') => {
      const ox = ax === 'x' ? 'z' : 'x';
      const row = stone.filter((q) => q.square && q.color === p.color && Math.abs(q.box.min[ox] - b.min[ox]) < 0.05 && Math.abs(q.box.max[ox] - b.max[ox]) < 0.05);
      let lo = b.min[ax], hi = b.max[ax], grew = true;
      while (grew) {
        grew = false;
        for (const q of row) if (q.box.min[ax] < lo - 1e-6 && q.box.max[ax] >= lo - 0.05 || q.box.max[ax] > hi + 1e-6 && q.box.min[ax] <= hi + 0.05) {
          lo = Math.min(lo, q.box.min[ax]);
          hi = Math.max(hi, q.box.max[ax]);
          grew = true;
        }
      }
      return [lo, hi];
    };
    // (A part cut from a mass round an opening names the mass's whole face: see `carved`.)
    const named = mesh.userData.face as MasonOpts['face'];
    const [x0, x1] = named ? [named.x0, named.x1] : reach('x'), [z0, z1] = named ? [named.z0, named.z1] : reach('z');
    const face = named ?? (p.square ? { x0, x1, z0, z1 } : undefined);
    const c = b.getCenter(new THREE.Vector3());
    // (A part no bigger than one stone, a merlon, a quoin, a voussoir, is laid as one stone.)
    const single = !named && Math.max(dx, dz) <= STONE_LEN * 1.3 && b.max.y - b.min.y <= 0.8;
    const opts = { single, face, course, stone: stoneLen, m: inv.clone().multiply(mesh.matrixWorld), breaks: cleanBreaks(ys.filter((y) => y >= foot - 1e-6)), seed: Math.floor((face ? hash01(x0, x1, z0 + z1, p.color) : hash01(c.x, c.y, c.z)) * 97) };
    if (PART_AUDIT.on) (g.userData.courses ??= []).push({ color: p.color, box: b.clone(), breaks: opts.breaks, course: course ?? COURSE, single, laid: !!mesh.geometry.getAttribute('aMason') || !!mesh.geometry.getAttribute('aLay') } satisfies CourseRecord);
    return opts;
  };
}

/**
 * Finish a kit-built prop: merge static meshes, give materials their look (shiny metal, glossy
 * coal, painted albedo) and set shadow flags.
 */
export function finishProp(g: THREE.Object3D, kits: ModelKit[]) {
  if (PART_AUDIT.on) recordParts(g);
  mergeStatic(g, masonLayout(g));
  for (const m of kits.flatMap((k) => k.mats)) {
    // Iron and gold fittings shine; coal and obsidian are glossy; grey masonry gets a gentle
    // stone detail (lined up in world space); everything else stays clean flat colour.
    const hex = m.color.getHex();
    if (m.userData.cloth) continue;
    if (METALS.has(hex)) applyFinish(m, 'metal');
    else if (BRONZES.has(hex)) {
      // Cast bronze: polished metal, so the low sun and the studio's softboxes put hot highlights on
      // the ridges, horns and spine plates while the hollows stay dark.
      // (Smooth-shaded over its broad facets, so the body catches the light as curved metal; the
      // hollows take a darker patina from the paint.)
      applyPaint(m, 'soft', 'object');
      Object.assign(m, { metalness: 0.9, roughness: 0.25, envMap: studioEnv(), envMapIntensity: 1.7, flatShading: false });
      m.userData.smooth = true;
      m.needsUpdate = true;
    } else if (hex === MEMBRANE) {
      // The wing membranes: the same bronze a value darker, a little less polished, so their backs
      // read as warm bronze (not black) where they face away from the sky.
      applyPaint(m, 'soft', 'object');
      Object.assign(m, { metalness: 0.75, roughness: 0.32, envMap: studioEnv(), envMapIntensity: 1.5 });
      m.needsUpdate = true;
    }
    else if (hex === ROCK_WET) {
      // Wet rock: the rock's own paint, darker, with a soft sheen of the sky on it.
      applyPaint(m, 'rock', 'object');
      Object.assign(m, { roughness: 0.32, metalness: 0.08, envMap: studioEnv(), envMapIntensity: 0.6 });
      m.needsUpdate = true;
    } else if (hex === PUDDLE) {
      // Still water: dark teal (the mine's water colour) with a sheen of the cave light, no texture.
      Object.assign(m, { roughness: 0.08, metalness: 0, envMap: studioEnv(), envMapIntensity: 0.55 });
      m.needsUpdate = true;
    } else if (GLOSSY.has(hex)) {
      Object.assign(m, { roughness: 0.2, metalness: 0.25, envMap: studioEnv(), envMapIntensity: 1.1 });
      m.needsUpdate = true;
    } else if (m.emissive.getHex() === 0 || m.emissiveIntensity === 0) {
      applyPaint(m, paintFor(hex), 'object');
    }
  }
  g.traverse((o) => {
    if (o instanceof THREE.Mesh && !Array.isArray(o.material) && o.material.userData.smooth) o.geometry = toCreasedNormals(o.geometry, Math.PI / 3.2);
    if (o instanceof THREE.Mesh) {
      const fx = o.material instanceof THREE.ShaderMaterial;
      o.castShadow = !fx && !(o.material as THREE.Material).userData.decal;
      o.receiveShadow = !fx;
    }
  });
}

/** Big walls that should dissolve around the hero when they stand between them and the camera. */
export const OCCLUDING_PROPS = new Set(['castle_wall', 'round_tower', 'corner_tower', 'door_turret', 'outer_gatehouse', 'postern', 'ward_gate', 'donjon', 'pavilion', 'forge_canopy', 'dragon_fountain', 'great_doors', 'pergola', 'garden_tree', 'wall_climber', 'tower_flag']);

/** Every code-built prop kind (plus 'portal' and 'rock_<ore>', built by their own functions). */
export const PROP_KINDS = Object.keys(BUILDERS);

/** Build a prop by kind. GLB `prop_<kind>` overrides the code-built prop when present. */
export function buildProp(kind: string, arg?: any): Prop {
  if (hasModel(`prop_${kind}`)) {
    const m = makeModel(`prop_${kind}`);
    const g = new THREE.Group();
    g.add(m.root);
    return { obj: g };
  }
  const k = new ModelKit();
  const g = new THREE.Group();
  let res: Prop | void;
  if (kind === 'arch' || kind === 'portal') res = portal(k, g, arg ?? null);
  else if (kind.startsWith('rock_')) res = oreRock(k, g, kind.slice(5));
  else res = BUILDERS[kind]?.(k, g, arg);
  finishProp(g, [k]);
  return res ?? { obj: g };
}
