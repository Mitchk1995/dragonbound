import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ModelKit, PAL, type V3 } from '../render/kit';
import { hasModel, makeModel } from '../render/registry';
import { applyFinish, studioEnv } from '../render/env';
import { applyPaint, type PaintKind } from '../render/paint';
import { chamferBox, hash01, octagon, prism, rockBlock, taper, wedge } from '../render/blocks';
import { makePortal, type PortalSpec } from './portalFx';

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
export const BRICK = 0x9a5a42, BRICK_L = 0xa8664a, BRICK_D = 0x7e4836;
export const WOOD = PAL.wood, WOOD_D = 0x4a3020, WOOD_L = 0x8a6440;
export const SLATE = 0x4e5564, PLASTER = 0xd6cab0, DARK = 0x1c1612;
export const IRON = 0x4a4a52, IRON_L = 0x6e7280;
const BONE = 0xcbbd9c, BONE_D = 0xa8997a;
export const COAL = 0x161517, OBSIDIAN = 0x1a1418;
/** Basalt (lair): cooled black rock with slightly lighter weathered tops. */
const BASALT = 0x2e2626, BASALT_L = 0x453a36, BASALT_D = 0x201a1a;
/** Standing water on a cave floor: dark and glossy (reflects like coal and obsidian). */
const PUDDLE = 0x1a3238;
const METALS = new Set([IRON, IRON_L, PAL.gold]);
const GLOSSY = new Set([COAL, OBSIDIAN]);
/** Cut blocks built as geometry (walls of the tower, forge bricks): painted as chiselled rock, no mortar. */
export const BLOCKS = [0x8b8579, 0x979187, 0x6f6960];

/** Plot markers and restored buildings: each profession's colour. */
export const PLOT_MARK: Record<string, number> = { vault_expanded: PAL.gold, alchemy_lab: 0x5ad07a, rune_altar: 0x6aa8ff, hatchery: 0xffa050 };

/** Painted albedo per prop colour (explicit where known; judged by hue otherwise). */
const PAINT_OF = new Map<number, PaintKind>();
const paintAs = (kind: PaintKind, cols: number[]) => cols.forEach((c) => PAINT_OF.set(c, kind));
paintAs('masonry', [STONE, STONE_L, STONE_D, STONE_DD, 0x7e776c, 0x7a7870, 0x6a6860, 0x6e6a66]);
paintAs('rock', [...BLOCKS, BASALT, BASALT_L, BASALT_D, 0x3a2e24, 0x241e1a, 0x1a1311, 0x0f0b0a, 0x2a1d17, BRICK, BRICK_L, BRICK_D, 0x4a4240, 0x3e3634, 0x554c48, 0x3a3230, 0x3a3232, 0x2a2424, 0x6a6258, 0x6e6a66, 0x3c3834, 0x2e2624, 0x7a7068, 0x6a6058, 0x4a4440, 0x6a5a40, 0x5a4a34, 0x2e2828, 0x241e1e, 0x1e1818]);
paintAs('wood', [WOOD, WOOD_D, WOOD_L, 0x7a5636, 0x94704a, 0x5a3a22, 0x3a2618, 0x5a3a20, 0x4a2e18, 0x8a6a44, 0x5a4a3a, 0x3a2a1e, 0xa08058]);
paintAs('shingle', [SLATE, 0x3e4450, 0x4a6a48, 0x4a4a78, 0x9a5438, 0x3e6a6a, 0x7a4a34]);
paintAs('soft', [0x4b3122]);
paintAs('bone', [BONE, BONE_D, PAL.bone]);
paintAs('plaster', [PLASTER, 0xe8dcc0, 0xc8b070]);
paintAs('hide', [0x8a6a48, 0x6e5238, 0x7a5a3a, 0x5a4230, 0x8a4a34, 0x6a3a2a, 0x8a2424, 0x8a2a1e, 0x7a2020, 0x6a2020, 0xa03030, PAL.leather]);

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
  return k.mesh(p, rockBlock(seed, size[0], size[1], size[2]), color, pos, [0, rotY, 0], em, int);
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
  return {
    obj: g,
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

const BUILDERS: Record<string, Builder> = {
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
    k.box(g, [0.3, 0.3, 0.04], [0, 1.3, 0.26], 0xa03030);
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
    for (const [y, a, dir] of [[1.95, 0.08, 1], [1.5, 0.5, -1]] as [number, number, number][]) {
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
  curtain: (k, g, arg) => {
    // A curtain wall along X: battered plinth, a string course, arrow slits outside (+Z), a
    // walkway and merlons on both faces.
    const L = arg ?? 10, T = 1.8, H = 4.2;
    cb(k, g, [L, 0.5, T + 0.36], [0, 0.25, 0], STONE_DD, undefined, 0.06);
    cb(k, g, [L, H - 0.5, T], [0, 0.5 + (H - 0.5) / 2, 0], STONE, undefined, 0.04);
    cb(k, g, [L, 0.2, T + 0.14], [0, 2.1, 0], STONE_D, undefined, 0.03);
    cb(k, g, [L, 0.3, T + 0.34], [0, H, 0], STONE_D, undefined, 0.05);
    k.box(g, [L, 0.06, T - 0.6], [0, H + 0.18, 0], 0x5e5850);
    for (let u = -L / 2 + 0.55; u < L / 2 - 0.3; u += 1.25) for (const e of [-1, 1]) cb(k, g, [0.72, 0.7, 0.42], [u, H + 0.5, e * (T / 2 - 0.02)], hash01(u, e) > 0.7 ? STONE_L : STONE, undefined, 0.05);
    for (let u = -L / 2 + 1.8; u < L / 2 - 1; u += 3.6) k.box(g, [0.16, 0.95, 0.1], [u, 3.0, T / 2 + 0.01], DARK);
  },
  wall_tower: (k, g) => {
    // A square wall tower: battered body, banded courses, corbelled parapet with merlons around a
    // slate spire, lit slits and a pennant.
    const S = 5.4, H = 7.4;
    cb(k, g, [S + 0.9, 0.6, S + 0.9], [0, 0.3, 0], STONE_DD, undefined, 0.08);
    k.mesh(g, taper(S + 0.4, S + 0.4, S, S, H - 0.6), STONE, [0, 0.6 + (H - 0.6) / 2, 0]);
    for (const y of [2.6, 5.0]) cb(k, g, [S + 0.14, 0.18, S + 0.14], [0, y, 0], STONE_D, undefined, 0.03);
    cb(k, g, [S + 0.7, 0.45, S + 0.7], [0, H + 0.2, 0], STONE_D, undefined, 0.06);
    for (let i = 0; i < 4; i++) for (let j = -2; j <= 2; j++) {
      if (Math.abs(j) === 2 && i % 2) continue;
      const a = (i * Math.PI) / 2, r = S / 2 + 0.12, t = j * 1.3;
      cb(k, g, [0.72, 0.72, 0.5], [Math.sin(a) * r + Math.cos(a) * t, H + 0.78, Math.cos(a) * r - Math.sin(a) * t], STONE_L, [0, a, 0], 0.05);
    }
    k.mesh(g, taper(S - 1.0, S - 1.0, 0.001, 0.001, 3.6), SLATE, [0, H + 0.42 + 1.8, 0]);
    cb(k, g, [0.1, 1.6, 0.1], [0, H + 4.6, 0], IRON, undefined, 0.02);
    cb(k, g, [0.9, 0.5, 0.04], [0.47, H + 5.1, 0], 0x7a2020, undefined, 0.01);
    for (const y of [3.6, 6.0]) k.box(g, [0.26, 0.9, 0.1], [0, y, S / 2 + 0.02], 0xffc870, undefined, 0xffa040, 1.3);
  },
  gatehouse: (k, g, arg) => {
    // The inner keep's gatehouse: two square towers and a vaulted passage (arg = passage width)
    // under a raised portcullis, with banners toward the courtyard approach (+Z).
    const P = arg ?? 4, TW = 3.4, D = 4.0, H = 6.8;
    for (const sx of [-1, 1]) {
      const x = sx * (P / 2 + TW / 2);
      cb(k, g, [TW + 0.5, 0.5, D + 0.5], [x, 0.25, 0], STONE_DD, undefined, 0.06);
      cb(k, g, [TW, H - 0.5, D], [x, 0.5 + (H - 0.5) / 2, 0], STONE, undefined, 0.05);
      for (const y of [2.4, 4.6]) cb(k, g, [TW + 0.12, 0.18, D + 0.12], [x, y, 0], STONE_D, undefined, 0.03);
      cb(k, g, [TW + 0.4, 0.4, D + 0.4], [x, H, 0], STONE_D, undefined, 0.05);
      for (const [mx, mz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1], [0, -1]]) cb(k, g, [0.72, 0.72, 0.5], [x + mx * (TW / 2 - 0.2), H + 0.55, mz * (D / 2 - 0.1)], STONE_L, undefined, 0.05);
      k.box(g, [0.26, 0.9, 0.1], [x, 4.4, D / 2 + 0.02], 0xffc870, undefined, 0xffa040, 1.3);
      // Banner on the approach face.
      cb(k, g, [1.3, 2.2, 0.06], [x, 2.9, D / 2 + 0.06], 0x7a2020, undefined, 0.01);
      k.box(g, [0.5, 0.5, 0.04], [x, 3.1, D / 2 + 0.1], 0xd8b060, [0, 0, Math.PI / 4]);
      cb(k, g, [1.5, 0.12, 0.12], [x, 4.05, D / 2 + 0.1], WOOD_D, undefined, 0.02);
    }
    // Vault over the passage: voussoir band and keystone on both faces, walkway merlons above.
    cb(k, g, [P + 0.2, H - 4.2, D - 0.2], [0, 4.2 + (H - 4.2) / 2, 0], STONE, undefined, 0.04);
    for (const e of [-1, 1]) {
      cb(k, g, [P + 0.5, 0.5, 0.3], [0, 4.35, e * (D / 2 - 0.05)], STONE_L, undefined, 0.04);
      k.mesh(g, taper(0.5, 0.34, 0.8, 0.34, 0.8), STONE_L, [0, 4.55, e * (D / 2)]);
      for (let u = -P / 2 + 0.4; u < P / 2; u += 1.3) cb(k, g, [0.72, 0.7, 0.45], [u, H + 0.35, e * (D / 2 - 0.25)], STONE_L, undefined, 0.05);
    }
    // Portcullis teeth showing under the arch.
    for (let x = -P / 2 + 0.3; x < P / 2; x += 0.5) {
      k.box(g, [0.1, 0.7, 0.1], [x, 3.85, 0.9], IRON);
      k.mesh(g, taper(0.1, 0.1, 0.01, 0.01, 0.2), IRON, [x, 3.4, 0.9], [Math.PI, 0, 0]);
    }
    k.box(g, [P, 0.12, 0.12], [0, 3.9, 0.9], IRON);
    k.box(g, [P - 0.1, 0.04, D], [0, 0.02, 0], STONE_D);
  },
  wall_stair: (k, g, arg) => {
    // A masonry stair up to the curtain's wall walk, built against the wall's inner face (on its
    // +Z side), climbing toward +X (arg = -1 climbs toward -X). Solid stepped courses, the top
    // step level with the walk.
    const dir = arg === -1 ? -1 : 1, L = 6.6, H = 4.3, n = 12, t = L / n, D = 1.3;
    for (let i = 0; i < n; i++) {
      const y = ((i + 1) * H) / n, x = dir * (-L / 2 + (i + 0.5) * t);
      cb(k, g, [t + 0.01, y, D], [x, y / 2, 0.05], i % 2 ? STONE : STONE_L, undefined, 0.02);
      cb(k, g, [t + 0.03, 0.08, D + 0.04], [x, y - 0.03, 0.05], STONE_D, undefined, 0.02);
    }
    cb(k, g, [L + 0.2, 0.3, D + 0.2], [0, 0.15, 0.05], STONE_DD, undefined, 0.04);
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
    cb(k, g, [0.44, 0.3, 0.44], [0, 0.15, 0], STONE_D, undefined, 0.05);
    cb(k, g, [0.14, 2.4, 0.14], [0, 1.4, 0], IRON, undefined, 0.02);
    cb(k, g, [0.4, 0.44, 0.4], [0, 2.7, 0], IRON, undefined, 0.04);
    k.box(g, [0.3, 0.32, 0.3], [0, 2.7, 0], 0xffd080, undefined, 0xffb040, 2.5);
    k.mesh(g, taper(0.5, 0.5, 0.12, 0.12, 0.2), IRON, [0, 3.02, 0]);
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
    cb(k, g, [0.44, 0.3, 0.44], [0, 0.15, 0], STONE_D, undefined, 0.05);
    cb(k, g, [0.14, 2.4, 0.14], [0, 1.4, 0], IRON, undefined, 0.02);
    cb(k, g, [0.4, 0.44, 0.4], [0, 2.7, 0], IRON, undefined, 0.04);
    k.box(g, [0.3, 0.32, 0.3], [0, 2.7, 0], 0xffd080, undefined, 0xffb040, 2.5);
    k.mesh(g, taper(0.5, 0.5, 0.12, 0.12, 0.2), IRON, [0, 3.02, 0]);
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
    // The Great Anvil on a stone footing with a quench trough. Before 'Reforge the Great Anvil' it
    // is a cracked, rust-streaked block split clean across the face, its horn snapped off and
    // lying in the soot, the stump bound with rope. Reforged, it stands on a new iron-banded
    // stump with a bright steel face, gold inlay round the waist, an ember rune on its flank and a
    // glowing bar across the face, the hammer laid ready.
    const a = new THREE.Group();
    a.scale.setScalar(1.3);
    g.add(a);
    const cracked = new THREE.Group(), reforged = new THREE.Group();
    a.add(cracked, reforged);
    reforged.visible = false;
    cb(k, a, [1.7, 0.12, 1.4], [0.35, 0.06, 0], STONE_D, undefined, 0.04);
    // Quench trough (both states).
    cb(k, a, [0.7, 0.5, 1.1], [1.35, 0.37, 0.05], WOOD, undefined, 0.04);
    for (const z of [-0.35, 0.45]) k.box(a, [0.74, 0.06, 0.06], [1.35, 0.52, z], IRON);
    k.box(a, [0.56, 0.04, 0.96], [1.35, 0.61, 0.05], 0x24505c);
    const RUST = 0x7a4a2a, SOOT = 0x2a2420;
    // ── Cracked ──
    cb(k, cracked, [0.9, 0.62, 0.9], [0, 0.43, 0], 0x4a3020, [0, 0.1, 0], 0.2);
    for (const y of [0.3, 0.62]) cb(k, cracked, [0.93, 0.08, 0.93], [0, y, 0], 0x8a7050, [0, 0.1, 0], 0.2);
    k.mesh(cracked, taper(0.8, 0.52, 0.42, 0.3, 0.18), IRON, [0, 0.83, 0]);
    cb(k, cracked, [0.32, 0.22, 0.26], [0, 1.03, 0], IRON, undefined, 0.03);
    // The face split in two, the halves sagging apart round a dark crack.
    cb(k, cracked, [0.46, 0.24, 0.42], [-0.3, 1.25, 0], IRON, [0, 0, 0.07], 0.04);
    cb(k, cracked, [0.44, 0.24, 0.42], [0.2, 1.24, 0.01], IRON, [0, 0.04, -0.08], 0.04);
    k.box(cracked, [0.07, 0.26, 0.44], [-0.04, 1.2, 0], SOOT, [0, 0, 0.1]);
    k.mesh(cracked, taper(0.36, 0.3, 0.2, 0.2, 0.2), IRON, [0.5, 1.22, 0], [0, 0, -Math.PI / 2]);
    k.mesh(cracked, taper(0.2, 0.2, 0.04, 0.06, 0.34), IRON, [0.5, 0.2, 0.55], [0.1, 0.8, -Math.PI / 2 + 0.3]);
    cb(k, cracked, [0.22, 0.14, 0.34], [-0.6, 1.2, 0], IRON, undefined, 0.03);
    // Rust streaks and soot.
    // (Long thin streaks run down from the crack, off-centre: square patches read as a face.)
    for (const [x, y, z, sx, sy] of [[0.06, 1.12, 0.215, 0.05, 0.3], [-0.46, 1.17, 0.215, 0.07, 0.2], [0.34, 1.19, 0.215, 0.05, 0.14], [-0.2, 1.15, -0.215, 0.06, 0.26]] as [number, number, number, number, number][]) k.box(cracked, [sx, sy, 0.02], [x, y, z], RUST);
    k.box(cracked, [0.5, 0.02, 0.36], [-0.28, 1.375, 0], RUST, [0, 0, 0.07]);
    decal(k.mesh(cracked, raggedDisc(88, 12, 0.7, 0.95, 0.3), 0x3a3430, [0.1, 0.125, 0.1]));
    // Rope lashing round the stump.
    cb(k, cracked, [0.95, 0.06, 0.95], [0, 0.46, 0], 0xb09a70, [0, 0.4, 0.05], 0.2);
    cb(k, cracked, [0.06, 0.06, 0.55], [-0.05, 0.16, 0.8], WOOD, [0, 1.2, 0], 0.01);
    cb(k, cracked, [0.14, 0.12, 0.22], [0.12, 0.16, 0.62], RUST, [0, 1.2, 0], 0.02);
    // ── Reforged ──
    cb(k, reforged, [0.95, 0.62, 0.95], [0, 0.43, 0], WOOD_D, undefined, 0.2);
    for (const y of [0.24, 0.44, 0.66]) cb(k, reforged, [0.99, 0.07, 0.99], [0, y, 0], IRON, undefined, 0.2);
    for (const [x, z] of [[-0.5, 0], [0.5, 0], [0, 0.5], [0, -0.5]]) k.box(reforged, [0.07, 0.07, 0.07], [x, 0.66, z], PAL.gold);
    k.mesh(reforged, taper(0.86, 0.56, 0.44, 0.32, 0.2), IRON, [0, 0.84, 0]);
    cb(k, reforged, [0.36, 0.22, 0.28], [0, 1.05, 0], IRON, undefined, 0.03);
    cb(k, reforged, [0.4, 0.05, 0.3], [0, 1.0, 0], PAL.gold, undefined, 0.01);
    cb(k, reforged, [1.0, 0.24, 0.44], [-0.05, 1.28, 0], IRON_L, undefined, 0.04);
    cb(k, reforged, [0.96, 0.04, 0.4], [-0.05, 1.41, 0], PAL.steel, undefined, 0.01);
    k.mesh(reforged, taper(0.38, 0.32, 0.04, 0.06, 0.6), IRON_L, [0.76, 1.26, 0], [0, 0, -Math.PI / 2]);
    cb(k, reforged, [0.24, 0.16, 0.36], [-0.64, 1.23, 0], IRON, undefined, 0.03);
    // An ember rune on the flank, facing the smith (+Z).
    k.mesh(reforged, octagon(0.09, 0.02), 0xffa040, [-0.05, 1.28, 0.225], [0, Math.PI / 2, 0], PAL.fire, 1.8);
    for (const e of [-1, 1]) k.box(reforged, [0.16, 0.025, 0.02], [-0.05 + e * 0.17, 1.28, 0.225], 0xffa040, undefined, PAL.fire, 1.4);
    // A bar at working heat across the face, the hammer beside it.
    cb(k, reforged, [0.6, 0.06, 0.1], [-0.12, 1.465, 0.06], 0xffb050, [0, 0.15, 0], 0.01, PAL.fire, 2.4);
    cb(k, reforged, [0.07, 0.07, 0.62], [0.3, 1.47, -0.12], WOOD_L, [0, -0.5, 0], 0.01);
    cb(k, reforged, [0.16, 0.14, 0.26], [0.42, 1.49, -0.34], IRON, [0, -0.5, 0], 0.02);
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
  /** A clipped box hedge along local X, `len` long, with leafy lumps on top. */
  hedge: (k, g, arg) => {
    const L = Math.max(1.2, arg ?? 4);
    cb(k, g, [L, 0.9, 0.9], [0, 0.45, 0], 0x3e6a2e, undefined, 0.12);
    for (let x = -L / 2 + 0.45; x < L / 2 - 0.2; x += 0.7) {
      const s = 0.5 + hash01(x, 3) * 0.2;
      cb(k, g, [s + 0.2, 0.3, 0.7], [x + (hash01(x, 1) - 0.5) * 0.2, 0.95, (hash01(x, 2) - 0.5) * 0.12], hash01(x, 4) > 0.5 ? 0x4a7a34 : 0x44722f, [0, hash01(x) * 0.6, 0], 0.12);
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
  /** A straw archery butt on an easel, rings facing +Z. */
  target: (k, g) => {
    for (const x of [-0.45, 0.45]) cb(k, g, [0.1, 1.6, 0.1], [x, 0.8, -0.2], WOOD_D, undefined, 0.02);
    cb(k, g, [0.1, 1.5, 0.1], [0, 0.7, -0.6], WOOD_D, [-0.4, 0, 0], 0.02);
    cb(k, g, [1.1, 0.08, 0.1], [0, 0.5, -0.2], WOOD_D, undefined, 0.01);
    k.mesh(g, octagon(0.62, 0.3), 0xc8a858, [0, 1.15, 0], [0, Math.PI / 2, 0]);
    ([[0.5, 0xe8dcc0], [0.36, 0xa03030], [0.2, 0xe8dcc0], [0.09, PAL.gold]] as [number, number][]).forEach(([r, c], i) => {
      k.mesh(g, octagon(r, 0.04), c, [0, 1.15, 0.17 + i * 0.03], [0, Math.PI / 2, 0]);
    });
    for (const [x, y] of [[0.12, 1.25], [-0.2, 1.05]]) cb(k, g, [0.03, 0.03, 0.5], [x, y, 0.45], WOOD_L, [0.1, 0.1, 0], 0.01);
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
    // The Emberforge: a stepped basalt hearth with corner horns; cold, or roaring once restored.
    const cold = new THREE.Group();
    const hot = new THREE.Group();
    g.add(cold, hot);
    cb(k, g, [2.2, 0.4, 2.2], [0, 0.2, 0], STONE_DD, undefined, 0.06);
    cb(k, g, [1.7, 0.5, 1.7], [0, 0.65, 0], 0x3a3232, undefined, 0.06);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.mesh(g, taper(0.34, 0.34, 0.06, 0.06, 0.9, -sx * 0.12, -sz * 0.12), 0x2a2424, [sx * 0.72, 1.3, sz * 0.72]);
    k.box(cold, [1.2, 0.08, 1.2], [0, 0.94, 0], 0x241e1c);
    k.mesh(cold, prism(0.4, 0.8, 0.35), 0x3a3030, [0, 0.9, 0], [0, 0.6, 0]);
    k.box(hot, [1.2, 0.08, 1.2], [0, 0.94, 0], 0x3a1206, undefined, PAL.fire, 0.7);
    k.mesh(hot, prism(0.42, 0.9, 0.35), PAL.fire, [0, 0.9, 0], [0, 0.6, 0], PAL.fire, 1.4);
    const f = flame(k, hot, 0, 1.0, 0, 1.2);
    return { obj: g, tick: f, setState: (s) => { cold.visible = s !== 'restored'; hot.visible = s === 'restored'; } };
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
    // A damp dark rim, the water inside it, a few stones at the edge.
    decal(k.mesh(g, raggedDisc(120 + (v ?? 0), 22, 1.18, 1.3, 0.25), 0x3a2e24, [0, 0.035, 0]));
    decal(k.mesh(g, raggedDisc(125 + (v ?? 0), 22, 0.95, 1.05, 0.25), PUDDLE, [0, 0.045, 0]));
    // A glint of lantern light on the surface.
    const glint = decal(k.mesh(g, raggedDisc(127, 10, 0.2, 0.24, 0.2), 0x2e4a52, [0.3, 0.05, -0.28], undefined, 0x2a4a52, 0.25));
    glint.scale.set(1.8, 1, 0.6);
    for (let i = 0; i < 3; i++) chunk(k, g, 130 + (v ?? 0) * 3 + i, [0.3, 0.14, 0.24], [Math.cos(i * 2.2) * 1.2, -0.03, Math.sin(i * 2.2) * 1.0], 0x5a4a3c, i);
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
    k.mesh(g, taper(0.6, 0.6, 0.3, 0.3, 0.16), IRON, [0, 0.08, 0]);
    cb(k, g, [0.16, 0.6, 0.16], [0, 0.46, 0], IRON, undefined, 0.02);
    k.mesh(g, taper(0.42, 0.42, 0.8, 0.8, 0.3), IRON, [0, 0.9, 0]);
    k.box(g, [0.66, 0.06, 0.66], [0, 1.03, 0], PAL.fire, undefined, PAL.fire, 1.8);
    const f = flame(k, g, 0, 0.95, 0, 0.8);
    const l = light(g, 0xff6a2a, 8, 8, 1.4);
    return { obj: g, light: l, tick: f };
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
export const OCCLUDING_PROPS = new Set(['curtain', 'wall_tower', 'gatehouse', 'wall_stair']);

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
