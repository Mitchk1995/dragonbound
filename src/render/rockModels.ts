import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { shareResource } from './resources';

/**
 * The rock kit (tools/blender/rocks.py): boulders, stones, slabs, rock masses, cliff modules and the ore rocks, each a
 * Blender-made model (public/models/rock_<name>.glb: one closed piece, its `bake` UVs on TEXCOORD_0) with its baked
 * map beside it (rock_<name>.bake.webp: normal, painted value and a moss or vein mask; rockMaterial.ts paints from
 * it). The rocks the worlds draw load before the game starts (preloadRocks); a world built without them (a test that
 * never loaded them, or a kit that would not load) keeps the old block rocks.
 */
export const ROCK_KIT = {
  boulder: ['boulder_a', 'boulder_b', 'boulder_c', 'boulder_d', 'boulder_e', 'boulder_f'],
  stone: ['stone_a', 'stone_b', 'stone_c'],
  slab: ['slab_a', 'slab_b', 'slab_c'],
  mass: ['mass_low_a', 'mass_low_b', 'mass_a', 'mass_b', 'mass_c', 'mass_d', 'mass_e', 'spire_a'],
  cliff: ['cliff_straight', 'cliff_tall', 'cliff_corner_out', 'cliff_corner_in', 'cliff_cap'],
  ore: ['ore_copper', 'ore_tin', 'ore_iron', 'ore_coal', 'ore_emberite'],
} as const;

export type RockClass = keyof typeof ROCK_KIT;
export type RockName = (typeof ROCK_KIT)[RockClass][number];
export const ROCK_NAMES = Object.values(ROCK_KIT).flat() as RockName[];
/** The rocks the worlds draw today: all but the cliff modules. */
export const WORLD_ROCKS = ROCK_NAMES.filter((n) => !n.startsWith('cliff_'));

const geos = new Map<RockName, THREE.BufferGeometry>();
const bakes = new Map<RockName, THREE.Texture>();

/** Register a parsed rock model: its meshes flattened into one geometry in the model's own space (Y up, origin at its foot). */
export function registerRockScene(name: RockName, scene: THREE.Object3D) {
  scene.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) parts.push(o.geometry.clone().applyMatrix4(o.matrixWorld));
  });
  if (parts.length !== 1) throw new Error(`rock_${name}: ${parts.length} meshes (a rock is one piece)`);
  const geo = parts[0];
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  geos.set(name, shareResource(geo));
}

/** A rock's geometry, or null before the kit has loaded. */
export const rockGeometry = (name: RockName) => geos.get(name) ?? null;

/** Whether the rocks the worlds draw have loaded (worlds built before them use the old block rocks). */
export const rockKitReady = () => WORLD_ROCKS.every((n) => geos.has(n));

/** A flat, unshaded stand-in for a baked map that has not loaded (or a world built headless). */
let neutral: THREE.DataTexture | null = null;
function neutralBake() {
  if (neutral) return neutral;
  // (Normal straight out, painted value 1 at its stored scale, no moss or vein: bake.py's empty texel.)
  neutral = shareResource(new THREE.DataTexture(new Uint8Array([128, 128, 204, 128]), 1, 1));
  neutral.magFilter = THREE.LinearFilter;
  neutral.minFilter = THREE.LinearMipmapLinearFilter;
  neutral.generateMipmaps = true;
  neutral.colorSpace = THREE.NoColorSpace;
  neutral.needsUpdate = true;
  return neutral;
}

/** A rock's baked map (the stand-in until it has loaded). */
export const rockBake = (name: RockName) => bakes.get(name) ?? neutralBake();

/** The painted layers rocks are laid in (tools/rock_textures.py): value and relief, tiling, filled in by preloadRocks. */
export const LAYER_SIZE = { rock: 512, moss: 256 } as const;
const layers = {} as Record<keyof typeof LAYER_SIZE, THREE.DataTexture>;
export function rockLayer(kind: keyof typeof LAYER_SIZE) {
  let tex = layers[kind];
  if (tex) return tex;
  const n = LAYER_SIZE[kind];
  tex = new THREE.DataTexture(new Uint8Array(n * n * 4).fill(128), n, n);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.NoColorSpace;
  tex.name = `rock-layer-${kind}`;
  tex.needsUpdate = true;
  layers[kind] = shareResource(tex);
  return tex;
}

async function loadLayer(kind: keyof typeof LAYER_SIZE) {
  const tex = rockLayer(kind), n = LAYER_SIZE[kind];
  const img = new Image();
  img.src = `./textures/rock/${kind}.png`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, n, n);
  (tex.image.data as Uint8Array).set(ctx.getImageData(0, 0, n, n).data);
  tex.needsUpdate = true;
}

async function loadBake(name: RockName) {
  const loader = new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const bitmap = await loader.loadAsync(`./models/rock_${name}.bake.webp`);
  const tex = new THREE.Texture(bitmap as unknown as HTMLImageElement);
  tex.flipY = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.name = `rock-bake-${name}`;
  tex.needsUpdate = true;
  bakes.set(name, shareResource(tex));
}

/**
 * Load rocks (those not loaded already): each one's model and baked map. Returns how many parts would not load (each
 * with a warning).
 */
export async function loadRocks(names: readonly RockName[]) {
  const gltf = new GLTFLoader();
  const todo = names.filter((name) => !geos.has(name) || !bakes.has(name));
  const tasks = todo.flatMap((name) => [gltf.loadAsync(`./models/rock_${name}.glb`).then((g) => registerRockScene(name, g.scene)), loadBake(name)]);
  const failed = (await Promise.allSettled(tasks)).filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  for (const f of failed) console.warn('[rocks] a part of the rock kit did not load:', f.reason);
  return failed.length;
}

/**
 * Load what the worlds draw before the game starts: the painted layers and every rock but the cliff modules (kept for
 * the later areas that build heights from them; loadRocks fetches them when wanted). If any part will not load, the
 * whole kit stands down and the worlds keep the old block rocks, never a half-painted kit.
 */
export async function preloadRocks() {
  const [layerResults, rocksFailed] = await Promise.all([Promise.allSettled([loadLayer('rock'), loadLayer('moss')]), loadRocks(WORLD_ROCKS)]);
  const layersFailed = layerResults.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  for (const f of layersFailed) console.warn('[rocks] a rock layer did not load:', f.reason);
  if (layersFailed.length + rocksFailed) geos.clear();
}
