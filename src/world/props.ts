import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ModelKit, PAL, type V3 } from '../render/kit';
import { hasModel, makeModel } from '../render/registry';
import { applyFinish, studioEnv } from '../render/env';
import { applyPaint, type PaintKind } from '../render/paint';
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
 * for the masses (sunlit blocks paler, weathered courses darker), blue-grey dressings for the
 * continuous lines and frames (string courses, copings, corbels, hood moulds), darker blue-grey for
 * plinths, a grey deck for walks and platforms. The rest of the world keeps STONE.
 */
export const ASHLAR = 0xc8b898, ASHLAR_L = 0xd6c9ae, ASHLAR_W = 0xb2a487;
/** The buildings' (and the keep's) ivory, a clear step paler than the honey curtain and towers. */
export const ASHLAR_B = 0xefe3c8;
export const TRIM = 0x6f7b8c, TRIM_D = 0x545e6c, TRIM_L = 0x8994a3, DECK = 0x8a8478;
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
paintAs('masonry', [TRIM, TRIM_D, TRIM_L, DECK]);
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
const CLIMBER_IVY = [0x3f6e2c, 0x4f8034, 0x62923c], CLIMBER_ROSE_LEAF = [0x3e6e30, 0x4a7a36, 0x56863c], CLIMBER_BLOOM = [0xe0507a, 0xf08aa8, 0xf6eee2];
/** A climber's leaf card: a flat pointed leaf (a squashed octahedron), lying flat to the wall. */
const CLIMBER_LEAF = new THREE.OctahedronGeometry(1, 0);
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
  fanCache.set(key, geo);
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
  softCache.set(key, geo);
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
    const br = r * (0.16 + 0.22 * hash01(seed, i, 3)) * (1.2 - (0.5 * d) / r);
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
  plateCache.set(seed, geos);
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
  anvilCache.set(cracked, out);
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

/** A thin plate stretched over three points (a wing membrane panel), 0.04 thick. */
function sail(k: ModelKit, g: THREE.Object3D, pts: [V3, V3, V3], color: number) {
  const v = pts.map((p) => new THREE.Vector3(...p));
  const n = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0])).normalize().multiplyScalar(0.045);
  const geo = new ConvexGeometry([...v.map((p) => p.clone().add(n)), ...v.map((p) => p.clone().sub(n))]);
  return k.mesh(g, geo, color, [0, 0, 0]);
}

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

/** How a bronze dragon is posed: every value 0..1 except `jaw` (radians the lower jaw drops). */
export interface BeastPose {
  /** 0 sitting up with the forefeet planted, 1 rearing with the forelegs raised and clawing. */
  rear: number;
  /** 0 wings half spread, 1 fully spread and raised. */
  wings: number;
  /** 0 looking ahead, 1 the head thrown up. */
  head: number;
  jaw: number;
}

/** Bronze, worn gold where hands touch it, verdigris in the wing membranes. */
/** The champions' warm marble. */
const MARBLE = 0xe2d6c0, MARBLE_D = 0xcab99c, MARBLE_L = 0xefe6d4;
paintAs('plaster', [MARBLE, MARBLE_D, MARBLE_L]);
const BRONZE = 0x6b4423, BRONZE_D = 0x4c2e16, BRONZE_L = 0x8a5c2e, VERDIGRIS = 0x6a9284, VERDIGRIS_D = 0x5f8a7c, WORN = 0xc8a050, BELLY = 0x7c5629;
const BRONZES = new Set([BRONZE, BRONZE_D, BRONZE_L, WORN, BELLY]);
/** A soft, desaturated verdigris patina in the casting's recesses (the wings' inner panels by the body). */
const PATINA = new Set([VERDIGRIS, VERDIGRIS_D]);

/**
 * A bronze dragon (facing +Z, its hind feet on y = 0, about 3.4 tall at full rear): haunches down
 * and tail curled round beside it, the body rising to a deep chest, an S-curved neck with a spined
 * crest, a long-snouted head with swept horns and glowing eyes, wings spread on long finger bones
 * with scalloped membranes. Returns the point between its jaws (where a fountain's water pours).
 */
function dragonBeast(k: ModelKit, g: THREE.Object3D, pose: BeastPose): THREE.Vector3 {
  const B = BRONZE, BD = BRONZE_D, BL = BRONZE_L, GOLD = PAL.gold;
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const R = pose.rear, W = pose.wings;
  /** A tapering rounded chain through points, a ball at each joint so bends read as one body. */
  const chain = (pts: V3[], widths: number[], color: number, flat = 0.9) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const w0 = widths[i], w1 = widths[i + 1];
      round(k, g, pts[i], pts[i + 1], w0 / 2, w1 / 2, color, flat);
      if (i) ball(k, g, w0 / 2, pts[i], color, [1, 1, flat]);
    }
  };
  // Haunches: big thighs folded under, knees forward, long hind feet planted with gold claws.
  for (const s of [-1, 1]) {
    ball(k, g, 0.5, [s * 0.5, 0.46, -0.42], BD, [0.62, 0.86, 1.0], [0.35, s * 0.12, s * -0.1]);
    round(k, g, [s * 0.62, 0.66, 0.08], [s * 0.6, 0.12, -0.12], 0.15, 0.11, B);
    cb(k, g, [0.34, 0.16, 0.6], [s * 0.6, 0.08, 0.12], B, [0, s * -0.1, 0], 0.05);
    for (const c of [-1, 0, 1]) limb(k, g, [s * 0.6 + c * 0.1, 0.1, 0.38], [s * 0.6 + c * 0.12, 0.02, 0.56], [0.07, 0.08, 0.02, 0.02], GOLD);
  }
  // The body: belly, chest and shoulders rising from the hips, leaning forward as it rears.
  const lean = mix(0.45, 0.32, R);
  const spineAt = (t: number): V3 => [0, mix(0.5, mix(1.6, 2.05, R), t), mix(-0.58, -0.58 + lean, t)];
  chain([spineAt(0), spineAt(0.45), spineAt(0.8), spineAt(1)], [0.98, 0.9, 0.78, 0.62], B);
  // Paler belly scales down the front of the body: broad overlapping plates, each tapering to its
  // lower edge and tucked under the one below, narrowing toward the throat.
  const tilt = Math.atan2(lean, spineAt(1)[1] - 0.5);
  round(k, g, [0, spineAt(0.04)[1] - Math.sin(tilt) * 0.4, spineAt(0.04)[2] + Math.cos(tilt) * 0.4], [0, spineAt(0.96)[1] - Math.sin(tilt) * 0.25, spineAt(0.96)[2] + Math.cos(tilt) * 0.25], 0.3, 0.18, BELLY, 0.45);
  for (let i = 0; i < 8; i++) {
    const t = 0.05 + i * 0.12, p = spineAt(t), r = mix(0.49, 0.29, t), half = r * 0.86;
    k.mesh(g, taper(r * 0.62, 0.05, r * 1.0, 0.12, 0.3), i % 2 ? BELLY : BL, [0, p[1] - Math.sin(tilt) * half, p[2] + Math.cos(tilt) * half], [tilt + 0.16, 0, 0]);
  }
  // The neck in an S up from the shoulders, the head at its top.
  const top = spineAt(1), hu = pose.head;
  const neck: V3[] = [
    top,
    [0, top[1] + 0.38, top[2] - 0.04],
    [0, top[1] + 0.72, top[2] + 0.1],
    [0, top[1] + mix(0.92, 0.98, hu), top[2] + 0.36],
    [0, top[1] + mix(1.0, 1.08, hu), top[2] + 0.6],
  ];
  chain(neck, [0.56, 0.48, 0.42, 0.36, 0.32], B);
  // The dorsal crest: spines down the back of the neck and the body.
  const crest = (p: V3, h: number, rx: number) => k.mesh(g, prism(0.1, h, 0.4), BD, p, [rx, 0, 0]);
  for (let i = 0; i < neck.length - 1; i++) {
    const a = neck[i], b = neck[i + 1], dy = b[1] - a[1], dz = b[2] - a[2], l = Math.hypot(dy, dz);
    crest([0, (a[1] + b[1]) / 2 + (dz / l) * 0.17, (a[2] + b[2]) / 2 - (dy / l) * 0.17], 0.22 - i * 0.02, Math.atan2(dz, dy) - 0.6);
  }
  for (let i = 0; i < 4; i++) {
    const p = spineAt(0.2 + i * 0.22);
    crest([0, p[1] + Math.sin(tilt) * 0.42, p[2] - Math.cos(tilt) * 0.42], 0.26, tilt - 0.7);
  }
  // The head: skull and brow, the long upper snout, the lower jaw dropped open, teeth, horns.
  const hb = neck[neck.length - 1], pitch = mix(0.05, 0.5, hu);
  /** A point `d` along the head and `up` above its line, turned by `p` (the head's pitch). */
  const fwd = (d: number, up: number, p = pitch): V3 => [0, Math.sin(p) * d + Math.cos(p) * up, Math.cos(p) * d - Math.sin(p) * up];
  const at = (o: V3, x = 0): V3 => [x, hb[1] + o[1], hb[2] + o[2]];
  cb(k, g, [0.46, 0.4, 0.5], at(fwd(0.12, 0.12)), B, [-pitch, 0, 0], 0.12);
  ball(k, g, 0.26, at(fwd(0.06, 0.16)), B, [0.95, 0.85, 1.05], [-pitch, 0, 0]);
  const snoutTip = at(fwd(0.72, 0.06)), jawTip = at(fwd(0.64, -0.04, pitch - pose.jaw));
  limb(k, g, at(fwd(0.26, 0.08)), snoutTip, [0.4, 0.28, 0.24, 0.17], BL);
  limb(k, g, at(fwd(0.24, 0.2)), at(fwd(0.66, 0.13)), [0.08, 0.06, 0.04, 0.03], B);
  cb(k, g, [0.3, 0.12, 0.26], at(fwd(0.52, 0.17)), B, [-pitch, 0, 0], 0.05);
  limb(k, g, at(fwd(0.1, -0.12)), jawTip, [0.32, 0.12, 0.2, 0.08], BD);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const d = 0.4 + i * 0.1;
      k.mesh(g, prism(0.04, 0.09, 0.5), BL, at(fwd(d, -0.04), s * 0.11), [Math.PI - pitch, 0, 0]);
      k.mesh(g, prism(0.04, 0.08, 0.5), BL, at(fwd(d - 0.04, 0.0, pitch - pose.jaw), s * 0.09), [-pitch + pose.jaw, 0, 0]);
    }
    // Eyes under a heavy brow, nostrils, swept horns and cheek spikes.
    k.box(g, [0.07, 0.07, 0.1], at(fwd(0.3, 0.17), s * 0.2), 0xffd070, [-pitch, 0, 0], 0xffa040, 1.6);
    limb(k, g, at(fwd(0.38, 0.24), s * 0.13), at(fwd(0.08, 0.27), s * 0.22), [0.1, 0.08, 0.12, 0.08], BD);
    k.box(g, [0.05, 0.04, 0.05], at(fwd(0.7, 0.12), s * 0.07), 0x2a1e12, [-pitch, 0, 0]);
    // A brow ridge jutting over each eye, flared nostrils on the snout's tip and a heavy jaw hinge.
    limb(k, g, at(fwd(0.42, 0.2), s * 0.16), at(fwd(0.2, 0.25), s * 0.24), [0.11, 0.07, 0.06, 0.05], BL);
    ball(k, g, 0.06, at(fwd(0.68, 0.1), s * 0.09), BD, [1, 0.8, 1.2]);
    ball(k, g, 0.1, at(fwd(0.06, -0.06), s * 0.2), BD, [0.8, 1, 1.1]);
    const h0 = at(fwd(0.05, 0.24), s * 0.15), h1 = at(fwd(-0.32, 0.42), s * 0.28), h2 = at(fwd(-0.62, 0.42), s * 0.33);
    limb(k, g, h0, h1, [0.13, 0.13, 0.08, 0.08], GOLD);
    limb(k, g, h1, h2, [0.08, 0.08, 0.02, 0.02], GOLD);
    limb(k, g, at(fwd(0.1, -0.02), s * 0.22), at(fwd(-0.22, 0.0), s * 0.38), [0.08, 0.06, 0.02, 0.02], GOLD);
  }
  // Forelegs: planted on the ground when sitting, raised and clawing when rearing.
  for (const s of [-1, 1]) {
    const sh = spineAt(0.86);
    const shoulder: V3 = [s * 0.4, sh[1] - 0.05, sh[2] + 0.06];
    const elbow: V3 = [s * mix(0.42, 0.62, R), mix(0.95, sh[1] - 0.38, R), mix(sh[2] + 0.2, sh[2] + 0.42, R)];
    const wrist: V3 = [s * mix(0.36, 0.58, R), mix(0.12, sh[1] + 0.12, R), mix(sh[2] + 0.5, sh[2] + 0.86, R)];
    ball(k, g, 0.22, shoulder, B, [1, 1.1, 1]);
    round(k, g, shoulder, elbow, 0.15, 0.12, B);
    ball(k, g, 0.12, elbow, B);
    round(k, g, elbow, wrist, 0.12, 0.09, B);
    const paw: V3 = [wrist[0], wrist[1] + 0.02, wrist[2] + 0.1];
    cb(k, g, [0.26, 0.18, 0.28], paw, BL, [mix(0, -0.5, R), 0, 0], 0.06);
    for (const c of [-1, 0, 1]) {
      const root: V3 = [paw[0] + c * 0.08, paw[1] + mix(-0.02, 0.04, R), paw[2] + 0.14];
      const knuckle: V3 = [root[0] + c * 0.03, root[1] + mix(-0.05, 0.08, R), root[2] + 0.12];
      limb(k, g, root, knuckle, [0.06, 0.07, 0.04, 0.05], GOLD);
      limb(k, g, knuckle, [root[0] + c * 0.04, root[1] + mix(-0.08, -0.06, R), root[2] + 0.2], [0.04, 0.05, 0.01, 0.01], GOLD);
    }
  }
  // Wings on long finger bones from the shoulders: arm up to the wrist (a gold thumb claw), four
  // fingers fanning out and back, membranes between them with a scalloped trailing edge.
  for (const s of [-1, 1]) {
    const sp = spineAt(0.82);
    const sh: V3 = [s * 0.32, sp[1], sp[2] - 0.28];
    const el: V3 = [s * mix(0.8, 0.88, W), sp[1] + mix(0.32, 0.5, W), sp[2] - 0.5];
    const wr: V3 = [s * mix(1.2, 1.38, W), sp[1] + mix(0.8, 1.0, W), sp[2] - mix(0.42, 1.1, W)];
    const root: V3 = [s * 0.3, 0.9, -0.62];
    const tips: V3[] = [
      [s * mix(1.75, 1.92, W), wr[1] - mix(0.2, 0.08, W), wr[2] - mix(0.45, 0.55, W)],
      [s * mix(1.8, 1.96, W), wr[1] - mix(0.9, 0.75, W), wr[2] - mix(0.62, 0.4, W)],
      [s * mix(1.55, 1.8, W), wr[1] - mix(1.5, 1.4, W), wr[2] - mix(0.62, 0.15, W)],
      [s * mix(1.0, 1.2, W), Math.max(0.6, wr[1] - mix(1.95, 1.85, W)), wr[2] - mix(0.45, -0.1, W)],
    ];
    round(k, g, sh, el, 0.1, 0.075, B);
    round(k, g, el, wr, 0.075, 0.055, B);
    ball(k, g, 0.08, el, B);
    ball(k, g, 0.065, wr, B);
    limb(k, g, wr, [wr[0] + s * 0.02, wr[1] + 0.24, wr[2] + 0.12], [0.08, 0.08, 0.01, 0.01], GOLD);
    tips.forEach((t, i) => limb(k, g, wr, t, [0.08 - i * 0.008, 0.08 - i * 0.008, 0.035, 0.035], BD));
    // The membranes are the same casting as the body, a shade darker; verdigris has gathered only
    // in the recess by the body and along the inner trailing edge.
    sail(k, g, [sh, el, root], VERDIGRIS_D);
    sail(k, g, [el, wr, root], BRONZE_D);
    const edge = [root, ...tips.slice().reverse()];
    for (let i = 0; i < edge.length - 1; i++) {
      const a = edge[i], b = edge[i + 1];
      const m: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const notch: V3 = [m[0] + (wr[0] - m[0]) * 0.2, m[1] + (wr[1] - m[1]) * 0.2, m[2] + (wr[2] - m[2]) * 0.2];
      sail(k, g, [wr, a, notch], i === 0 ? VERDIGRIS : BRONZE_D);
      sail(k, g, [wr, notch, b], BRONZE_D);
    }
  }
  // The tail sweeping back and curling round beside the haunches, spined, ending in a gold spade.
  const tail: V3[] = [[0, 0.42, -0.86], [0.42, 0.3, -1.08], [0.82, 0.2, -0.92], [0.98, 0.14, -0.48], [0.9, 0.1, -0.02], [0.66, 0.08, 0.3]];
  chain(tail, [0.46, 0.36, 0.28, 0.21, 0.15, 0.1], BD);
  for (let i = 0; i < tail.length - 2; i++) k.mesh(g, prism(0.08, 0.18 - i * 0.03, 0.4), BD, [tail[i][0], tail[i][1] + 0.18 - i * 0.03, tail[i][2]]);
  k.mesh(g, wedge(0.36, 0.06, 0.36), GOLD, [0.6, 0.08, 0.42], [0, 0.6, 0]);
  return new THREE.Vector3((snoutTip[0] + jawTip[0]) / 2, (snoutTip[1] + jawTip[1]) / 2, (snoutTip[2] + jawTip[2]) / 2);
}

/**
 * The top of a round tower of radius r centred at (x, z) whose platform is at height P: a string
 * course, a corbel course, a solid parapet ring standing out over it, and merlons on every other of
 * its N faces.
 */
function crown(k: ModelKit, g: THREE.Object3D, x: number, z: number, r: number, P: number, N: number, rose = true) {
  k.cyl(g, r + 0.12, r + 0.12, 0.22, [x, P - 1.1, z], TRIM, undefined, N);
  for (let i = 0; i < N; i++) {
    const a = ((i + 0.5) / N) * Math.PI * 2, c = 2 * (r + 0.25) * Math.sin(Math.PI / N);
    cb(k, g, [c * 0.42, 0.5, 0.42], [x + Math.sin(a) * (r + 0.12), P - 0.3, z + Math.cos(a) * (r + 0.12)], TRIM, [0, a, 0], 0.03);
    cb(k, g, [c + 0.04, 1.0, 0.5], [x + Math.sin(a) * (r + 0.05), P + 0.5, z + Math.cos(a) * (r + 0.05)], ASHLAR, [0, a, 0], 0.03);
    if (i % 2 === 0) cb(k, g, [c * 0.82, 0.75, 0.54], [x + Math.sin(a) * (r + 0.05), P + 1.37, z + Math.cos(a) * (r + 0.05)], hash01(i, r) > 0.7 ? ASHLAR_L : ASHLAR, [0, a, 0], 0.05);
  }
  // One continuous coping round the parapet's top under the merlons (never a cap per merlon).
  k.mesh(g, ringBand(r - 0.24, r + 0.4, 0.12, N), TRIM, [x, P + 0.96, z]);
  k.cyl(g, r - 0.2, r - 0.2, 0.1, [x, P + 0.05, z], rose ? ASHLAR_W : DECK, undefined, N);
  if (!rose) return;
  // The platform paved as a compass rose in the castle's own stone: a cream ring round a honey
  // field, a slate star of eight points (two squares turned against each other) with a cream heart,
  // and a thin gold ring round the slate plinth at its centre (where a flagpole stands).
  const rr = r - 0.2;
  k.mesh(g, ringBand(rr * 0.74, rr * 0.86, 0.03, N), ASHLAR_L, [x, P + 0.1, z]);
  k.cyl(g, rr * 0.74, rr * 0.74, 0.03, [x, P + 0.112, z], ASHLAR, undefined, N);
  k.box(g, [rr * 0.98, 0.03, rr * 0.98], [x, P + 0.13, z], TRIM, [0, Math.PI / 4, 0]);
  k.box(g, [rr * 0.98, 0.03, rr * 0.98], [x, P + 0.13, z], TRIM);
  k.cyl(g, rr * 0.36, rr * 0.36, 0.03, [x, P + 0.15, z], ASHLAR_L, undefined, N);
  k.mesh(g, ringBand(0.5, 0.6, 0.03, 16), GILT, [x, P + 0.17, z]);
  k.cyl(g, 0.42, 0.48, 0.16, [x, P + 0.2, z], TRIM_D, undefined, 10);
}

/**
 * A round tower of radius r (the round_tower and corner_tower props): a battered plinth, a drum rising
 * a full storey or more over the wall walk (+7) to its platform at H + 1.4, blue-grey bands level with
 * the curtain's string courses and a broad one under the corbels, arrow slits, and on top a corbelled
 * parapet ring with merlons. A plain tower's platform is paved as a compass rose; a corner tower
 * carries a gilt frieze and a spire instead.
 */
function drumTower(k: ModelKit, g: THREE.Object3D, r: number, H: number, corner: boolean) {
  const N = 20, P = H + 1.4;
  // Plinth, its slate course and the weathered course above it at the curtain's own heights, and
  // bands level with the curtain's string courses (3.6, 5.6 and the wall walk's at 6.92), so every
  // line runs on round the drums without a step.
  k.cyl(g, r + 0.15, r + 0.5, 1.1, [0, 0.55, 0], TRIM_D, undefined, N);
  k.cyl(g, r, r, P - 1.1, [0, 1.1 + (P - 1.1) / 2, 0], ASHLAR, undefined, N);
  k.cyl(g, r + 0.03, r + 0.03, 0.5, [0, 1.5, 0], ASHLAR_W, undefined, N);
  for (const y of [3.6, 5.6, 6.92]) k.cyl(g, r + 0.1, r + 0.1, y === 3.6 ? 0.3 : 0.22, [0, y, 0], TRIM, undefined, N);
  k.cyl(g, r + 0.2, r + 0.5, 0.22, [0, 1.15, 0], TRIM, undefined, N);
  if (corner) drumFrieze(k, g, 0, 0, r, P - 1.75, N);
  else k.cyl(g, r + 0.08, r + 0.08, 0.5, [0, P - 1.7, 0], TRIM, undefined, N);
  crown(k, g, 0, 0, r, P, N, !corner);
  const slits = corner ? [4.8, 8.6, 11.0] : [4.8, 8.6];
  for (const a of [0.6, 2.2, 3.8, 5.3]) for (const y of slits) if (y < P - 2.2) k.box(g, [0.16, 1.0, 0.1], [Math.sin(a) * (r + 0.02), y, Math.cos(a) * (r + 0.02)], DARK, [0, a, 0]);
  if (corner) spire(k, g, 0, P + 0.9, 0, r + 0.1, r * 1.75, N, 1, 1.5);
}

/**
 * A blue-slate spire whose foot (radius r) stands at y over (x, z), `h` tall, on a blue-grey eave:
 * two thin gilt bands round it (at the foot and two thirds up), a gilt ball-and-spike finial on the
 * point and, when `pennant` is ±1, a small house pennant on the spike flying that way along X.
 */
export function spire(k: ModelKit, g: THREE.Object3D, x: number, y: number, z: number, r: number, h: number, N: number, pennant = 0, size = 1) {
  k.cyl(g, r + 0.12, r + 0.12, 0.16, [x, y + 0.08, z], TRIM, undefined, N);
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

/** A gilt frieze one course high on a face (along local X, facing +Z): a blue-grey band, a row of gold diamonds on it. */
export function frieze(k: ModelKit, g: THREE.Object3D, len: number, x: number, y: number, z: number) {
  cb(k, g, [len, 0.38, 0.16], [x, y, z], TRIM, undefined, 0.02);
  for (let u = -len / 2 + 0.32; u <= len / 2 - 0.3; u += 0.56) k.box(g, [0.2, 0.2, 0.05], [x + u, y, z + 0.09], GILT, [0, 0, Math.PI / 4]);
}

/** The same gilt frieze round a drum of radius r centred at (x, z), at height y. */
export function drumFrieze(k: ModelKit, g: THREE.Object3D, x: number, z: number, r: number, y: number, N: number) {
  k.cyl(g, r + 0.1, r + 0.1, 0.38, [x, y, z], TRIM, undefined, N);
  const n = Math.round((2 * Math.PI * r) / 0.58);
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    k.box(g, [0.2, 0.2, 0.05], [x + Math.sin(a) * (r + 0.12), y, z + Math.cos(a) * (r + 0.12)], GILT, [0, a, Math.PI / 4]);
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
 * The lord's banner hanging flat on a face (facing +Z) from a rod at height `top`: a royal blue
 * field `w` × `h`, a thin gold strip down each side, the gold dragon diamond, and a two-point
 * swallowtail in the deeper blue, edged in gold, below it.
 */
export function livery(k: ModelKit, p: THREE.Object3D, x: number, top: number, z: number, w: number, h: number) {
  cb(k, p, [w + 0.4, 0.14, 0.14], [x, top, z - 0.02], WOOD_D, undefined, 0.02);
  const yc = top - 0.07 - h / 2, yb = top - 0.07 - h, th = w * 0.42;
  cb(k, p, [w, h, 0.06], [x, yc, z], HERALD_BLUE, undefined, 0.01);
  for (const sx of [-1, 1]) {
    k.box(p, [0.1, h, 0.04], [x + sx * (w / 2 - 0.14), yc, z + 0.04], PAL.gold);
    k.mesh(p, clothPoint(w / 2 + 0.1, th + 0.12, 0.04), PAL.gold, [x + (sx * w) / 4, yb + 0.02, z - 0.02]);
    k.mesh(p, clothPoint(w / 2 - 0.02, th, 0.06), HERALD_BLUE_D, [x + (sx * w) / 4, yb + 0.01, z]);
  }
  k.box(p, [w * 0.36, w * 0.36, 0.04], [x, top - 0.07 - h * 0.42, z + 0.05], PAL.gold, [0, 0, Math.PI / 4]);
}

/**
 * A flag on a pole at x, its top edge at `top`, flying out toward `dir` (±1 along X): a royal blue
 * field `w` × `h` rippling in three panels (each turned a little against the last), a broad gold
 * stripe at the hoist, the gold dragon diamond on the middle panel and a two-point swallowtail at the
 * fly in the deeper blue.
 */
export function flag(k: ModelKit, p: THREE.Object3D, x: number, top: number, z: number, w: number, h: number, dir = 1) {
  // The cloth hangs from the hoist at its top corner and droops toward the fly (the whole flag
  // turned down a little about the hoist), rippling in five panels that swing to and fro and sag
  // progressively lower along the length, so it reads as cloth from the high camera too.
  const cloth = new THREE.Group();
  cloth.position.set(x, top, z);
  cloth.rotation.z = -dir * 0.16;
  p.add(cloth);
  const n = 5, seg = w / n, wave = [0, 0.16, -0.14, 0.15, -0.1, 0.12].map((v) => v * w);
  const yc = -h / 2, sagAt = (t: number) => -0.55 * (h / 1.4) * (t / n) ** 2;
  let last = 0;
  for (let i = 0; i < n; i++) {
    const ax = dir * (0.07 + seg * i), bx = ax + dir * seg, az = wave[i], bz = wave[i + 1];
    const len = Math.hypot(bx - ax, bz - az), rot = Math.atan2(-(bz - az), bx - ax);
    last = rot;
    const s0 = sagAt(i), s1 = sagAt(i + 1), tilt = dir * Math.atan2(s1 - s0, seg);
    cb(k, cloth, [len + 0.03, h, 0.03], [(ax + bx) / 2, yc + (s0 + s1) / 2, (az + bz) / 2], HERALD_BLUE, [0, rot, tilt], 0.005);
    if (i === 2) k.box(cloth, [h * 0.46, h * 0.46, 0.06], [(ax + bx) / 2, yc + (s0 + s1) / 2, (az + bz) / 2], PAL.gold, [0, rot, Math.PI / 4 + tilt]);
  }
  const hw = Math.max(0.16, w * 0.1);
  k.box(cloth, [hw, h, 0.05], [dir * (0.07 + hw / 2), yc, 0], PAL.gold);
  // The forked fly: two swallowtail points, edged in gold.
  const tip = new THREE.Group();
  tip.position.set(dir * (0.07 + w - 0.01), sagAt(n), wave[n]);
  tip.rotation.y = last;
  cloth.add(tip);
  for (const sy of [-1, 1]) {
    k.mesh(tip, clothPoint(h / 2 + 0.06, h * 0.5 + 0.06, 0.02), PAL.gold, [0, yc + (sy * h) / 4, 0], [0, 0, (dir * Math.PI) / 2]);
    k.mesh(tip, clothPoint(h / 2, h * 0.5, 0.035), HERALD_BLUE_D, [0, yc + (sy * h) / 4, 0], [0, 0, (dir * Math.PI) / 2]);
  }
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
export function spandrels(w: number, h: number, dep: number) {
  const key = `${w},${h},${dep}`;
  let g = spandrelCache.get(key);
  if (g) return g;
  const { arc } = pointedArch(w, h), hw = w / 2;
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
  spandrelCache.set(key, g);
  return g;
}

/** The head of a pointed opening above its springing (sill at y = 0), `dep` thick, centred on z = 0. */
const headCache = new Map<string, THREE.BufferGeometry>();
function archHead(w: number, h: number, dep: number) {
  const key = `${w},${h},${dep}`;
  let g = headCache.get(key);
  if (!g) {
    const { arc } = pointedArch(w, h);
    const s = new THREE.Shape();
    s.moveTo(-arc[0][0], arc[0][1]);
    for (const [px, py] of arc) s.lineTo(px, py);
    for (let i = arc.length - 2; i >= 0; i--) s.lineTo(-arc[i][0], arc[i][1]);
    s.closePath();
    g = new THREE.ExtrudeGeometry(s, { depth: dep, bevelEnabled: false }).translate(0, 0, -dep / 2);
    headCache.set(key, g);
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
 * Stones laid round a pointed arch (`w` wide, apex `h` above the sill, sill at y0, centred on x), on a
 * face at z (facing +Z): voussoirs `t` deep standing proud `p` of the face, `n` to each side, and a
 * keystone; `out` sets them out from the opening's edge.
 */
export function archRing(k: ModelKit, g: THREE.Object3D, x: number, y0: number, z: number, w: number, h: number, color: number, opt: { n?: number; t?: number; p?: number; out?: number; key?: number; rise?: number } = {}) {
  const { n = 5, t = 0.26, p = 0.14, out = 0.12 } = opt;
  const { arc } = pointedArch(w, h, n * 2, opt.rise);
  for (const sx of [-1, 1]) for (let i = 0; i < n; i++) {
    const a = arc[i * 2], b = arc[i * 2 + 2], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    // Out from the opening along the arc's outward normal.
    const nx = Math.sin(ang), ny = -Math.cos(ang);
    cb(k, g, [len + 0.04, t, p], [x + sx * (mx + nx * (out + t / 2)), y0 + my + ny * (out + t / 2), z + p / 2], color, [0, 0, sx > 0 ? ang : Math.PI - ang], 0.02);
  }
  if (opt.key !== undefined) cb(k, g, [0.3, 0.42, p + 0.04], [x, y0 + h + out + 0.12, z + p / 2], opt.key, undefined, 0.02);
}

/** Stained glass: each colour glows in itself. */
export const GLASS = { ruby: 0xc8304a, sapphire: 0x2f5fd0, gold: 0xf2b84a } as const;

/**
 * The castle's one stained-glass scheme, for every principal building (one commission): two lights
 * of royal blue sprinkled with gold quarries, divided by a cream stone mullion that forks into Y
 * tracery in the head, a ruby lozenge in the eye of the Y. Built in window space (sill at y = 0,
 * centred on x = 0, in the plane z = 0) and cached per size: [geometry, colour, glows].
 */
const royalCache = new Map<string, [THREE.BufferGeometry, number, boolean][]>();
function royalGlass(w: number, h: number): [THREE.BufferGeometry, number, boolean][] {
  const key = `${w},${h}`;
  let parts = royalCache.get(key);
  if (parts) return parts;
  const { ys, ah } = pointedArch(w, h);
  const m = new THREE.Matrix4(), place = (geo: THREE.BufferGeometry, x: number, y: number, z: number, rz = 0) => {
    const c = geo.clone();
    c.applyMatrix4(m.makeRotationZ(rz).setPosition(x, y, z));
    return c.index ? c.toNonIndexed() : c;
  };
  const merge = (list: THREE.BufferGeometry[]) => {
    const g = mergeGeometries(list.map((x) => { x.deleteAttribute('uv'); return x; }))!;
    g.computeVertexNormals();
    return g;
  };
  const stone: THREE.BufferGeometry[] = [], gold: THREE.BufferGeometry[] = [];
  // The mullion up to the springing, forking into the Y's two arms.
  stone.push(place(chamferBox(0.07, ys, 0.09, 0), 0, ys / 2, 0.02));
  const arm = Math.hypot(w * 0.3, ah * 0.62), ang = Math.atan2(ah * 0.62, w * 0.3);
  for (const sx of [-1, 1]) stone.push(place(chamferBox(arm, 0.06, 0.09, 0), sx * w * 0.15, ys + ah * 0.31, 0.02, sx > 0 ? ang : Math.PI - ang));
  // Gold quarries down each light, offset row to row.
  for (let y = 0.22, j = 0; y < ys - 0.12; y += 0.3, j++) for (const sx of [-1, 1]) {
    gold.push(place(chamferBox(0.09, 0.09, 0.06, 0), sx * w * (j % 2 ? 0.17 : 0.33), y, 0.01, Math.PI / 4));
  }
  parts = [
    [archPane(w, h, 0.04), GLASS.sapphire, true],
    [merge(gold), GLASS.gold, true],
    [place(chamferBox(w * 0.2, w * 0.2, 0.06, 0), 0, ys + ah * 0.72, 0.01, Math.PI / 4), GLASS.ruby, true],
    [merge(stone), ASHLAR_L, false],
  ];
  royalCache.set(key, parts);
  return parts;
}

/**
 * Stained glass in a pointed opening `w` wide, apex `h` above its sill at y (on a face at z, facing
 * +Z): the castle's royal scheme (royalGlass). `put` places a piece (a geometry built in window space,
 * its colour and whether it glows, at the window's x, y, z).
 */
export function stainedGlass(put: (geo: THREE.BufferGeometry, color: number, emissive: number, x: number, y: number, z: number) => void, x: number, y: number, z: number, w: number, h: number) {
  for (const [geo, c, glow] of royalGlass(w, h)) put(geo, c, glow ? c : 0, x, y, z);
}

/**
 * A tall pointed lancet on a face at z (facing +Z), its sill at y: the opening sunk into a dressed
 * surround (jambs to the springing, voussoirs round the head) in pale ashlar, a pane of glass glowing
 * with the lit room behind it (or dark, or `stained` glass), a blue-grey hood mould following the
 * arch with its label stops, and a projecting sill.
 */
export function lancet(k: ModelKit, g: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, lit = true, stained = false) {
  const { ys } = pointedArch(w, h);
  if (stained) {
    stainedGlass((geo, c, em, px, py, pz) => k.mesh(g, geo, c, [px, py, pz], undefined, em, em ? 0.9 : 1), x, y, z + 0.03, w, h);
  } else {
    // The glass stands just proud of the face (the surround stands prouder), so it always shows.
    k.mesh(g, archPane(w, h, 0.05), lit ? 0xffc870 : 0x1e2430, [x, y, z + 0.03], undefined, lit ? 0xffa040 : 0, lit ? 0.9 : 1);
    // A slender mullion up to the springing, leading across it.
    cb(k, g, [0.06, ys, 0.06], [x, y + ys / 2, z + 0.07], ASHLAR_L, undefined, 0.01);
  }
  for (const sx of [-1, 1]) cb(k, g, [0.2, ys + 0.02, 0.24], [x + sx * (w / 2 + 0.1), y + ys / 2, z - 0.02], ASHLAR_L, undefined, 0.02);
  archRing(k, g, x, y, z - 0.14, w, h, ASHLAR_L, { n: 4, t: 0.2, p: 0.24, out: 0 });
  archRing(k, g, x, y, z - 0.04, w + 0.42, h + 0.26, TRIM, { n: 4, t: 0.12, p: 0.16, out: 0 });
  for (const sx of [-1, 1]) cb(k, g, [0.16, 0.22, 0.2], [x + sx * (w / 2 + 0.3), y + ys - 0.06, z + 0.06], TRIM, undefined, 0.02);
  cb(k, g, [w + 0.5, 0.14, 0.32], [x, y - 0.07, z + 0.06], ASHLAR_L, undefined, 0.02);
}

/**
 * The castle's lamp post: a stepped slate base, a navy-lacquered post with a gold collar, a lantern
 * of warm glass in a navy cage under a little hipped hood, a gold ball finial on top.
 */
function royalLamp(k: ModelKit, g: THREE.Object3D) {
  cb(k, g, [0.46, 0.22, 0.46], [0, 0.11, 0], TRIM_D, undefined, 0.05);
  cb(k, g, [0.32, 0.2, 0.32], [0, 0.3, 0], TRIM, undefined, 0.04);
  k.cyl(g, 0.06, 0.08, 2.2, [0, 1.5, 0], LAMP_NAVY, undefined, 8);
  k.cyl(g, 0.1, 0.1, 0.08, [0, 2.42, 0], PAL.gold, undefined, 8);
  cb(k, g, [0.42, 0.06, 0.42], [0, 2.49, 0], LAMP_NAVY, undefined, 0.02);
  k.box(g, [0.32, 0.4, 0.32], [0, 2.72, 0], 0xffd890, undefined, 0xffb040, 2.4);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(g, [0.05, 0.44, 0.05], [dx * 0.17, 2.72, dz * 0.17], LAMP_NAVY);
  k.mesh(g, taper(0.5, 0.5, 0.1, 0.1, 0.22), LAMP_NAVY, [0, 3.04, 0]);
  k.mesh(g, new THREE.OctahedronGeometry(0.08, 1), PAL.gold, [0, 3.22, 0]);
}

/** A wall lantern on a face (facing +Z) at x, its lamp at y: a navy bracket, a warm lantern and a gold finial. */
function wallLamp(k: ModelKit, g: THREE.Object3D, x: number, y: number, z: number) {
  cb(k, g, [0.2, 0.3, 0.08], [x, y + 0.3, z + 0.04], LAMP_NAVY, undefined, 0.01);
  cb(k, g, [0.07, 0.07, 0.42], [x, y + 0.4, z + 0.25], LAMP_NAVY, undefined, 0.01);
  k.box(g, [0.24, 0.32, 0.24], [x, y, z + 0.46], 0xffd890, undefined, 0xffb040, 2);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(g, [0.04, 0.36, 0.04], [x + dx * 0.13, y, z + 0.46 + dz * 0.13], LAMP_NAVY);
  k.mesh(g, taper(0.36, 0.36, 0.08, 0.08, 0.16), LAMP_NAVY, [x, y + 0.24, z + 0.46]);
  k.mesh(g, new THREE.OctahedronGeometry(0.06, 1), PAL.gold, [x, y + 0.38, z + 0.46]);
}

/**
 * One leaf of a castle door, `w` wide and `h` tall, hinged on its left edge at the origin and
 * standing along +X (facing +Z): planks of the lord's blue, gold strap hinges with diamond ends, and
 * the same on its back, so an open leaf reads from either side.
 */
export function royalLeaf(k: ModelKit, g: THREE.Object3D, w: number, h: number) {
  cb(k, g, [w, h, 0.1], [w / 2, h / 2, 0], HERALD_BLUE, undefined, 0.02);
  for (let i = 1; i < 4; i++) for (const e of [-1, 1]) k.box(g, [0.03, h - 0.1, 0.02], [(i * w) / 4, h / 2, e * 0.055], HERALD_BLUE_D);
  for (const y of [h * 0.22, h * 0.72]) for (const e of [-1, 1]) {
    k.box(g, [w * 0.82, 0.08, 0.03], [w * 0.41, y, e * 0.06], PAL.gold);
    k.box(g, [0.13, 0.13, 0.03], [w * 0.82, y, e * 0.06], PAL.gold, [0, 0, Math.PI / 4]);
  }
}

/**
 * A gate through a stretch of full-height curtain (built along local X, outer face toward -Z like
 * the curtain): the passage `P` wide under a pointed arch, dressed voussoirs and a hood mould on both
 * faces, pale jambs, the wall walk carried over it. Options: `door` folds two oak leaves back against
 * the passage's sides, `steps` lays a stone stoop out from the outer face, `head` raises a crenellated
 * head over the gate with the lord's crest on its inner face, `lanterns` hangs a lantern either side
 * of the arch on the faces listed (-1 outer, 1 inner).
 */
function gateway(k: ModelKit, g: THREE.Object3D, P: number, opt: { door?: boolean; steps?: boolean; head?: boolean; lanterns?: number[] }) {
  const L = P + 2.4, T = 2.2, H = 7, S = P >= 3 ? 3.0 : 2.4, rise = P >= 3 ? 1.9 : 1.25, apex = S + rise;
  const { arc } = pointedArch(P, apex, 8, rise);
  const half = (y: number) => {
    if (y <= S) return P / 2;
    for (let i = 0; i < arc.length - 1; i++) if (y >= arc[i][1] && y <= arc[i + 1][1]) {
      const t = (y - arc[i][1]) / (arc[i + 1][1] - arc[i][1] || 1);
      return arc[i][0] + (arc[i + 1][0] - arc[i][0]) * t;
    }
    return 0;
  };
  cb(k, g, [L, 0.8, T + 0.5], [0, 0.4, 0], TRIM_D, undefined, 0.06);
  for (const sx of [-1, 1]) cb(k, g, [(L - P) / 2, S, T], [sx * (P / 2 + (L - P) / 4), S / 2, 0], ASHLAR, undefined, 0.04);
  for (let y = S; y < apex - 0.01; y += 0.2) {
    const y1 = Math.min(apex, y + 0.2), hw = half((y + y1) / 2);
    for (const sx of [-1, 1]) cb(k, g, [L / 2 - hw, y1 - y + 0.01, T], [sx * (hw + (L / 2 - hw) / 2), (y + y1) / 2, 0], ASHLAR, undefined, 0);
  }
  cb(k, g, [L, H - apex, T], [0, apex + (H - apex) / 2, 0], ASHLAR, undefined, 0.04);
  for (const sx of [-1, 1]) cb(k, g, [(L - P) / 2 - 0.36, 0.5, T + 0.04], [sx * (P / 2 + 0.36 + (L - P - 0.72) / 4), 1.5, 0], ASHLAR_W, undefined, 0.02);
  // The curtain's string courses run on across the gate on both faces (at 3.6 broken by the arch's
  // hood, at 5.6 over it), so the lines never step where the wall meets its gate.
  const hood = P / 2 + 0.75;
  for (const sx of [-1, 1]) {
    cb(k, g, [L / 2 - hood, 0.3, T + 0.18], [sx * (hood + (L / 2 - hood) / 2), 3.6, 0], TRIM, undefined, 0.03);
    cb(k, g, [(L - P) / 2, 0.22, T + 0.62], [sx * (P / 2 + (L - P) / 4), 1.15, 0], TRIM, undefined, 0.03);
  }
  cb(k, g, [L, 0.22, T + 0.14], [0, 5.6, 0], TRIM, undefined, 0.02);
  for (const e of [-1, 1]) {
    const f = new THREE.Group();
    f.rotation.y = e > 0 ? 0 : Math.PI;
    g.add(f);
    const z = T / 2;
    for (const sx of [-1, 1]) cb(k, f, [0.34, S, 0.16], [sx * (P / 2 + 0.17), S / 2, z + 0.08], ASHLAR_L, undefined, 0.02);
    archRing(k, f, 0, 0, z, P, apex, ASHLAR_L, { n: 5, t: 0.4, p: 0.16, out: 0, key: ASHLAR_L, rise });
    archRing(k, f, 0, 0, z, P + 1.0, apex + 0.55, TRIM, { n: 5, t: 0.14, p: 0.26, out: 0, rise: rise + 0.55 });
    for (const sx of [-1, 1]) cb(k, f, [0.2, 0.3, 0.3], [sx * (P / 2 + 0.55), S + 0.02, z + 0.15], TRIM, undefined, 0.02);
    if (opt.lanterns?.includes(e)) for (const sx of [-1, 1]) wallLamp(k, f, sx * (P / 2 + 0.95 + (opt.door ? P / 2 + 0.4 : 0)), S - 0.6, z);
    if (opt.head && e > 0) {
      // The lord's crest over the arch: a blue shield rimmed in gold with the gold dragon diamond.
      crest(k, f, 0, apex + 1.45, z + 0.06, 1.0);
    }
  }
  // The wall walk carried over the gate: the outer parapet and merlons, the inner rail; a gate's head
  // rises above it, crenellated on both faces.
  if (opt.head) {
    cb(k, g, [L + 0.5, 1.4, T + 0.36], [0, H + 0.7, 0], ASHLAR, undefined, 0.04);
    cb(k, g, [L + 0.6, 0.16, T + 0.46], [0, H + 1.42, 0], TRIM, undefined, 0.03);
    for (const e of [-1, 1]) for (let i = 0; i < 4; i++) cb(k, g, [0.7, 0.66, 0.5], [-L / 2 + 0.4 + (i * (L - 0.8)) / 3, H + 1.83, e * (T / 2 - 0.05)], ASHLAR, undefined, 0.04);
    for (let i = 0; i < 6; i++) for (const e of [-1, 1]) cb(k, g, [0.32, 0.36, 0.4], [-L / 2 + 0.5 + (i * (L - 1.0)) / 5, H - 0.2, e * (T / 2 + 0.12)], TRIM, undefined, 0.03);
  } else {
    // The wall walk carried over the gate exactly as along the curtain: the outer parapet, its
    // coping and merlons, the parapet band under it, and the inner rail corbelled out over the face.
    cb(k, g, [L, 0.75, 0.6], [0, H + 0.37, -T / 2 + 0.3], ASHLAR, undefined, 0.03);
    cb(k, g, [L, 0.12, 0.72], [0, H + 0.78, -T / 2 + 0.3], TRIM, undefined, 0.02);
    for (let u = -L / 2 + 0.5; u < L / 2; u += 1.3) cb(k, g, [0.72, 0.6, 0.6], [u, H + 1.05, -T / 2 + 0.3], ASHLAR, undefined, 0.05);
    cb(k, g, [L, 0.5, 0.2], [0, H - 0.25, -T / 2 - 0.06], TRIM, undefined, 0.02);
    for (let u = -L / 2 + 0.6; u < L / 2 - 0.3; u += 1.2) cb(k, g, [0.32, 0.46, 0.34], [u, H - 0.42, T / 2 + 0.12], TRIM, undefined, 0.02);
    cb(k, g, [L, 0.22, 0.42], [0, H - 0.08, T / 2 + 0.16], TRIM, undefined, 0.02);
    cb(k, g, [L, 0.9, 0.42], [0, H + 0.48, T / 2 + 0.06], ASHLAR_W, undefined, 0.03);
    cb(k, g, [L, 0.12, 0.52], [0, H + 0.96, T / 2 + 0.06], TRIM, undefined, 0.02);
  }
  // The leaves: the lord's blue planks with gold strapwork, a pair hung at each face of the passage
  // and swung open back against the wall's face either side of the arch, so the doorway reads as a
  // real door from the yards on both sides. The passage between is lined in the darker dressing, so
  // the opening reads as a deep reveal.
  if (opt.door) {
    for (const e of [-1, 1]) for (const sx of [-1, 1]) {
      const leaf = new THREE.Group();
      leaf.position.set(sx * (P / 2 + 0.72), 0.05, e * (T / 2 + 0.3));
      // Swung nearly flat against the face beside the jamb.
      leaf.rotation.y = sx > 0 ? -e * 0.08 : Math.PI + e * 0.08;
      g.add(leaf);
      royalLeaf(k, leaf, P / 2, S - 0.15);
    }
    for (const sx of [-1, 1]) cb(k, g, [0.06, S - 0.05, T - 0.1], [sx * (P / 2 - 0.03), (S - 0.05) / 2, 0], TRIM_D, undefined, 0.01);
  }
  if (opt.steps) for (let i = 0; i < 2; i++) cb(k, g, [P + 0.9 - i * 0.3, 0.16, 0.5], [0, 0.08 + i * 0.12, -T / 2 - 0.55 + i * 0.25], i ? ASHLAR_L : ASHLAR_W, undefined, 0.02);
  k.box(g, [P - 0.1, 0.04, T], [0, 0.02, 0], TRIM_D);
}

/**
 * The lord's crest (facing +Z, its top edge at `top`): a heater shield `w` wide in royal blue, a gold
 * rim standing out behind it, and the gold dragon diamond.
 */
export function crest(k: ModelKit, p: THREE.Object3D, x: number, top: number, z: number, w: number) {
  const body = w * 0.7, point = w * 0.62;
  cb(k, p, [w + 0.1, body + 0.08, 0.06], [x, top - body / 2 + 0.02, z - 0.03], PAL.gold, undefined, 0.02);
  k.mesh(p, clothPoint(w + 0.1, point + 0.1, 0.06), PAL.gold, [x, top - body + 0.01, z - 0.03]);
  cb(k, p, [w, body, 0.1], [x, top - body / 2, z], HERALD_BLUE, undefined, 0.02);
  k.mesh(p, clothPoint(w, point, 0.1), HERALD_BLUE, [x, top - body + 0.005, z]);
  k.box(p, [w * 0.4, w * 0.4, 0.05], [x, top - body * 0.8, z + 0.06], PAL.gold, [0, 0, Math.PI / 4]);
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
    const L = lenOf(arg) ?? 10, T = 2.2, H = 7;
    // Cream ashlar on a blue-grey plinth, a weathered course above it; blue-grey string courses run
    // on round the towers' bands, and one continuous coping lies under the merlons.
    // (Broad bands, so the two tones still read from the high camera and from out over the island.)
    cb(k, g, [L, 1.1, T + 0.5], [0, 0.55, 0], TRIM_D, undefined, 0.06);
    cb(k, g, [L, 0.22, T + 0.62], [0, 1.15, 0], TRIM, undefined, 0.03);
    cb(k, g, [L, H - 1.1, T], [0, 1.1 + (H - 1.1) / 2, 0], ASHLAR, undefined, 0.04);
    cb(k, g, [L, 0.5, T + 0.04], [0, 1.5, 0], ASHLAR_W, undefined, 0.02);
    cb(k, g, [L, 0.3, T + 0.18], [0, 3.6, 0], TRIM, undefined, 0.03);
    // The parapet band on the outer face, under the wall walk.
    cb(k, g, [L, 0.5, 0.2], [0, H - 0.25, -T / 2 - 0.06], TRIM, undefined, 0.02);
    // The wall walk: the deck, the outer parapet with its coping and merlons, the inner rail.
    k.box(g, [L, 0.06, T - 0.9], [0, H + 0.03, 0.1], DECK);
    cb(k, g, [L, 0.75, 0.6], [0, H + 0.37, -T / 2 + 0.3], ASHLAR, undefined, 0.03);
    cb(k, g, [L, 0.12, 0.72], [0, H + 0.78, -T / 2 + 0.3], TRIM, undefined, 0.02);
    for (let u = -L / 2 + 0.5; u < L / 2 - 0.3; u += 1.3) cb(k, g, [0.72, 0.6, 0.6], [u, H + 1.05, -T / 2 + 0.3], hash01(u, T) > 0.7 ? ASHLAR_L : ASHLAR, undefined, 0.05);
    // On the inner face, the wall walk's rail corbelled out over the face: a row of corbels carrying
    // a slate course, the rail standing on it flush with the course's face, its own coping on top
    // (the same lines as the drums' corbelled parapets, so the trim runs on round the towers).
    for (let u = -L / 2 + 0.6; u < L / 2 - 0.3; u += 1.2) cb(k, g, [0.32, 0.46, 0.34], [u, H - 0.42, T / 2 + 0.12], TRIM, undefined, 0.02);
    cb(k, g, [L, 0.22, 0.42], [0, H - 0.08, T / 2 + 0.16], TRIM, undefined, 0.02);
    cb(k, g, [L, 0.9, 0.42], [0, H + 0.48, T / 2 + 0.06], ASHLAR_W, undefined, 0.03);
    cb(k, g, [L, 0.12, 0.52], [0, H + 0.96, T / 2 + 0.06], TRIM, undefined, 0.02);
    cb(k, g, [L, 0.22, T + 0.14], [0, 5.6, 0], TRIM, undefined, 0.02);
    // The lord's banner on the outer face, centred on every run long enough to carry one, and arrow
    // slits along the rest.
    const banner = L >= 7;
    for (let u = -L / 2 + 2; u < L / 2 - 1; u += 4) if (!banner || Math.abs(u) > 1.5) k.box(g, [0.16, 1.0, 0.1], [u, 4.6, -T / 2 - 0.01], DARK);
    if (banner) {
      const out = new THREE.Group();
      out.position.set(0, 0, -T / 2 - 0.2);
      out.rotation.y = Math.PI;
      g.add(out);
      livery(k, out, 0, H - 0.6, 0, 1.3, 2.3);
    }
  },
  /**
   * A round wall tower, radius `len`: a battered plinth, a drum rising a full storey over the wall
   * walk (+7) to its platform, and on top a corbelled parapet ring all round with ten evenly spaced
   * merlons. `v` (9 or 10) sets how tall: the platform stands at v + 1.4.
   */
  round_tower: (k, g, arg) => drumTower(k, g, lenOf(arg) ?? 3.2, vOf(arg) || 9, false),
  /**
   * A corner tower of the curtain: a round tower a stage taller than the wall towers, a gilt frieze
   * under its parapet and a blue-slate spire with a gilt finial and a pennant standing inside its
   * merlon ring, so the corners step the skyline up round the walls (the wall towers stay flat).
   */
  corner_tower: (k, g, arg) => drumTower(k, g, lenOf(arg) ?? 3.4, vOf(arg) || 12, true),
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
   * The outer gatehouse in the curtain: two D-towers (radius 2.6) standing out from the curtain's
   * outer face either side of the passage (`len` wide, their centres 5.4 either side of it, so the
   * ceremonial arch and its hood stand clear between them), and
   * between them the gatehouse block, through the curtain's thickness and a storey higher than it:
   * the passage under a pointed arch of dressed voussoirs, the portcullis raised in the arch, a
   * machicolated, crenellated parapet, the lord's banner over the arch and one on each drum. Built along local X,
   * outer face toward -Z.
   */
  outer_gatehouse: (k, g, arg) => {
    // The drums rise a stage over the wall towers either side (their platforms at 10.4) to 13, each
    // crowned with a slate spire banded in gold and flying the gate's pennant from its finial, so the
    // skyline steps up at the gate as it does at the corners and the keep.
    const P = lenOf(arg) ?? 4, R = 2.6, H = 13, cx = 6.0, tz = -1.5, T = 2.2, D = T + 0.8, GH = 10.6, N = 20;
    for (const sx of [-1, 1]) {
      const x = sx * cx;
      k.cyl(g, R + 0.2, R + 0.55, 1.1, [x, 0.55, tz], TRIM_D, undefined, N);
      k.cyl(g, R, R, H - 1.1, [x, 1.1 + (H - 1.1) / 2, tz], ASHLAR, undefined, N);
      k.cyl(g, R + 0.03, R + 0.03, 0.5, [x, 1.5, tz], ASHLAR_W, undefined, N);
      k.cyl(g, R + 0.2, R + 0.5, 0.22, [x, 1.15, tz], TRIM, undefined, N);
      for (const y of [3.6, 5.6, 6.92]) k.cyl(g, R + 0.1, R + 0.1, y === 3.6 ? 0.3 : 0.22, [x, y, tz], TRIM, undefined, N);
      drumFrieze(k, g, x, tz, R, H - 1.75, N);
      crown(k, g, x, tz, R, H, N, false);
      spire(k, g, x, H + 0.9, tz, R + 0.1, R * 1.75, N, sx, 1.6);
      for (const y of [5.2, 8.8]) k.box(g, [0.16, 1.0, 0.1], [x + sx * 0.9, y, tz - R + 0.15], DARK, [0, sx * -0.36, 0]);
    }
    // The gatehouse block, its arch cut as a pointed (two-centred) arch: the jambs to the springing,
    // then courses whose opening closes in along the two arcs to the apex, solid above.
    const spring = 3.6, ra = P * 0.8, off = ra - P / 2, apex = spring + Math.sqrt(ra * ra - off * off);
    const half = (y: number) => Math.max(0, Math.sqrt(Math.max(0, ra * ra - (y - spring) ** 2)) - off);
    const zc = 0.4 - 0.2;
    for (const sx of [-1, 1]) cb(k, g, [cx - P / 2, spring, D], [sx * (P / 2 + (cx - P / 2) / 2), spring / 2, zc], ASHLAR, undefined, 0.03);
    for (const sx of [-1, 1]) cb(k, g, [cx - P / 2 - 0.3, 0.6, D + 0.12], [sx * (P / 2 + 0.3 + (cx - P / 2 - 0.3) / 2), 0.3, zc], TRIM_D, undefined, 0.03);
    for (let y = spring; y < apex - 0.01; y += 0.2) {
      const y1 = Math.min(apex, y + 0.2), hw = half((y + y1) / 2);
      for (const sx of [-1, 1]) cb(k, g, [cx - hw, y1 - y + 0.01, D], [sx * (hw + (cx - hw) / 2), (y + y1) / 2, zc], ASHLAR, undefined, 0.0);
    }
    // Above the arch the block runs out into the drums up to the wall walk (so no notch opens where
    // the curtain meets it on the inner face), then rises between the drums to its parapet.
    const bw = cx - R + 0.45, WW = 7.9;
    cb(k, g, [2 * cx, WW - apex, D], [0, (apex + WW) / 2, zc], ASHLAR, undefined, 0.04);
    cb(k, g, [2 * bw, GH - WW, D], [0, (WW + GH) / 2, zc], ASHLAR, undefined, 0.04);
    // The ceremonial arch: voussoirs alternating pale ashlar and blue-grey on both faces, a hood
    // mould over them, and a pale keystone bearing the lord's shield on the outer face.
    for (const e of [-1, 1]) {
      const fz = zc + e * (D / 2 + 0.06);
      for (const sx of [-1, 1]) {
        const a0 = Math.atan2(0, -(P / 2 + off)), a1 = Math.atan2(apex - spring, -off);
        // One cut ring: voussoirs on a common radius, edge to edge in one plane just proud of the
        // face, and the hood mould lying directly on their backs.
        for (let i = 0; i < 7; i++) {
          const a = a0 + ((a1 - a0) * (i + 0.5)) / 7, rr = ra + 0.25;
          const px = sx * (off + Math.cos(a) * rr), py = spring + Math.sin(a) * rr;
          cb(k, g, [0.5, ((a1 - a0) / 7) * rr + 0.02, 0.12], [px, py, fz - e * 0.01], i % 2 ? TRIM : ASHLAR_L, [0, 0, sx > 0 ? a : Math.PI - a], 0.005);
        }
        for (let i = 0; i < 8; i++) {
          const a = a0 + ((a1 - a0) * (i + 0.5)) / 8, rr = ra + 0.58;
          const px = sx * (off + Math.cos(a) * rr), py = spring + Math.sin(a) * rr;
          cb(k, g, [0.16, ((a1 - a0) / 8) * rr + 0.04, 0.2], [px, py, fz + e * 0.03], TRIM, [0, 0, sx > 0 ? a : Math.PI - a], 0.01);
        }
        cb(k, g, [0.24, 0.3, 0.34], [sx * (P / 2 + 0.68), spring + 0.02, fz + e * 0.06], TRIM, undefined, 0.02);
        cb(k, g, [0.3, spring, 0.2], [sx * (P / 2 + 0.15), spring / 2, fz], ASHLAR_L, undefined, 0.02);
      }
      cb(k, g, [0.5, 0.7, 0.24], [0, apex + 0.25, fz], ASHLAR_L, undefined, 0.03);
    }
    {
      const kz = zc - D / 2 - 0.2;
      cb(k, g, [0.36, 0.3, 0.05], [0, apex + 0.36, kz], HERALD_BLUE, undefined, 0.01);
      k.box(g, [0.13, 0.13, 0.03], [0, apex + 0.36, kz - 0.03], PAL.gold, [0, 0, Math.PI / 4]);
    }
    // The portcullis, raised: its grid filling the arch head, the spiked foot just below it.
    const pz = zc - D / 2 + 0.55;
    for (let x = -P / 2 + 0.3; x < P / 2 - 0.2; x += 0.42) {
      const top = spring + Math.sqrt(Math.max(0, ra * ra - (Math.abs(x) + off) ** 2)) - 0.05;
      if (top < 4.6) continue;
      k.box(g, [0.1, top - 4.3, 0.1], [x, (top + 4.3) / 2, pz], IRON);
      k.mesh(g, taper(0.1, 0.1, 0.01, 0.01, 0.25), IRON, [x, 4.18, pz], [Math.PI, 0, 0]);
    }
    for (const y of [4.6, 5.3, 6.0]) {
      const hw = half(y) - 0.05;
      if (hw > 0.2) k.box(g, [hw * 2, 0.09, 0.12], [0, y, pz], IRON);
    }
    // Machicolations along the outer face, then the parapet all round the block's top.
    for (let u = -bw + 0.45; u <= bw - 0.4; u += 0.95) cb(k, g, [0.34, 0.55, 0.5], [u, GH - 0.3, zc - D / 2 - 0.2], TRIM, undefined, 0.03);
    cb(k, g, [2 * bw, 1.0, 0.6], [0, GH + 0.5, zc - D / 2 - 0.15], ASHLAR, undefined, 0.03);
    cb(k, g, [2 * bw, 1.0, 0.5], [0, GH + 0.5, zc + D / 2 - 0.25], ASHLAR, undefined, 0.03);
    for (const sx of [-1, 1]) cb(k, g, [0.5, 1.0, D - 0.4], [sx * (bw - 0.25), GH + 0.5, zc], ASHLAR, undefined, 0.03);
    cb(k, g, [2 * bw + 0.1, 0.14, 0.74], [0, GH + 1.06, zc - D / 2 - 0.15], TRIM, undefined, 0.02);
    frieze(k, g, 2 * bw + 0.1, 0, GH - 0.85, zc - D / 2 - 0.12);
    cb(k, g, [2 * bw + 0.1, 0.14, 0.64], [0, GH + 1.06, zc + D / 2 - 0.25], TRIM, undefined, 0.02);
    // The roof deck stands nearly flush with the parapet, so the block reads as one solid mass.
    cb(k, g, [2 * bw - 0.5, 0.7, D - 0.7], [0, GH + 0.35, zc], DECK, undefined, 0.02);
    for (let i = 0; i < 4; i++) {
      const u = -bw + 0.5 + (i * (2 * bw - 1.0)) / 3;
      cb(k, g, [0.8, 0.75, 0.62], [u, GH + 1.5, zc - D / 2 - 0.15], ASHLAR, undefined, 0.04);
      cb(k, g, [0.8, 0.75, 0.52], [u, GH + 1.5, zc + D / 2 - 0.25], ASHLAR, undefined, 0.04);
    }
    // The lord's banner over the arch on the outer face (facing out, -Z): the middle of the gate
    // front's five flags.
    {
      const out = new THREE.Group();
      out.position.set(0, 0, zc - D / 2 - 0.12);
      out.rotation.y = Math.PI;
      g.add(out);
      livery(k, out, 0, GH - 0.75, 0, 1.5, 1.6);
    }
    k.box(g, [P - 0.1, 0.04, D], [0, 0.02, zc], TRIM_D);
  },
  /**
   * A solid masonry stair against a wall's inner face (on its -Z side), climbing toward +X over
   * `len` to the wall walk at +7: one block per riser, no space beneath.
   */
  wall_flight: (k, g, arg) => {
    const L = lenOf(arg) ?? 8.4, n = 25, t = L / n, D = 1.3, H = 7;
    for (let i = 0; i < n; i++) {
      const y = ((i + 1) * H) / n, x = -L / 2 + (i + 0.5) * t;
      cb(k, g, [t + 0.01, y, D], [x, y / 2, 0], ASHLAR_W, undefined, 0.02);
      cb(k, g, [t + 0.03, 0.06, D + 0.04], [x, y - 0.03, 0], TRIM, undefined, 0.01);
    }
  },
  /**
   * The donjon: the great round tower at the castle's high corner (radius `len`, `v` tall), a
   * battered base, string courses at each floor, lit windows, a corbelled crenellated parapet, and
   * inside the merlon ring the castle's one spire: deep blue slate on a blue-grey eave, a gold
   * finial, and the lord's banner on a pole above it.
   */
  donjon: (k, g, arg) => {
    const r = lenOf(arg) ?? 7, H = vOf(arg) || 13, N = 24;
    k.cyl(g, r + 0.3, r + 0.8, 1.2, [0, 0.6, 0], TRIM_D, undefined, N);
    k.cyl(g, r, r, H - 1.2, [0, 1.2 + (H - 1.2) / 2, 0], ASHLAR, undefined, N);
    k.cyl(g, r + 0.03, r + 0.03, 0.5, [0, 1.45, 0], ASHLAR_W, undefined, N);
    for (const y of [5, 9]) k.cyl(g, r + 0.12, r + 0.12, 0.26, [0, y, 0], TRIM, undefined, N);
    k.cyl(g, r + 0.45, r + 0.2, 0.5, [0, H + 0.25, 0], TRIM, undefined, N);
    k.cyl(g, r - 0.4, r - 0.4, 0.1, [0, H + 0.45, 0], DECK, undefined, N);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2, c = 2 * (r + 0.2) * Math.sin(Math.PI / N) + 0.05;
      const x = Math.sin(a) * (r + 0.05), z = Math.cos(a) * (r + 0.05);
      cb(k, g, [c, 0.8, 0.6], [x, H + 0.9, z], ASHLAR, [0, a, 0], 0.03);
      if (i % 2 === 0) cb(k, g, [c * 0.8, 0.7, 0.62], [x, H + 1.65, z], hash01(i, r) > 0.7 ? ASHLAR_L : ASHLAR, [0, a, 0], 0.05);
    }
    k.mesh(g, ringBand(r - 0.28, r + 0.45, 0.12, N), TRIM, [0, H + 1.24, 0]);
    // The spire, standing inside the merlon ring on its eave: royal blue slate banded in gold, four
    // gabled lucarnes with lit windows round it a quarter of the way up, a great gilt orb and spike
    // at its point, and the lord's banner on a pole above.
    const sh = r * 1.6, s0 = H + 0.9, R0 = r + 0.15;
    spire(k, g, 0, s0, 0, R0, sh, N);
    const tip = s0 + 0.16 + sh;
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2, f = 0.26, rr = R0 * (1 - f) - 0.55, y = s0 + 0.16 + sh * f;
      const d = new THREE.Group();
      d.position.set(Math.sin(a) * rr, y, Math.cos(a) * rr);
      d.rotation.y = a;
      g.add(d);
      cb(k, d, [1.5, 1.7, 2.2], [0, 0.85, 0], ASHLAR_B, undefined, 0.04);
      k.mesh(d, wedge(2.4, 0.9, 1.8), SLATE_BLUE, [0, 2.15, 0.05], [0, Math.PI / 2, 0]);
      cb(k, d, [1.7, 0.14, 0.2], [0, 1.72, 1.12], TRIM, undefined, 0.02);
      lancet(k, d, 0, 0.3, 1.1, 0.55, 1.2, false, true);
      k.mesh(d, new THREE.OctahedronGeometry(0.16, 0), PAL.gold, [0, 2.75, 1.15]);
    }
    cb(k, g, [0.14, 3.6, 0.14], [0, tip + 1.6 + 1.8, 0], IRON, undefined, 0.02);
    flag(k, g, 0, tip + 5.0, 0, 3.2, 2.0, 1);
    // Tall pointed lancets, each centred on a face of the drum (the same window as the halls'), stacked
    // one per storey in columns either side of the south, mirrored east and west.
    const ap = r * Math.cos(Math.PI / N), step = (Math.PI * 2) / N;
    for (const col of [3, 6]) for (const sgn of [-1, 1]) {
      const a = sgn * (col + 0.5) * step;
      const face = new THREE.Group();
      face.position.set(Math.sin(a) * ap, 0, Math.cos(a) * ap);
      face.rotation.y = a;
      g.add(face);
      for (const y of col === 3 ? [2.2, 6.0, 9.6] : [6.0, 9.6]) lancet(k, face, 0, y, 0.02, 0.72, 2.3, true, true);
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
  herb_bed: (k, g) => {
    // A raised planting bed of herbs and flowers.
    cb(k, g, [3.0, 0.4, 1.3], [0, 0.2, 0], WOOD_D, undefined, 0.04);
    k.box(g, [2.8, 0.06, 1.1], [0, 0.4, 0], 0x3a2a1e);
    for (let i = 0; i < 9; i++) {
      const x = -1.2 + (i % 5) * 0.6 + (Math.floor(i / 5) ? 0.3 : 0), z = Math.floor(i / 5) ? 0.25 : -0.25;
      cb(k, g, [0.4, 0.3 + (i % 3) * 0.08, 0.4], [x, 0.55, z], i % 4 === 3 ? 0x8a5aa0 : i % 2 ? 0x5a8a3a : 0x4a7a34, [0, i, 0], 0.12);
    }
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
    for (const y of [0.45, 0.88]) {
      for (let i = 0; i < n; i++) {
        const x0 = -L / 2 + (i * L) / n, x1 = -L / 2 + ((i + 1) * L) / n;
        cb(k, g, [x1 - x0 + 0.1, 0.1, 0.08], [(x0 + x1) / 2, y + (hash01(i, y) - 0.5) * 0.05, 0.1], WOOD, undefined, 0.02);
      }
    }
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
   * A low stone parapet along local X (`arg` = length): a plinth, a solid breast wall, a coping; under
   * it, on its open (+Z) side, a cut-stone course down over the lip of the drop, so the edge it
   * stands on is finished in dressed stone.
   */
  parapet: (k, g, arg) => {
    // The castle's own stone: a cream breast wall under one continuous blue-grey coping, on a
    // blue-grey base course and lip.
    const L = Math.max(2, arg ?? 6);
    cb(k, g, [L + 0.08, 1.5, 0.7], [0, -0.62, 0.42], TRIM_D, undefined, 0.03);
    cb(k, g, [L + 0.1, 0.14, 0.82], [0, -1.32, 0.46], TRIM_D, undefined, 0.02);
    cb(k, g, [L + 0.2, 0.24, 0.9], [0, 0.12, 0], TRIM_D, undefined, 0.04);
    cb(k, g, [L, 0.62, 0.62], [0, 0.55, 0], ASHLAR, undefined, 0.04);
    cb(k, g, [L + 0.12, 0.14, 0.78], [0, 0.93, 0], TRIM, undefined, 0.03);
  },
  /**
   * A kerb along local X, `len` long: a chamfered blue-grey slab 0.5 wide standing 0.05 proud of the
   * paving, edging a walk. `v` 1: an inlay band instead, paler and flush, laid across a walk.
   */
  kerb: (k, g, arg) => {
    const L = Math.max(0.5, lenOf(arg) ?? 4), inlay = vOf(arg) === 1;
    if (inlay) cb(k, g, [L, 0.1, 0.6], [0, -0.03, 0], TRIM_L, undefined, 0.02);
    else cb(k, g, [L, 0.12, 0.5], [0, -0.01, 0], TRIM_D, undefined, 0.03);
  },
  /**
   * A round kerb of radius `len` in 40 slabs like a kerb's, ringing a plaza, open where the walks
   * come in on its four axes (no slab within `v` of the X or Z axis).
   */
  kerb_ring: (k, g, arg) => {
    const r = lenOf(arg) ?? 10, gap = vOf(arg), N = 40, chord = 2 * r * Math.sin(Math.PI / N);
    for (let i = 0; i < N; i++) {
      const a = ((i + 0.5) / N) * Math.PI * 2, x = Math.sin(a) * r, z = Math.cos(a) * r;
      if (Math.abs(x) < gap || Math.abs(z) < gap) continue;
      cb(k, g, [q(chord + 0.06), 0.12, 0.5], [x, -0.01, z], TRIM_D, [0, a, 0], 0.03);
    }
  },
  /**
   * Ivy or a climbing rose against a wall (its back on z = 0, growing up its +Z face): leafy masses
   * hugging the face, dense at the foot and thinning upward to a ragged top, `len` wide. `v` 0 ivy
   * (up to 4.5 high), 1 roses on a faint trellis (up to 3 high) with pink and white blooms. `bend`
   * the growth round a drum of that radius (the wall curving away behind it).
   */
  wall_climber: (k, g, arg) => {
    const L = Math.max(1.5, lenOf(arg) ?? 4), rose = vOf(arg) === 1, R: number | undefined = typeof arg === 'object' ? arg?.bend : undefined;
    const top = rose ? 4.2 : 5.0, LEAF = rose ? CLIMBER_ROSE_LEAF : CLIMBER_IVY, seed = Math.round(L * 10) + (rose ? 7 : 0);
    /** How far the face falls back at u along it (round a drum). */
    const sag = (u: number) => (R ? R - Math.sqrt(Math.max(0, R * R - u * u)) : 0);
    const turn = (u: number) => Math.asin(Math.max(-1, Math.min(1, u / (R ?? 1e9))));
    // Woody stems first: a few leaders climbing from the foot, branching out, under the leaves.
    const leaders = Math.max(2, Math.round(L / 1.2));
    for (let i = 0; i < leaders; i++) {
      const u0 = -L / 2 + (L * (i + 0.5)) / leaders, h = top * (0.55 + 0.35 * hash01(seed, i, 9));
      const u1 = u0 * 0.7 + (hash01(seed, i, 8) - 0.5) * 0.6;
      limb(k, g, [u0, 0.05, 0.06 - sag(u0)], [u1, h, 0.06 - sag(u1)], [0.07, 0.05, 0.03, 0.02], WOOD_D);
    }
    if (rose) for (let i = 0; i <= 4; i++) {
      const u = -L / 2 + 0.3 + (i * (L - 0.6)) / 4;
      cb(k, g, [0.05, top - 0.3, 0.05], [u, (top - 0.3) / 2, 0.04 - sag(u)], WOOD_D, undefined, 0.01);
    }
    // A sheet of flat leaf cards hugging the face: dense at the foot, the sheet narrowing and thinning
    // as it climbs to a ragged top (each column of leaves reaching its own height).
    const STEP = 0.2, cols = Math.max(8, Math.round(L / STEP));
    for (let c = 0; c < cols; c++) {
      const u0 = -L / 2 + (L * (c + 0.5)) / cols, edge = Math.abs(u0) / (L / 2);
      const h = top * (0.55 + 0.45 * hash01(seed, c)) * (1 - 0.55 * edge * edge);
      for (let y = 0.15 + (c % 2) * STEP * 0.5, j = 0; y < h; y += STEP, j++) {
        const f = y / h;
        // The sheet tapers: toward its top only the middle carries on.
        if (edge > 1 - 0.6 * f * f) continue;
        if (hash01(seed, c, j) > 0.98 - 0.55 * f * f) continue;
        const u = u0 + (hash01(seed + 2, c, j) - 0.5) * 0.1, yy = y + (hash01(seed + 6, c, j) - 0.5) * 0.08;
        const sz = 0.15 + hash01(seed + 1, c, j) * 0.08;
        const m = k.mesh(g, CLIMBER_LEAF, LEAF[Math.floor(hash01(seed + 3, c, j) * LEAF.length)], [u, yy, 0.06 + hash01(seed + 7, c, j) * 0.05 - sag(u)], [(hash01(seed + 8, c, j) - 0.5) * 0.5, turn(u), hash01(seed + 5, c, j) * 3]);
        m.scale.set(sz, sz * 1.25, 0.025);
        if (rose && hash01(seed + 4, c, j) > 0.8) k.gem(g, 0.08, [u, yy + 0.04, 0.16 - sag(u)], CLIMBER_BLOOM[(c + j) % 3]);
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
    k.mesh(g, wedge(0.04, 0.32, 0.6), HERALD_BLUE, [0.7, 2.22, 0.1], [0, Math.PI / 2, 0]);
    k.box(g, [0.05, 0.32, 0.08], [0.7, 2.22, -0.17], PAL.gold);
  },
  // ─── Castle gardens ───────────────────────────────────────────────────────────
  /**
   * A flower bed `len` long: a low stone kerb round dark soil, planted in drifts of one colour each
   * (`v` picks the colours): tall flower spikes down the middle, rounded clusters of bloom either side
   * and low trailing clumps along the edges, their leaves spilling over the kerb.
   */
  flower_bed: (k, g, arg) => {
    const L = lenOf(arg) ?? 3.2, v = vOf(arg), W = 1.3;
    const sets = [[0xd84a6a, 0xf0c848, 0xf4ece0], [0x8a5ac8, 0xe86aa8, 0xf4ece0], [0xe85a3a, 0xf0a030, 0xf0d860], [0x5a8ad8, 0xf4ece0, 0xd8a0e0]];
    const cols = sets[v % sets.length], LEAF = [0x3e6e2e, 0x4a7a34, 0x56883c];
    cb(k, g, [L, 0.24, W], [0, 0.12, 0], STONE_L, undefined, 0.04);
    k.box(g, [L - 0.24, 0.06, W - 0.24], [0, 0.25, 0], 0x3a2a1e);
    const drift = (x: number) => cols[Math.min(2, Math.floor(((x + L / 2) / L) * 3))];
    // Tall spikes down the middle: a stem of buds narrowing up it.
    const nS = Math.max(2, Math.round(L / 0.55));
    for (let i = 0; i < nS; i++) {
      const x = -L / 2 + 0.3 + (i * (L - 0.6)) / Math.max(1, nS - 1) + (hash01(i, 1, v) - 0.5) * 0.1, z = (hash01(i, 2, v) - 0.5) * 0.12;
      const h = 0.5 + hash01(i, 3, v) * 0.22, c = drift(x);
      ball(k, g, 0.16, [x, 0.36, z], LEAF[i % 3], [1, 0.8, 1]);
      cb(k, g, [0.03, h, 0.03], [x, 0.3 + h / 2, z], LEAF[1], undefined, 0.005);
      for (let j = 0; j < 4; j++) k.gem(g, 0.075 - j * 0.012, [x + (j % 2 ? 0.02 : -0.02), 0.5 + (h - 0.25) * (j / 3) + 0.08, z], c);
    }
    // Rounded clusters of bloom either side of the spikes.
    const nR = Math.max(3, Math.round(L / 0.42));
    for (const sz of [-1, 1]) for (let i = 0; i < nR; i++) {
      const x = -L / 2 + 0.22 + ((i + (sz > 0 ? 0.5 : 0)) * (L - 0.44)) / nR, z = sz * 0.3 + (hash01(i, sz, v) - 0.5) * 0.08;
      const c = drift(x), y = 0.36 + hash01(i, 4, v) * 0.06;
      ball(k, g, 0.17, [x, y, z], LEAF[(i + 1) % 3], [1.1, 0.75, 1]);
      for (const [dx, dz] of [[-0.06, 0.02], [0.06, 0.03], [0, -0.05], [0.02, 0.07]]) k.gem(g, 0.065, [x + dx, y + 0.12, z + dz], c);
    }
    // Low trailing clumps along both edges, spilling over the kerb, a few small flowers in them.
    const nT = Math.max(3, Math.round(L / 0.5));
    for (const sz of [-1, 1]) for (let i = 0; i < nT; i++) {
      const x = -L / 2 + 0.25 + (i * (L - 0.5)) / Math.max(1, nT - 1), z = sz * (W / 2 - 0.02);
      ball(k, g, 0.16, [x, 0.27, z], LEAF[i % 3], [1.3, 0.5, 1.1]);
      if ((i + (sz > 0 ? 1 : 0)) % 2 === 0) k.gem(g, 0.05, [x + 0.04, 0.36, z + sz * 0.04], cols[2]);
    }
  },
  /** Clipped topiary in a square stone planter (`len`: 0 a ball, 1 a cone). */
  topiary: (k, g, arg) => {
    const cone = (lenOf(arg) ?? 0) === 1;
    cb(k, g, [0.95, 0.7, 0.95], [0, 0.35, 0], STONE_L, undefined, 0.05);
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
   * The bailey's centrepiece (facing +Z, toward the gate): a round basin, a 16-sided moulded kerb
   * (outer radius 5.6) on a low plinth step round a clear pool, a stacked rock island at its heart
   * and the bronze dragon rearing on the rock, more than twice life size and about 9 high, wings
   * spread, water pouring from its open jaws into the pool. Four small jets arc in from bronze spouts
   * on the kerb's diagonals; foam, spray and rings spread where the water lands.
   */
  dragon_fountain: (k, g) => {
    const N = 16, RO = 5.6, RI = 4.9, H = 0.75, RM = (RO + RI) / 2, WY = 0.8, S = 2.2, time = { value: 0 };
    k.cyl(g, 6.1, 6.1, 0.2, [0, 0.1, 0], STONE_D, [0, Math.PI / N, 0], N);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + Math.PI / N, c = 2 * RM * Math.sin(Math.PI / N) + 0.06;
      cb(k, g, [c, H, RO - RI], [Math.sin(a) * RM, 0.2 + H / 2, Math.cos(a) * RM], i % 2 ? STONE_L : STONE, [0, a, 0], 0.05);
      cb(k, g, [c + 0.08, 0.12, RO - RI + 0.2], [Math.sin(a) * RM, 0.2 + H + 0.04, Math.cos(a) * RM], STONE_L, [0, a, 0], 0.03);
    }
    // The basin floor, dark under the water so the pool has depth.
    k.cyl(g, RI, RI, 0.1, [0, 0.05, 0], 0x1a2e30, [0, Math.PI / N, 0], N);
    // The rock island: broad slabs stacked and turned against each other, stepping up to the
    // dragon's ledge, a few boulders at the waterline.
    const rocks: [number, V3, V3, number, number][] = [
      [91, [4.4, 0.95, 4.0], [0.05, 0, -0.1], 0.2, STONE_DD], [92, [4.0, 0.85, 4.4], [-0.05, 0, -0.15], 0.95, STONE_D],
      [93, [3.9, 0.5, 3.6], [0, 0.78, -0.2], 0.55, STONE_DD], [94, [3.5, 0.4, 3.3], [0.05, 1.2, -0.25], 0.1, STONE_D],
    ];
    for (const [seed, size, pos, rot, col] of rocks) slab(k, g, seed, size, pos, col, rot);
    for (const [i, a] of [2.0, 2.75, 3.6, 4.2].entries()) chunk(k, g, 95 + i, [0.9, 0.55, 0.75], [Math.sin(a) * 2.25, 0.3, Math.cos(a) * 2.25], STONE_D, a);
    // The dragon, rearing, its jaws open over the front of the pool.
    const beast = new THREE.Group();
    beast.position.y = 1.6;
    beast.scale.setScalar(S);
    const jaw = dragonBeast(k, beast, { rear: 1, wings: 1, head: 1, jaw: 0.35 }).multiplyScalar(S).add(beast.position);
    g.add(beast);
    // Bronze spouts on the kerb's diagonals, each throwing a small jet in toward the rock.
    const impacts: Impact[] = [[0, 4.4, 1]];
    const sheets: [THREE.Vector3[], number, number, number][] = [[pour(jaw, new THREE.Vector3(0, WY, 4.4), 0.7, 28), 0.3, 0.42, 51]];
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2, sx = Math.sin(a), sz = Math.cos(a);
      // A square stone pedestal on the coping, a bronze pipe and its ring.
      cb(k, g, [0.56, 0.32, 0.56], [sx * RM, 0.2 + H + 0.26, sz * RM], STONE_L, [0, a, 0], 0.04);
      cb(k, g, [0.66, 0.08, 0.66], [sx * RM, 0.2 + H + 0.46, sz * RM], STONE, [0, a, 0], 0.02);
      limb(k, g, [sx * (RM - 0.1), 0.2 + H + 0.26, sz * (RM - 0.1)], [sx * (RI - 0.3), 0.2 + H + 0.3, sz * (RI - 0.3)], [0.12, 0.12, 0.09, 0.09], BRONZE);
      limb(k, g, [sx * (RI - 0.24), 0.2 + H + 0.3, sz * (RI - 0.24)], [sx * (RI - 0.32), 0.2 + H + 0.3, sz * (RI - 0.32)], [0.17, 0.17, 0.17, 0.17], WORN);
      const from = new THREE.Vector3(sx * (RI - 0.34), 0.2 + H + 0.31, sz * (RI - 0.34)), to = new THREE.Vector3(sx * 3.3, WY, sz * 3.3);
      sheets.push([arc(from, to, 0.62, 18), 0.12, 0.16, 61 + i]);
      impacts.push([to.x, to.z, 0.45]);
    }
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
    const water = new THREE.Mesh(new THREE.CircleGeometry(RI + 0.02, N).rotateX(-Math.PI / 2).rotateY(Math.PI / N), poolWater(time, RI, impacts, refl));
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
    const foamDisc = new THREE.Mesh(softDisc(91, 0.9, [0.9, 0.95, 0.96], 0.75), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    foamDisc.position.set(0, WY + 0.03, 4.4);
    foamDisc.name = 'foam-spread';
    foamDisc.material.userData.decal = foamDisc.material.userData.noOcclude = true;
    foamDisc.renderOrder = 3;
    g.add(foamDisc);
    const foamMat = new THREE.MeshStandardMaterial({ color: 0xeaf4f4, roughness: 0.7, emissive: 0x3a5a60, flatShading: true });
    foamMat.userData.noOcclude = true;
    const foam: THREE.Mesh[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2, r = i ? 0.3 + hash01(i, 5) * 0.35 : 0;
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13 + hash01(i, 3) * 0.12, 0), foamMat);
      f.position.set(Math.sin(a) * r, WY, 4.4 + Math.cos(a) * r * 0.8);
      f.name = 'foam';
      g.add(f);
      foam.push(f);
    }
    for (const [x, z] of impacts.slice(1)) {
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), foamMat);
      f.position.set(x, WY, z);
      f.name = 'foam';
      g.add(f);
      foam.push(f);
    }
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
        foam.forEach((f, i) => {
          const s = 0.75 + 0.35 * Math.sin(t * 3.4 + i * 1.7);
          f.scale.set(s * 1.2, s * (0.55 + 0.25 * Math.sin(t * 4.6 + i)), s * 1.2);
          f.position.y = WY + 0.03 * Math.sin(t * 2.9 + i * 2.3);
        });
        foamDisc.scale.setScalar(1 + 0.08 * Math.sin(t * 2.3));
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
   * a lancet on each storey of its front, string courses level with the hall's, quoined corners and a
   * corbelled, crenellated top. Its twin across the axis is identical, so the door stands between two
   * equal masses.
   */
  pavilion: (k, g) => {
    const W = 4, D0 = -1.0, D1 = 2.1, H = 13.6, d = D1 - D0, zc = (D0 + D1) / 2;
    cb(k, g, [W + 0.6, 0.62, d + 0.3], [0, 0.31, zc + 0.15], TRIM_D, undefined, 0.05);
    cb(k, g, [W + 0.3, 0.34, d + 0.15], [0, 0.79, zc + 0.08], TRIM, undefined, 0.04);
    cb(k, g, [W, H - 0.62, d], [0, 0.62 + (H - 0.62) / 2, zc], ASHLAR_B, undefined, 0.04);
    for (const y of [5.0, 9.0]) cb(k, g, [W + 0.18, 0.24, d + 0.12], [0, y, zc + 0.06], TRIM, undefined, 0.03);
    // Quoins in the two blue-greys (never cream against dark, which reads as piano keys from above).
    for (const sx of [-1, 1]) for (let y = 1.0, i = 0; y < H - 1.2; y += 0.56, i++) {
      cb(k, g, i % 2 ? [0.62, 0.5, 0.44] : [0.44, 0.5, 0.62], [sx * (W / 2 - 0.2), y + 0.25, D1 - (i % 2 ? 0.2 : 0.29)], i % 2 ? TRIM_L : TRIM, undefined, 0.03);
    }
    // Stained lancets on the two upper storeys (the ground floor is left blank behind the champion
    // that stands before it).
    for (const y of [6.1, 10.1]) lancet(k, g, 0, y, D1, 0.82, 2.5, true, true);
    // Corbels, the parapet standing out on them, its coping, merlons, and the leads behind.
    for (let i = 0; i < 5; i++) cb(k, g, [0.34, 0.42, 0.5], [-W / 2 + 0.4 + (i * (W - 0.8)) / 4, H - 0.24, D1 + 0.14], TRIM, undefined, 0.03);
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) cb(k, g, [0.5, 0.42, 0.34], [sx * (W / 2 + 0.14), H - 0.24, D0 + 0.8 + i * 0.9], TRIM, undefined, 0.03);
    cb(k, g, [W + 0.6, 0.85, d + 0.4], [0, H + 0.42, zc + 0.2], ASHLAR_B, undefined, 0.04);
    cb(k, g, [W + 0.7, 0.14, d + 0.5], [0, H + 0.9, zc + 0.2], TRIM, undefined, 0.03);
    k.box(g, [W - 0.4, 0.06, d - 0.4], [0, H + 0.98, zc], DECK);
    for (let i = 0; i < 3; i++) cb(k, g, [0.78, 0.72, 0.5], [-W / 2 + 0.55 + i * ((W - 1.1) / 2), H + 1.33, D1 + 0.15], i === 1 ? ASHLAR_L : ASHLAR_B, undefined, 0.04);
    for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) cb(k, g, [0.5, 0.72, 0.72], [sx * (W / 2 + 0.05), H + 1.33, D0 + 0.6 + i * 1.5], ASHLAR_B, undefined, 0.04);
  },
  /**
   * A gate through a stretch of full-height curtain (the ward's gates in the inner curtain), the
   * passage `len` wide under a pointed arch of dressed voussoirs with a hood mould on both faces, the
   * oak leaves folded back inside, a lantern either side of the arch on both faces and a raised,
   * crenellated head over the gate with the lord's crest on its inner (+Z) face.
   */
  ward_gate: (k, g, arg) => gateway(k, g, lenOf(arg) ?? 4, { head: true, door: true, lanterns: [-1, 1] }),
  /**
   * The postern: a narrow gate `len` wide through a stretch of full-height curtain under a pointed
   * arch of pale dressed stone on both faces, the oak door set back in the passage, three steps out
   * onto the belvedere and a lantern either side of the arch on both faces.
   */
  postern: (k, g, arg) => gateway(k, g, lenOf(arg) ?? 2, { door: true, steps: true, lanterns: [-1, 1] }),
  /**
   * The outer gate across the ledge road at the head of the climb (built along local X, outer face
   * toward -Z, like the curtain): the passage `len` wide under a pointed arch with a crenellated head
   * (the lord's crest on its inner face, his banner over the arch outside), the portcullis raised in
   * the arch, lanterns either side on both faces, a corbelled round bartizan with a slate spire on
   * each outer corner, a gilt frieze under the head, its north wing (`v` long, toward -X) running on to
   * the curtain's face and its south end seated on a battered footing down over the cliff's lip.
   */
  outer_gate: (k, g, arg) => {
    const P = lenOf(arg) ?? 4.6, wing = Math.max(0, vOf(arg)), L = P + 2.4, T = 2.2, H = 7;
    gateway(k, g, P, { head: true, lanterns: [-1, 1] });
    // The raised portcullis in the arch head.
    const S = 3.0, rise = 1.9, { arc } = pointedArch(P, S + rise, 8, rise);
    const archY = (x: number) => {
      for (let i = 0; i < arc.length - 1; i++) if (Math.abs(x) <= arc[i][0] && Math.abs(x) >= arc[i + 1][0]) {
        const t = (arc[i][0] - Math.abs(x)) / (arc[i][0] - arc[i + 1][0] || 1);
        return arc[i][1] + (arc[i + 1][1] - arc[i][1]) * t;
      }
      return S;
    };
    const pz = -T / 2 + 0.45;
    for (let x = -P / 2 + 0.35; x < P / 2 - 0.2; x += 0.42) {
      const top = archY(x) - 0.05;
      if (top < 3.9) continue;
      k.box(g, [0.1, top - 3.7, 0.1], [x, (top + 3.7) / 2, pz], IRON);
      k.mesh(g, taper(0.1, 0.1, 0.01, 0.01, 0.25), IRON, [x, 3.58, pz], [Math.PI, 0, 0]);
    }
    k.box(g, [P - 0.8, 0.09, 0.12], [0, 4.1, pz], IRON);
    // The gilt frieze under the head, and the lord's banner hanging from it over the arch, outside.
    frieze(k, g, L + 0.4, 0, H - 0.05, -T / 2 - 0.2);
    {
      const out = new THREE.Group();
      out.position.set(0, 0, -T / 2 - 0.3);
      out.rotation.y = Math.PI;
      g.add(out);
      livery(k, out, 0, H + 1.2, 0, 1.3, 1.05);
    }
    // The north wing on to the curtain: the curtain's own stone, plinth, string course, merlons.
    if (wing > 0.1) {
      const x = -L / 2 - wing / 2;
      cb(k, g, [wing + 0.1, 0.8, T + 0.5], [x, 0.4, 0], TRIM_D, undefined, 0.05);
      cb(k, g, [wing + 0.1, H - 0.8, T], [x, 0.8 + (H - 0.8) / 2, 0], ASHLAR, undefined, 0.04);
      cb(k, g, [wing + 0.1, 0.2, T + 0.16], [x, 3.6, 0], TRIM, undefined, 0.03);
      cb(k, g, [wing + 0.1, 0.75, 0.6], [x, H + 0.37, -T / 2 + 0.3], ASHLAR, undefined, 0.03);
      cb(k, g, [wing + 0.1, 0.12, 0.72], [x, H + 0.78, -T / 2 + 0.3], TRIM, undefined, 0.02);
      cb(k, g, [0.72, 0.6, 0.6], [x, H + 1.05, -T / 2 + 0.3], ASHLAR, undefined, 0.05);
    }
    // The south end's footing: a battered blue-grey base running down into the rock below the lip.
    cb(k, g, [1.8, 6, T + 0.9], [L / 2 - 0.6, -3, 0], TRIM_D, undefined, 0.05);
    cb(k, g, [2.2, 0.3, T + 1.1], [L / 2 - 0.6, 0.1, 0], TRIM, undefined, 0.03);
    // A bartizan on each outer corner: a round turret carried on a cone of corbelling, a slate spire.
    for (const sx of [-1, 1]) {
      const bx = sx * (L / 2 - 0.25), bz = -T / 2 - 0.15, r = 0.8, y0 = H - 1.0;
      k.cyl(g, r, 0.15, 1.1, [bx, y0 - 0.55, bz], TRIM, undefined, 12);
      k.cyl(g, r, r, 2.2, [bx, y0 + 1.1, bz], ASHLAR, undefined, 12);
      k.cyl(g, r + 0.06, r + 0.06, 0.16, [bx, y0 + 0.6, bz], TRIM, undefined, 12);
      k.box(g, [0.12, 0.6, 0.08], [bx + sx * 0.35, y0 + 1.2, bz - r + 0.12], DARK, [0, sx * -0.4, 0]);
      spire(k, g, bx, y0 + 2.2, bz, r + 0.12, 2.4, 12, sx);
    }
  },
  /**
   * A square stair turret against a wall's inner face (its back at -Z set into the wall, `len` wide):
   * a battered blue-grey base, cream ashlar rising past the wall walk with the curtain's bands round
   * it, slit windows climbing with the stair, an arched door in the lord's blue on its front, a
   * corbelled crenellated top and an octagonal blue-slate spire with a pennant.
   */
  stair_turret: (k, g, arg) => {
    const W = lenOf(arg) ?? 3.4, D = 4.4, H = 10.4, zf = D / 2;
    cb(k, g, [W + 0.5, 1.1, D + 0.3], [0, 0.55, 0.15], TRIM_D, undefined, 0.05);
    cb(k, g, [W, H - 1.1, D], [0, 1.1 + (H - 1.1) / 2, 0], ASHLAR, undefined, 0.04);
    for (const y of [3.6, 5.6, 7.0]) cb(k, g, [W + 0.18, y === 5.6 ? 0.22 : 0.3, D + 0.1], [0, y, 0.05], TRIM, undefined, 0.02);
    // The door: a pointed arch in pale dressed stone round a blue boarded leaf with gilt studs.
    const dw = 1.3, dh = 2.6;
    k.mesh(g, archPane(dw, dh, 0.08), HERALD_BLUE, [0, 1.1, zf + 0.02]);
    for (let i = 1; i < 4; i++) k.box(g, [0.04, 1.5, 0.04], [-dw / 2 + (i * dw) / 4, 1.85, zf + 0.07], HERALD_BLUE_D);
    for (const y of [1.6, 2.4]) k.box(g, [dw - 0.2, 0.06, 0.05], [0, y, zf + 0.08], GILT);
    archRing(k, g, 0, 1.1, zf - 0.04, dw, dh, ASHLAR_L, { n: 4, t: 0.26, p: 0.18, out: 0, key: ASHLAR_L });
    for (let i = 0; i < 2; i++) cb(k, g, [dw + 0.8 - i * 0.3, 0.18, 0.5], [0, 0.95 + i * 0.16 - 0.1, zf + 0.3 - i * 0.12], i ? ASHLAR_L : ASHLAR_W, undefined, 0.02);
    // Slits climbing round it with the stair.
    for (const [x, y, z, a] of [[-0.6, 4.5, zf + 0.01, 0], [W / 2 + 0.01, 6.3, 0.6, Math.PI / 2], [0.6, 8.1, zf + 0.01, 0], [-W / 2 - 0.01, 8.8, 0.4, -Math.PI / 2]] as number[][]) k.box(g, [0.14, 0.9, 0.1], [x, y, z], DARK, [0, a, 0]);
    // The top: corbels, a parapet with its coping and merlons, the spire inside.
    for (const [sx, sz] of [[0, 1], [1, 0], [-1, 0]]) for (let i = 0; i < 4; i++) {
      const t = -1 + (i + 0.5) / 2;
      cb(k, g, [sz ? 0.32 : 0.42, 0.42, sz ? 0.42 : 0.32], [sx * (W / 2 + 0.1) + (sz ? t * (W / 2 - 0.3) : 0), H - 0.22, sz * (zf + 0.1) + (sx ? t * (D / 2 - 0.3) : 0)], TRIM, undefined, 0.03);
    }
    cb(k, g, [W + 0.5, 0.9, D + 0.5], [0, H + 0.45, 0], ASHLAR, undefined, 0.04);
    cb(k, g, [W + 0.6, 0.14, D + 0.6], [0, H + 0.95, 0], TRIM, undefined, 0.03);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1]]) cb(k, g, [0.7, 0.66, 0.7], [x * (W / 2 - 0.1), H + 1.35, z * (D / 2 - 0.1)], ASHLAR, undefined, 0.04);
    spire(k, g, 0, H + 1.0, 0, W / 2 - 0.25, 3.6, 8, 1, 1.2);
  },
  /**
   * A shallow arched niche against a wall (its back at -Z): dressed jambs and a pointed head standing
   * proud of the wall, the recess panel behind, a paved pad before it for a seat.
   */
  wall_niche: (k, g) => {
    const W = 2.4, H = 3.3;
    cb(k, g, [W + 1.2, 0.08, 1.6], [0, 0.04, 0.55], ASHLAR_L, undefined, 0.02);
    // A garden door into the wing, sunk deep in its arch: a slate reveal, the lord's blue leaves with
    // gold strapwork and rings, the pointed head over them filled with a blue tympanum.
    k.mesh(g, archPane(W, H, 0.1), TRIM_D, [0, 0.08, -0.36]);
    k.mesh(g, archPane(W - 0.1, H - 0.08, 0.06), HERALD_BLUE_D, [0, 0.1, -0.28]);
    for (const sx of [-1, 1]) {
      const leaf = new THREE.Group();
      leaf.position.set(sx * (W / 2 - 0.05), 0.1, -0.2);
      leaf.rotation.y = sx > 0 ? Math.PI : 0;
      g.add(leaf);
      royalLeaf(k, leaf, W / 2 - 0.06, pointedArch(W, H).ys + 0.05);
    }
    for (const sx of [-1, 1]) k.mesh(g, new THREE.TorusGeometry(0.09, 0.025, 4, 10), PAL.gold, [sx * 0.22, 1.2, -0.1]);
    for (const sx of [-1, 1]) cb(k, g, [0.3, H - 0.6, 0.5], [sx * (W / 2 + 0.02), (H - 0.6) / 2 + 0.08, -0.15], TRIM_D, undefined, 0.02);
    for (const sx of [-1, 1]) cb(k, g, [0.42, H - 0.95, 0.5], [sx * (W / 2 + 0.21), (H - 0.95) / 2 + 0.08, 0.1], ASHLAR_L, undefined, 0.03);
    archRing(k, g, 0, 0.08, -0.15, W, H, ASHLAR_L, { n: 4, t: 0.42, p: 0.5, out: 0, key: ASHLAR_L });
    archRing(k, g, 0, 0.08, 0.05, W + 0.95, H + 0.5, TRIM, { n: 4, t: 0.14, p: 0.34, out: 0 });
    cb(k, g, [W + 1.0, 0.2, 0.62], [0, 0.18, 0.12], TRIM, undefined, 0.03);
  },
  /**
   * The paddock's field shelter `len` wide (open to +Z, its back to -Z): a stone lean-to under a flat stone roof
   * behind a low crenellated parapet, like the stable range; three open bays between stone piers, a
   * hay rack along the back wall, straw on the floor.
   */
  field_shelter: (k, g, arg) => {
    const W = lenOf(arg) ?? 6.8, D = 2.6, H = 3.0;
    cb(k, g, [W, H, 0.5], [0, H / 2, -D / 2 + 0.25], ASHLAR, undefined, 0.04);
    for (const sx of [-1, 1]) cb(k, g, [0.5, H, D], [sx * (W / 2 - 0.25), H / 2, 0], ASHLAR, undefined, 0.04);
    for (const sx of [-1, 1]) cb(k, g, [0.5, H, 0.5], [sx * 1.15, H / 2, D / 2 - 0.25], ASHLAR, undefined, 0.04);
    cb(k, g, [W + 0.3, 0.34, D + 0.3], [0, H + 0.12, 0.05], TRIM, undefined, 0.03);
    cb(k, g, [W + 0.4, 0.5, 0.36], [0, H + 0.5, D / 2 + 0.05], ASHLAR, undefined, 0.03);
    for (const sx of [-1, 1]) cb(k, g, [0.36, 0.5, D + 0.3], [sx * (W / 2 + 0.02), H + 0.5, 0.05], ASHLAR, undefined, 0.03);
    for (let i = 0; i < 6; i++) cb(k, g, [0.6, 0.5, 0.4], [-W / 2 + 0.3 + (i * (W - 0.6)) / 5, H + 1.0, D / 2 + 0.05], ASHLAR, undefined, 0.04);
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
   * timber gate stands open, swung in toward +Z.
   */
  gate_piers: (k, g) => {
    for (const sx of [-1, 1]) {
      cb(k, g, [0.7, 0.2, 0.7], [sx * 1.25, 0.1, 0], STONE_D, undefined, 0.03);
      cb(k, g, [0.56, 1.5, 0.56], [sx * 1.25, 0.95, 0], STONE_L, undefined, 0.04);
      cb(k, g, [0.7, 0.14, 0.7], [sx * 1.25, 1.75, 0], STONE, undefined, 0.03);
      ball(k, g, 0.24, [sx * 1.25, 2.02, 0], STONE_L);
    }
    const leaf = new THREE.Group();
    // Swung right back, flat against the fence's inner side.
    leaf.position.set(-0.95, 0, 0.14);
    leaf.rotation.y = Math.PI;
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
    for (let i = 0; i < 9; i++) {
      const x = -W / 2 + 0.15 + (i * (W - 0.3)) / 8, z = (hash01(i, 3) - 0.5) * (D + 0.2);
      ball(k, g, 0.42 + hash01(i, 5) * 0.12, [x, top(x) + 0.2, z], LEAF[i % 3], [1.2, 0.7, 1.1]);
    }
    for (const sx of [-1, 1]) for (const z of [-D / 2, D / 2]) for (let j = 0; j < 3; j++) ball(k, g, 0.24, [sx * (W / 2 + 0.06), 0.5 + j * 0.62, z + 0.05], LEAF[j % 3], [1, 1.4, 1]);
    for (let i = 0; i < 26; i++) {
      const x = (hash01(i, 1) - 0.5) * (W + 0.2), z = (hash01(i, 2) - 0.5) * (D + 0.5);
      const c = ROSE[i % 3];
      for (let j = 0; j < 3; j++) k.gem(g, 0.075, [x + (j - 1) * 0.08, top(x) + 0.42 + hash01(i, j) * 0.14, z + ((j * 7) % 3 - 1) * 0.06], c);
    }
    for (const sx of [-1, 1]) for (let j = 0; j < 5; j++) k.gem(g, 0.08, [sx * (W / 2 + 0.2), 0.6 + j * 0.42, D / 2 + 0.12 - (j % 2) * 0.24], ROSE[(j + (sx > 0 ? 1 : 0)) % 3]);
    // The lantern under the middle arch, warm.
    cb(k, g, [0.03, 0.4, 0.03], [0, top(0) - 0.25, 0], IRON, undefined, 0.01);
    cb(k, g, [0.24, 0.3, 0.24], [0, top(0) - 0.6, 0], IRON, undefined, 0.02);
    k.box(g, [0.17, 0.22, 0.17], [0, top(0) - 0.6, 0], 0xffd080, undefined, 0xffb040, 2.2);
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
   * Where a stream spills off the island's edge (flowing toward +Z): the water curls over the lip in a
   * widening sheet and falls away into the Veil, fading as it drops, mist drifting up off it.
   */
  edge_fall: (k, g) => {
    const time = { value: 0 };
    const pts = pour(new THREE.Vector3(0, -0.25, -0.6), new THREE.Vector3(0, -18, 4.5), 0.05, 30);
    const { geo, len } = crossedRibbons(pts, 2.2, 4.2);
    const fall = new THREE.Mesh(geo, fallingWaterMaterial(time, 83, len, 4.2, true));
    fall.name = 'waterfall';
    fall.renderOrder = 2;
    g.add(fall);
    for (const sx of [-1, 1]) chunk(k, g, 970 + sx, [0.9, 0.5, 0.8], [sx * 1.5, -0.35, -0.2], 0x6a5e52, sx);
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
          sp.position.set(Math.sin(i * 2.3) * 1.2, -3 - i * 2.2 + p * 2.5, 1.2 + i * 0.5);
          sp.scale.setScalar(2.5 + p * 3);
          sp.material.opacity = 0.32 * Math.sin(p * Math.PI);
        });
      },
    };
  },
  /** A low clipped box hedge along local X, `len` long, 0.5 high and 0.5 thick (parterre edging). */
  box_hedge: (k, g, arg) => {
    const L = Math.max(0.6, arg ?? 3);
    cb(k, g, [L, 0.42, 0.5], [0, 0.21, 0], 0x3e6a2e, undefined, 0.08);
    cb(k, g, [L - 0.06, 0.1, 0.42], [0, 0.46, 0], 0x4a7a34, undefined, 0.05);
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
      cb(k, g, [1.62, 0.12, 1.62], [0, 0.58, 0], TRIM, undefined, 0.03);
      k.box(g, [1.25, 0.05, 1.25], [0, 0.6, 0], 0x3a2a1e);
    }
    k.mesh(g, taper(0.3, 0.3, 0.18, 0.18, 2.3), WOOD_D, [0, y0 + 1.15, 0]);
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
      const a = hash01(i, 21) * Math.PI * 2, r = potted ? 0.25 + hash01(i, 22) * 0.35 : 0.5 + hash01(i, 22) * 1.2;
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
    cb(k, g, [1.0, 0.18, 1.0], [0, 0.09, 0], STONE_D, undefined, 0.03);
    cb(k, g, [0.78, 0.7, 0.78], [0, 0.53, 0], STONE_L, undefined, 0.04);
    cb(k, g, [0.92, 0.12, 0.92], [0, 0.94, 0], STONE, undefined, 0.03);
    k.mesh(g, taper(0.32, 0.32, 0.5, 0.5, 0.18), STONE, [0, 1.09, 0]);
    k.mesh(g, taper(0.5, 0.5, 1.0, 1.0, 0.62), STONE_L, [0, 1.49, 0]);
    cb(k, g, [1.08, 0.12, 1.08], [0, 1.84, 0], STONE, undefined, 0.03);
    chunk(k, g, 841, [1.0, 0.5, 1.0], [0, 2.02, 0], 0x4a7a34, 0.4);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, r = i % 2 ? 0.42 : 0.3;
      cb(k, g, [0.16, 0.14, 0.16], [Math.sin(a) * r, 2.18 + (i % 3) * 0.05, Math.cos(a) * r], [0xd8486a, 0xf4ece0, 0xe86aa8][i % 3], [0, a, 0], 0.04);
    }
    for (const a of [0.4, 2.0, 3.6, 5.1]) chunk(k, g, 850 + a, [0.3, 0.42, 0.2], [Math.sin(a) * 0.56, 1.66, Math.cos(a) * 0.56], 0x56883c, a);
  },
  /**
   * The great door's two oak leaves, studded and iron-banded, standing open inward from the jambs
   * of an opening `len` wide (hinged at its edges, the prop on the wall's inner face).
   */
  great_doors: (k, g, arg) => {
    const W = lenOf(arg) ?? 4, hw = W / 2 - 0.12, H = 3.7, a = 1.15;
    for (const sx of [-1, 1]) {
      const leaf = new THREE.Group();
      leaf.position.set(sx * (W / 2 - 0.1), 0, 0);
      leaf.rotation.y = sx < 0 ? a : Math.PI - a;
      g.add(leaf);
      cb(k, leaf, [hw, H, 0.14], [hw / 2, H / 2, 0], WOOD_D, undefined, 0.02);
      for (let i = 0; i < 4; i++) cb(k, leaf, [0.04, H - 0.1, 0.16], [0.2 + i * (hw - 0.3) / 3, H / 2, 0], 0x3a2618, undefined, 0.005);
      // Gilt strap hinges and studs, and a gilt ring.
      for (const y of [0.5, 1.8, 3.1]) k.box(leaf, [hw - 0.1, 0.12, 0.18], [hw / 2, y, 0], PAL.gold);
      for (const y of [0.5, 1.8, 3.1]) for (let i = 0; i < 4; i++) k.box(leaf, [0.07, 0.07, 0.22], [0.25 + i * (hw - 0.4) / 3, y, 0], PAL.gold);
      k.mesh(leaf, octagon(0.14, 0.04), PAL.gold, [hw - 0.3, 1.6, 0.1], [0, Math.PI / 2, 0]);
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
  /** The archers' shooting line: a raised oak sill along local X, `len` long, on stubby posts. */
  shooting_line: (k, g, arg) => {
    const L = lenOf(arg) ?? 8;
    cb(k, g, [L, 0.2, 0.3], [0, 0.1, 0], WOOD_D, undefined, 0.02);
    cb(k, g, [L + 0.06, 0.06, 0.36], [0, 0.22, 0], WOOD_L, undefined, 0.01);
    for (let u = -L / 2 + 0.3; u < L / 2; u += 1.5) cb(k, g, [0.14, 0.32, 0.14], [u, 0.16, 0], WOOD_D, undefined, 0.02);
  },
  /**
   * A horse (facing +Z), standing, or grazing with its head down when `len` is 1; `v` its coat. A
   * rounded barrel of a body between a deep chest and the rump, slim legs with their joints and dark
   * hooves, an arched neck under a mane, a long head with its ears pricked, a full tail.
   */
  horse: (k, g, arg) => {
    const graze = lenOf(arg) === 1, coat = [0x8a5430, 0x4a3024, 0xb8aea2][vOf(arg) % 3], dark = 0x231812;
    const shade = new THREE.Color(coat).multiplyScalar(0.82).getHex();
    round(k, g, [0, 1.3, -0.62], [0, 1.32, 0.62], 0.4, 0.42, coat, 0.82);
    ball(k, g, 0.43, [0, 1.36, 0.66], coat, [0.86, 1.0, 1.0]);
    ball(k, g, 0.44, [0, 1.38, -0.66], coat, [0.9, 0.95, 1.0]);
    for (const sx of [-1, 1]) {
      // Shoulder and haunch masses, then the legs: forearm and cannon in front, gaskin and cannon
      // behind (the hock bending back), a dark hoof under each.
      ball(k, g, 0.24, [sx * 0.2, 1.18, 0.62], shade, [0.8, 1.2, 1]);
      ball(k, g, 0.28, [sx * 0.2, 1.22, -0.62], shade, [0.8, 1.15, 1]);
      round(k, g, [sx * 0.2, 1.05, 0.66], [sx * 0.19, 0.55, 0.7], 0.11, 0.075, coat);
      round(k, g, [sx * 0.19, 0.55, 0.7], [sx * 0.19, 0.12, 0.68], 0.06, 0.055, coat);
      round(k, g, [sx * 0.21, 1.1, -0.66], [sx * 0.2, 0.6, -0.8], 0.13, 0.08, coat);
      round(k, g, [sx * 0.2, 0.6, -0.8], [sx * 0.19, 0.12, -0.7], 0.065, 0.055, coat);
      for (const z of [0.69, -0.7]) cb(k, g, [0.13, 0.12, 0.17], [sx * 0.19, 0.06, z + 0.02], dark, undefined, 0.03);
    }
    const neck0: V3 = [0, 1.55, 0.78], neck1: V3 = graze ? [0, 0.9, 1.32] : [0, 2.05, 1.12], head1: V3 = graze ? [0, 0.22, 1.48] : [0, 1.66, 1.62];
    round(k, g, neck0, neck1, 0.27, 0.17, coat, 0.7);
    ball(k, g, 0.18, neck1, coat, [0.75, 1, 1]);
    round(k, g, neck1, head1, 0.15, 0.09, coat, 0.75);
    ball(k, g, 0.1, head1, shade, [0.9, 0.8, 1.1]);
    // The mane along the neck's crest, the forelock, ears, eyes and nostrils.
    const along = (t: number): V3 => [0, neck0[1] + (neck1[1] - neck0[1]) * t + 0.2, neck0[2] + (neck1[2] - neck0[2]) * t - 0.12];
    for (let i = 0; i < 5; i++) cb(k, g, [0.08, 0.2, 0.18], along(i / 4), dark, [Math.atan2(neck1[2] - neck0[2], neck1[1] - neck0[1]), 0, 0], 0.03);
    for (const sx of [-1, 1]) {
      k.mesh(g, prism(0.06, 0.18, 0.4), coat, [sx * 0.07, neck1[1] + 0.2, neck1[2] - 0.02], [graze ? 0.6 : -0.2, 0, sx * 0.15]);
      k.box(g, [0.04, 0.05, 0.05], [sx * 0.1, neck1[1] + (head1[1] - neck1[1]) * 0.22, neck1[2] + (head1[2] - neck1[2]) * 0.22], dark);
      k.box(g, [0.03, 0.03, 0.03], [sx * 0.05, head1[1] + (graze ? 0.02 : -0.02), head1[2] + 0.08], dark);
    }
    // The tail falling from the rump.
    round(k, g, [0, 1.48, -1.02], [0, 0.95, -1.18], 0.09, 0.12, dark, 0.7);
    round(k, g, [0, 0.95, -1.18], [0, 0.55, -1.12], 0.12, 0.05, dark, 0.7);
  },
  /**
   * The spring's fall (`len` above the pool, its back to -Z against the castle rock): the water
   * breaks out of a mossy cleft in a shoulder of rock partway down the face, ferns and moss round its
   * lip and the rock dark and wet below it, falls onto a ledge where it splashes, and drops again in
   * a wider, fraying sheet into the pool, churning foam that spreads in rings, mist rising off it.
   */
  spring_fall: (k, g, arg) => {
    const Y = lenOf(arg) ?? 10, time = { value: 0 };
    const ROCK = 0x857f80, ROCK_D = 0x6a6468, WET = 0x4a464c, MOSS = 0x4e7034, FERN = [0x3e6e2e, 0x4a7a34, 0x5a8a3c];
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
    for (const sx of [-1, 1]) for (const y of [0.4, ledge + 0.5, cY - 0.6]) chunk(k, g, 970 + Math.round(y * 10) + sx, [0.5, 0.18, 0.4], [sx * 1.15, y, -0.85], MOSS, y);
    // The cleft: an irregular V-shaped fissure under overlapping lips of rock, darkening inward (wet
    // rock, then deep shadow at its back, no straight edge anywhere); the water spills over a rounded
    // mossy lip, ferns hanging over its edges.
    for (const sx of [-1, 1]) {
      chunk(k, g, 950 + sx, [0.9, 1.5, 1.0], [sx * 0.62, cY - 0.25, -0.95], ROCK, sx * 0.55);
      chunk(k, g, 952 + sx, [0.7, 0.9, 0.8], [sx * 0.35, cY + 0.75, -1.0], ROCK_D, -sx * 0.4);
    }
    chunk(k, g, 954, [0.7, 1.0, 0.5], [0, cY + 0.05, -1.35], 0x2e2a2e, 0.2);
    chunk(k, g, 955, [0.4, 0.7, 0.4], [0.05, cY + 0.15, -1.55], 0x1c1a1e, -0.3);
    chunk(k, g, 956, [1.1, 1.0, 0.9], [0, cY + 1.05, -0.95], ROCK, 0.35);
    chunk(k, g, 939, [1.0, 0.36, 0.9], [0, cY - 0.25, -0.85], MOSS, 0.1);
    for (const [x, y, z, r] of [[-0.85, cY + 1.05, -0.5, 0.32], [0.8, cY + 1.15, -0.52, 0.28], [-0.95, cY + 0.25, -0.4, 0.26], [0.95, cY + 0.15, -0.45, 0.3], [-0.25, cY + 1.45, -0.6, 0.24], [0.35, cY + 1.4, -0.55, 0.22]] as number[][]) {
      ball(k, g, r, [x, y, z], FERN[Math.floor(hash01(x, y) * 3)], [1.4, 0.7, 1.0]);
      for (let i = 0; i < 3; i++) limb(k, g, [x, y, z], [x + (i - 1) * 0.25, y - 0.45 - hash01(i, x) * 0.3, z + 0.18], [0.12, 0.03, 0.02, 0.01], FERN[(i + 1) % 3]);
    }
    for (const [x, y] of [[-1.3, cY + 1.6], [1.25, cY + 1.8], [0, Y - 0.9], [-1.6, Y - 1.0], [1.5, Y - 0.95]]) chunk(k, g, 940 + Math.round(x * 10), [0.9, 0.2, 0.7], [x, y, -0.9], MOSS, x);
    // The ledge the first fall lands on: a chunky shelf of the cliff's own rock run across between the
    // shoulders (joined to the face on both sides), wet and dark on top, the water sheeting off its lip.
    chunk(k, g, 945, [3.3, ledge + 0.3, 1.6], [0, -0.3, -0.55], ROCK_D, 0.05);
    chunk(k, g, 946, [2.6, 0.55, 1.3], [0, ledge - 0.45, -0.05], WET, 0.12);
    for (const sx of [-1, 1]) chunk(k, g, 947 + sx, [1.0, ledge + 0.6, 1.4], [sx * 1.35, -0.3, -0.25], ROCK, sx * 0.4);
    // The two drops: a narrow spout off the cleft's lip, then the wide sheet off the ledge, with a
    // fainter fraying veil either side of it that breaks up as it falls.
    const sheets: [THREE.Vector3[], number, number, number][] = [
      [pour(new THREE.Vector3(0, cY - 0.05, -0.55), new THREE.Vector3(0, ledge + 0.05, 0.25), 0.25, 18), 0.55, 1.0, 71],
      [pour(new THREE.Vector3(0, ledge + 0.02, 0.55), new THREE.Vector3(0, -0.2, 1.25), 0.12, 22), 1.2, 2.3, 72],
      [pour(new THREE.Vector3(-0.35, ledge, 0.5), new THREE.Vector3(-0.7, -0.2, 1.3), 0.1, 18), 0.4, 1.4, 73],
      [pour(new THREE.Vector3(0.4, ledge, 0.5), new THREE.Vector3(0.75, -0.2, 1.25), 0.1, 18), 0.4, 1.3, 74],
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
    const foamAt: [V3, number, number][] = [[[0, -0.22, 1.25], 0.95, 12], [[0.1, -0.215, 1.6], 0.7, 8], [[0, ledge + 0.08, 0.3], 0.45, 6]];
    foamAt.forEach(([at, r, n], i) => {
      const f = new THREE.Mesh(brokenFoam(80 + i, r, n, 0.8), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
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
      ring.position.set(0, -0.21 + i * 0.002, 1.25);
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
          r.position.z = 1.25 + p * 0.6;
          (r.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - p) * (1 - p) * Math.min(1, p * 5);
        });
        // A low mist hugging the rock off the foot (big, slow, faint), and a thin fan of spray off
        // the ledge's lip.
        mist.forEach((sp, i) => {
          const foot = i < 5, p = (t * (foot ? 0.25 : 0.6) + i / mist.length) % 1;
          sp.position.set(Math.sin(i * 2.3) * (foot ? 0.8 : 0.35 * (1 + p)), (foot ? -0.1 : ledge - 0.1) + p * (foot ? 1.8 : 0.5), (foot ? 1.0 : 0.5 + p * 0.4) + Math.cos(i * 2.3) * 0.3);
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
    cb(k, g, [2.0, 0.45, 2.0], [0, 0.225, 0], TRIM_D, undefined, 0.06);
    cb(k, g, [1.6, 0.9, 1.6], [0, 0.9, 0], ASHLAR, undefined, 0.06);
    cb(k, g, [0.9, 0.4, 0.05], [0, 0.9, 0.81], ASHLAR_L, undefined, 0.02);
    k.box(g, [0.24, 0.24, 0.04], [0, 0.9, 0.84], PAL.gold, [0, 0, Math.PI / 4]);
    cb(k, g, [1.75, 0.14, 1.75], [0, 1.42, 0], TRIM, undefined, 0.03);
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
    // The cloak hanging down the back from the shoulders.
    k.mesh(g, taper(1.0, 0.1, 0.82, 0.1, 1.9), SD, [0, y + 1.12, -0.3], [-0.06, 0, 0]);
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
    // The helm: great helm with a visor slit and a crest.
    cb(k, g, [0.2, 0.14, 0.2], [0, y + 2.24, 0], SD, undefined, 0.03);
    cb(k, g, [0.38, 0.44, 0.42], [0, y + 2.5, 0.01], S, undefined, 0.1);
    k.box(g, [0.28, 0.05, 0.03], [0, y + 2.56, 0.22], 0x2e2c28);
    k.box(g, [0.04, 0.16, 0.03], [0, y + 2.44, 0.22], 0x2e2c28);
    cb(k, g, [0.07, 0.24, 0.46], [0, y + 2.78, -0.02], SL, undefined, 0.03);
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
  /** A kitchen-garden bed: dark soil in rows of cabbages and leeks. */
  veg_patch: (k, g) => {
    cb(k, g, [3.2, 0.2, 1.8], [0, 0.1, 0], 0x4a3624, undefined, 0.06);
    for (let r = 0; r < 3; r++) for (let i = 0; i < 5; i++) {
      const x = -1.2 + i * 0.6, z = -0.55 + r * 0.55;
      if (r === 1) cb(k, g, [0.08, 0.36, 0.08], [x, 0.36, z], 0x6a9a3a, [0, 0, (hash01(i, r) - 0.5) * 0.4], 0.01);
      else chunk(k, g, 300 + r * 5 + i, [0.34, 0.24, 0.32], [x, 0.16, z], hash01(i, r, 1) > 0.5 ? 0x5a8a3a : 0x6a9a44, i);
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
      k.mesh(g, prism(0.12, 0.35, 0.6), IRON_L, [x - tilt * 1.9, 1.85, 0.12 - 0.47], [0.25, 0, tilt]);
    }
    cb(k, g, [0.07, 1.2, 0.07], [0.2, 0.6, 0.28], WOOD, [0.3, 0, 0.05], 0.01);
    cb(k, g, [0.36, 0.3, 0.05], [0.28, 1.05, 0.12], IRON, [0.3, 0, 0.05], 0.02);
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
export function mergeStatic(root: THREE.Object3D) {
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
      const merged = mergeGeometries(meshes.map((m) => {
        m.updateMatrix();
        let geo = m.geometry.clone().applyMatrix4(m.matrix);
        for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
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
 * Finish a kit-built prop: merge static meshes, give materials their look (shiny metal, glossy
 * coal, painted albedo) and set shadow flags.
 */
export function finishProp(g: THREE.Object3D, kits: ModelKit[]) {
  mergeStatic(g);
  for (const m of kits.flatMap((k) => k.mats)) {
    // Iron and gold fittings shine; coal and obsidian are glossy; grey masonry gets a gentle
    // stone detail (lined up in world space); everything else stays clean flat colour.
    const hex = m.color.getHex();
    if (METALS.has(hex)) applyFinish(m, 'metal');
    else if (BRONZES.has(hex)) {
      // Cast bronze: a soft metallic sheen over its own colour, darkened in the hollows by the paint.
      applyPaint(m, 'soft', 'object');
      Object.assign(m, { metalness: 0.9, roughness: 0.26, envMap: studioEnv(), envMapIntensity: 1.7 });
      m.needsUpdate = true;
    } else if (PATINA.has(hex)) {
      // Verdigris on bronze: the green crust, a little of the metal's sheen still showing through.
      applyPaint(m, 'soft', 'object');
      Object.assign(m, { metalness: 0.45, roughness: 0.45, envMap: studioEnv(), envMapIntensity: 1.0 });
      m.needsUpdate = true;
    }
    else if (hex === PUDDLE) {
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
    if (o instanceof THREE.Mesh) {
      const fx = o.material instanceof THREE.ShaderMaterial;
      o.castShadow = !fx && !(o.material as THREE.Material).userData.decal;
      o.receiveShadow = !fx;
    }
  });
}

/** Big walls that should dissolve around the hero when they stand between them and the camera. */
export const OCCLUDING_PROPS = new Set(['castle_wall', 'round_tower', 'corner_tower', 'outer_gate', 'stair_turret', 'outer_gatehouse', 'postern', 'ward_gate', 'wall_flight', 'donjon', 'pavilion', 'forge_canopy', 'dragon_fountain', 'great_doors', 'pergola', 'garden_tree', 'wall_climber', 'tower_flag']);

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
