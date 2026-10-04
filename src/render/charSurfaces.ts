import * as THREE from 'three';
import { uniformArray } from 'three/tsl';
import type { Palette } from '../data/items';
import { shareResource } from './resources';
import type { CharPaintKind } from './surface';

/**
 * The characters' painted materials (the bake finish, charBake.ts): a library of sourced, tileable painted materials
 * (public/textures/characters/<layer>.png, made by tools/char_textures.py from Codex paintings, the mail from rings
 * modelled and baked in Blender) and the recipe each kind of surface is painted with. A layer carries the material's
 * painted value round its mean (R) and its relief's normal (G, B); the part's own colour (its role colour: a dyed
 * tunic, a tier's metal, a skin tone) gives the hue. All layers sit in one texture array, sampled on the model's
 * `tile` UVs (metres, upright on every piece, tools/blender/bake.py).
 */
export const LAYERS = ['skin', 'wool', 'linen', 'leather', 'padded', 'plate', 'gold', 'wood', 'hair', 'goblin', 'mail'] as const;
export type Layer = (typeof LAYERS)[number];
export const LAYER_SIZE = 256;

/**
 * How a kind of surface is painted:
 * - `layer`: its painted material, `tile`: metres one repeat of it covers;
 * - `detail`: how far the layer's painted value swings the colour (1 = as painted), `relief`: its normal's strength;
 * - `wear`: how much paint convex edges lose where the bake finds them (the high-poly's rounded edges), `lift`: how
 *   much lighter a worn edge turns (bare metal, scuffed leather, faded cloth);
 * - `ao`: how deep the baked occlusion paints into the colour (the shade in creases and under belts);
 * - `rough`: roughness added, `warm`: warm lights and cool darks across the painted value (a painter's light).
 */
export interface Surface {
  layer: Layer;
  tile: number;
  detail: number;
  relief: number;
  wear: number;
  lift: number;
  ao: number;
  rough: number;
  warm: number;
}

export const SURFACES = {
  skin: { layer: 'skin', tile: 0.7, detail: 0.6, relief: 0.25, wear: 0, lift: 0, ao: 0.55, rough: 0.05, warm: 0.12 },
  wool: { layer: 'wool', tile: 0.24, detail: 0.35, relief: 0.45, wear: 0.35, lift: 0.1, ao: 0.7, rough: 0.12, warm: 0.06 },
  linen: { layer: 'linen', tile: 0.3, detail: 0.5, relief: 0.5, wear: 0.3, lift: 0.1, ao: 0.7, rough: 0.12, warm: 0.05 },
  leather: { layer: 'leather', tile: 0.55, detail: 0.8, relief: 0.55, wear: 0.75, lift: 0.22, ao: 0.75, rough: 0, warm: 0.1 },
  padded: { layer: 'padded', tile: 0.45, detail: 0.8, relief: 0.7, wear: 0.3, lift: 0.08, ao: 0.8, rough: 0.1, warm: 0.04 },
  plate: { layer: 'plate', tile: 0.7, detail: 0.45, relief: 0.14, wear: 0.9, lift: 0.3, ao: 0.6, rough: 0, warm: 0.06 },
  darkPlate: { layer: 'plate', tile: 0.7, detail: 0.55, relief: 0.14, wear: 0.8, lift: 0.4, ao: 0.6, rough: 0.05, warm: 0.05 },
  gold: { layer: 'gold', tile: 0.4, detail: 0.6, relief: 0.35, wear: 0.7, lift: 0.25, ao: 0.6, rough: 0, warm: 0.1 },
  mail: { layer: 'mail', tile: 0.2, detail: 0.65, relief: 0.7, wear: 0.4, lift: 0.18, ao: 0.6, rough: 0.05, warm: 0.04 },
  wood: { layer: 'wood', tile: 0.5, detail: 0.8, relief: 0.45, wear: 0.5, lift: 0.15, ao: 0.7, rough: 0.05, warm: 0.1 },
  hair: { layer: 'hair', tile: 0.42, detail: 0.85, relief: 0.6, wear: 0, lift: 0, ao: 0.7, rough: 0.05, warm: 0.12 },
  goblin: { layer: 'goblin', tile: 0.75, detail: 0.3, relief: 0.2, wear: 0, lift: 0, ao: 0.7, rough: 0.05, warm: 0.1 },
  bone: { layer: 'skin', tile: 0.5, detail: 0.6, relief: 0.2, wear: 0.4, lift: 0.1, ao: 0.6, rough: 0, warm: 0.1 },
  // Eyes, mouths and glowing parts: the part's own colour, with only the bake's light and shade.
  plain: { layer: 'skin', tile: 1, detail: 0, relief: 0, wear: 0, lift: 0, ao: 0.4, rough: 0, warm: 0 },
} satisfies Record<string, Surface>;

export type SurfaceKind = keyof typeof SURFACES;
export const SURFACE_KINDS = Object.keys(SURFACES) as SurfaceKind[];
export const kindIndex = (k: SurfaceKind) => SURFACE_KINDS.indexOf(k);

/** The recipes as three vec4 rows per kind, for the shader (charBake.ts): one table shared by every program. */
const rows = SURFACE_KINDS.map((k) => {
  const s: Surface = SURFACES[k];
  return [
    new THREE.Vector4(LAYERS.indexOf(s.layer), 1 / s.tile, s.detail, s.relief),
    new THREE.Vector4(s.wear, s.lift, s.ao, s.rough),
    new THREE.Vector4(s.warm, 0, 0, 0),
  ];
});
export const SURFACE_TABLE = [0, 1, 2].map((r) => uniformArray(rows.map((row) => row[r]), 'vec4'));

// ─── Which surface a part gets ──────────────────────────────────────────────

/** Role materials as the hero and NPCs wear them (gear learns its palette's in gearSurface). */
const ROLE_SURFACE: Record<string, SurfaceKind> = {
  skin: 'skin', hair: 'hair', cloth: 'wool', clothDark: 'wool', cloth2: 'linen', leather: 'leather',
  metal: 'plate', trim: 'gold', dark: 'padded', glow: 'plain',
};
export const roleSurface = (role: string): SurfaceKind => ROLE_SURFACE[role] ?? 'plain';

/**
 * A gear piece's role parts by its palette: forged tiers are plate (the mail shirt's are mail), with polished trim
 * and blackened dark parts; bows and staves are wood; leather armour is leather over a padded underlayer.
 */
export function gearSurface(model: string, role: string, palette: Palette): SurfaceKind {
  if (!['metal', 'trim', 'dark'].includes(role)) return roleSurface(role);
  if (palette.metal) {
    if (role === 'trim') return 'gold';
    if (role === 'dark') return 'darkPlate';
    return model === 'body_chain' ? 'mail' : 'plate';
  }
  if (/bow|staff|emberstring|kindled/.test(model)) return role === 'trim' ? 'gold' : 'wood';
  return role === 'dark' ? 'padded' : 'leather';
}

/** A fixed-colour part's surface, from the painted kind its colour suggests (registry.ts fixedPaint). */
const PAINT_SURFACE: Partial<Record<CharPaintKind, SurfaceKind>> = {
  metal: 'plate', trim: 'gold', darkMetal: 'darkPlate', leather: 'leather', cloth: 'wool', skin: 'skin', hair: 'hair',
  hide: 'goblin', soft: 'bone', wood: 'wood', bone: 'bone', wyrmbone: 'bone',
};
export const paintSurface = (k: CharPaintKind | null): SurfaceKind => (k && PAINT_SURFACE[k]) || 'plain';

/** A material's own kind, named in its Blender script (`_common.mat(kind=)`, exported as the glTF extra `db_kind`). */
export function namedSurface(m: THREE.Material): SurfaceKind | null {
  const k = m.userData.db_kind as string | undefined;
  return k && k in SURFACES ? (k as SurfaceKind) : null;
}

// ─── The library texture ────────────────────────────────────────────────────

let library: THREE.DataArrayTexture | null = null;

/** The painted layers in one texture array (neutral until loadSurfaceLibrary fills it). */
export function surfaceLibrary(): THREE.DataArrayTexture {
  if (library) return library;
  const n = LAYER_SIZE * LAYER_SIZE;
  const data = new Uint8Array(n * 4 * LAYERS.length);
  for (let i = 0; i < n * LAYERS.length; i++) data.set([128, 128, 128, 255], i * 4);
  const tex = new THREE.DataArrayTexture(data, LAYER_SIZE, LAYER_SIZE, LAYERS.length);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.NoColorSpace;
  tex.name = 'charSurfaces';
  tex.needsUpdate = true;
  library = shareResource(tex);
  return tex;
}

/** Fill the library from its files (the browser's loader; tests and tools keep the neutral layers). */
export async function loadSurfaceLibrary(base = './textures/characters/') {
  const tex = surfaceLibrary();
  const data = tex.image.data as Uint8Array;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = LAYER_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  await Promise.all(LAYERS.map(async (name, i) => {
    const img = new Image();
    img.src = `${base}${name}.png`;
    try {
      await img.decode();
    } catch {
      console.warn(`[charSurfaces] ${name}.png did not load; its surfaces are painted plain`);
      return;
    }
    // (One canvas, so draw and read each layer in turn.)
    ctx.clearRect(0, 0, LAYER_SIZE, LAYER_SIZE);
    ctx.drawImage(img, 0, 0, LAYER_SIZE, LAYER_SIZE);
    data.set(ctx.getImageData(0, 0, LAYER_SIZE, LAYER_SIZE).data, i * LAYER_SIZE * LAYER_SIZE * 4);
  }));
  tex.needsUpdate = true;
}
