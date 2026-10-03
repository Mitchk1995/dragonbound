import * as THREE from 'three';
import { CURTAIN_WALL } from '../data/castle';
import { shareResource } from '../render/resources';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ModelKit, PAL, type V3 } from '../render/kit';
import { hasModel, makeModel } from '../render/registry';
import { applyFinish, studioEnv } from '../render/env';
import { applyPaint, type PaintKind } from '../render/paint';
import { bondPhases, cleanBreaks, COURSE, Laid, laidDrum, masonGeometry, STONE as STONE_LEN, type DrumOpts, type LaidCorner, type MasonOpts } from '../render/masonry';
import { addPatch } from '../render/surface';
import { chamferBox, hash01, octagon, prism, rockBlock, slabBlock, taper, wedge } from '../render/blocks';
import { makePortal, type PortalSpec } from './portalFx';
import { fallingWaterMaterial, poolWater } from './water';

import { APPROACH_PROPS } from './castleProps/approach';
import { BAILEY_PROPS } from './castleProps/bailey';
import { CURTAIN_PROPS } from './castleProps/curtain';
import { WATER_PROPS } from './castleProps/water';
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
export const INLAY = 0x545e6c;
/** Kerbs and borders edging the castle's paving: the paving's own stone a shade darker. */
export const KERB = 0x736d66;
/** A road's flagstones laid as a prop (the climb's paving): the paved ground's own grey. */
export const PAVE = 0x8c8780;
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
export const ROCK_WET = 0x444a56;
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
export const CLIMBER_IVY = [0x55862f, 0x67973a, 0x7aa644], CLIMBER_ROSE_LEAF = [0x3e6e30, 0x4a7a36, 0x56863c], CLIMBER_BLOOM = [0xe0507a, 0xf08aa8, 0xf6eee2];
/** The garden trees' leaf (clipped green, pink blossom, gold, apple), painted as foliage like the island's trees. */
export const GARDEN_LEAF = [[0x3e6e2e, 0x4a7a34, 0x56883c], [0xe48aac, 0xf2b4c8, 0xd27298], [0xdcae46, 0xeac460, 0xc8983a], [0x44742f, 0x4f8036, 0x5a8c3e]];
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
export function softDisc(seed: number, r: number, rgb: [number, number, number], a: number) {
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

export type Builder = (k: ModelKit, g: THREE.Group, arg?: any) => Prop | void;

/** A prop's length argument: a number, or the `len` of `{ len, v }` (a length with a variant). */
export const lenOf = (arg: any): number | undefined => (typeof arg === 'number' ? arg : arg?.len);
/** A prop's variant (the `v` of `{ len, v }`), 0 if none. */
export const vOf = (arg: any): number => (arg !== null && typeof arg === 'object' ? arg.v ?? 0 : 0);

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
export function limb(k: ModelKit, g: THREE.Object3D, a: V3, b: V3, size: [number, number, number, number], color: number) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const L = d.length();
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return k.mesh(g, taper(size[0], size[1], size[2], size[3], L), color, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [e.x, e.y, e.z]);
}

/**
 * A rounded tapered segment from `a` to `b` (an eight-sided frustum, radius `r0` at `a`, `r1` at
 * `b`), squashed front to back by `flat`: bodies, necks and tails on statues.
 */
export function round(k: ModelKit, g: THREE.Object3D, a: V3, b: V3, r0: number, r1: number, color: number, flat = 1) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const L = d.length();
  // Turned an eighth so a flat face (not an edge) looks forward.
  const geo = new THREE.CylinderGeometry(r1, r0, L, 8, 1).rotateY(Math.PI / 8).scale(1, 1, flat);
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return k.mesh(g, geo, color, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [e.x, e.y, e.z]);
}

/** A faceted ball of radius `r` scaled by `size` (joints, haunches, a skull's dome). */
export function ball(k: ModelKit, g: THREE.Object3D, r: number, pos: V3, color: number, size: V3 = [1, 1, 1], rot?: V3) {
  const m = k.mesh(g, new THREE.IcosahedronGeometry(r, 1), color, pos, rot);
  m.scale.set(...size);
  return m;
}

// ─── Garden plants ───────────────────────────────────────────────────────────
// Chunky, readable plants for the castle's beds, each built of a few blocks so it reads as what it
// is from the play camera: tulips, rose bushes, lavender, delphiniums and daisies in the flower beds;
// cabbages, lettuces, carrots and leeks in the kitchen garden. Each stands on y = 0 at (x, z).
const STEM = 0x4a7a34, LEAF_G = 0x5a8a3a, LEAF_D = 0x3e6a2e;
export const PLANT = {
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

/** The champions' warm marble. */
export const MARBLE = 0xe2d6c0, MARBLE_D = 0xcab99c, MARBLE_L = 0xefe6d4;
paintAs('plaster', [MARBLE, MARBLE_D, MARBLE_L]);
/**
 * Cast bronze (the dragon and the fountain's spouts), worn gold where hands touch it. The wing
 * membranes are the same casting a value darker (MEMBRANE), never a painted panel of another colour.
 */
export const BRONZE = 0x8a5a2b, BRONZE_D = 0x5c3a1c, BRONZE_L = 0xa8743c, WORN = 0xd0a858, BELLY = 0x96642f, MEMBRANE = 0x74481f;
const BRONZES = new Set([BRONZE, BRONZE_D, BRONZE_L, WORN, BELLY]);

/**
 * A drum of stone laid in rings of flat stones round the axis at (x, z) of its group (masonry.ts,
 * laidDrum), in the colour given: a tower's shaft, a course standing proud round it, a parapet ring.
 */
export function drum(k: ModelKit, g: THREE.Object3D, o: Omit<DrumOpts, 'seed'>, color: number, x = 0, z = 0) {
  return k.mesh(g, laidDrum({ ...o, seed: Math.floor(hash01(o.r, o.y0, o.n, color) * 97) }), color, [x, 0, z]);
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
export function roomMat(k: ModelKit, lit: boolean) {
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
export function boardedLeaf(k: ModelKit, g: THREE.Object3D, o: { key: string; core: THREE.BufferGeometry; corePos: V3; x0: number; x1: number; top: (x: number) => number; dep: number; cls: keyof typeof DOORS; hinge: -1 | 1; latch: number; spring: number }) {
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
 * The feet of the courses that run round the castle's buildings and the great door's pavilions: the
 * floor line (BUILDING_FLOOR_LINE) and the course under the hall's parapet, so where a pavilion stands
 * against the hall its lines run on into the hall's.
 */
export const BUILDING_FLOOR_LINE = 5.0;

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

/**
 * Every code-built builder: this file's own and the castle's (castleProps/), merged on first use.
 * The castle files import this one, so they are not read while it loads.
 */
let allBuilders: Record<string, Builder> | undefined;
const builders = () => (allBuilders ??= { ...BUILDERS, ...CURTAIN_PROPS, ...WATER_PROPS, ...APPROACH_PROPS, ...BAILEY_PROPS });

/** Every code-built prop kind (plus 'portal' and 'rock_<ore>', built by their own functions). */
export const propKinds = () => Object.keys(builders());

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
  else res = builders()[kind]?.(k, g, arg);
  finishProp(g, [k]);
  return res ?? { obj: g };
}
