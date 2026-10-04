import * as THREE from 'three';
import type { TextureNode } from 'three/webgpu';
import { attribute, clamp, dFdx, dFdy, dot, float, int, length, log2, materialReference, max, min, mix, normalize, smoothstep, sqrt, step, TBNViewMatrix, texture, textureBicubicLevel, uv, vec2, vec3 } from 'three/tsl';
import { addPatch, type F, type V2, type V3, type V4 } from './patch';
import { kindIndex, SURFACE_TABLE, surfaceLibrary, type SurfaceKind } from './charSurfaces';
import { shareResource } from './resources';

/**
 * Models with the bake finish (tools/blender/bake.py: real UVs, weighted normals and a baked map) are painted from
 * their maps, the way hand-painted game characters are: the part's role colour, tinted by its painted material (the
 * library, charSurfaces.ts, on the `tile` UVs) and by the model's baked map (`<model>.bake.webp` on the `bake` UVs):
 * - the high-poly's normal (its rounded edges, baked-on stitching) under the material's own relief;
 * - its occlusion, painted into the colour (deeper in creases and under belts) and shading the ambient light;
 * - its convex edges, where the paint wears (lighter and, on metal, polished), broken up by the material's grain (metal
 *   has none: its edges are clean);
 * - its baked-on detail cover, drawn in thread colour (the leather's stitching).
 * One program for every baked model (the baked map is read off each material, not bound into its program). Both
 * normals are OpenGL convention (green up), as Blender bakes them and as the exported tangents frame them (checked on
 * the hero's lit bevels). Finished models are single-sided: the frame is not turned for back faces.
 */

/** A material painted from a baked map: the map is its own property (never `userData`, which clones copy as JSON). */
type BakedMaterial = THREE.MeshStandardMaterial & { charBake?: THREE.Texture };

/** The thread colour baked-on stitching is drawn in (linear). */
const THREAD = new THREE.Color(0xf0e2bc).convertSRGBToLinear();

/** The painted value is stored at this scale (tools/blender/bake.py VALUE_SCALE), so values up to 1.25 fit. */
export const VALUE_SCALE = 0.8;
/** The baked map's alpha with neither a worn edge (up to 1) nor baked-on detail (down to 0.5): bake.py EDGE_BASE. */
export const EDGE_BASE = 0.75;
const painted = (b: V4) => b.z.div(VALUE_SCALE);

/** A flat, unshaded stand-in until a model's baked map has loaded. */
let neutral: THREE.DataTexture | null = null;
function neutralBake() {
  if (neutral) return neutral;
  neutral = shareResource(new THREE.DataTexture(new Uint8Array([128, 128, 204, 191]), 1, 1));
  neutral.channel = 1;
  // (Filtered as the baked maps are: the programs built with this stand-in keep sampling the maps the same way.)
  neutral.magFilter = THREE.LinearFilter;
  neutral.minFilter = THREE.LinearMipmapLinearFilter;
  neutral.generateMipmaps = true;
  neutral.colorSpace = THREE.NoColorSpace;
  neutral.needsUpdate = true;
  return neutral;
}

const bakes = new Map<string, THREE.Texture>();
const pending = new Map<string, BakedMaterial[]>();
const loader = new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });

/**
 * A model's baked map, loading once; materials painted before it arrives take it when it does. Without a browser's
 * decoder (tests, tools) or when the map will not load, the model keeps the flat stand-in.
 */
function bakeFor(model: string, mat: BakedMaterial) {
  const hit = bakes.get(model);
  if (hit) return hit;
  if (typeof createImageBitmap === 'undefined') return neutralBake();
  const waiting = pending.get(model);
  if (waiting) {
    waiting.push(mat);
    return neutralBake();
  }
  pending.set(model, [mat]);
  loader.load(`./models/${model}.bake.webp`, (bitmap) => {
    const tex = shareResource(new THREE.Texture(bitmap));
    tex.channel = 1;
    tex.flipY = false;
    tex.colorSpace = THREE.NoColorSpace;
    tex.anisotropy = 8;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.needsUpdate = true;
    bakes.set(model, tex);
    for (const m of pending.get(model) ?? []) m.charBake = tex;
    pending.delete(model);
  }, undefined, () => {
    console.warn(`[charBake] ${model}.bake.webp did not load; the model is painted flat`);
    bakes.set(model, neutralBake());
    pending.delete(model);
  });
  return neutralBake();
}

/** Resolves once every baked map asked for so far has loaded (captures wait for it; the game lets a map pop in). */
export async function bakesSettled() {
  while (pending.size) await new Promise((r) => setTimeout(r, 16));
}

/**
 * The material's baked map on the bake UVs. Polished metal mirrors its sky, so it would show the map's texels: the
 * staircase of a bevel running across them, the speckle of the baked occlusion and edges. There the map is read
 * through a smooth (bicubic) filter at the texels' own size or larger; everything else reads it as baked.
 */
function bakedMap(polish: F): V4 {
  const ref = materialReference('charBake', 'texture') as unknown as { node: TextureNode | null };
  // (Its texture node given now, so the smooth read can sample the same map: the reference keeps it current.)
  const node = (ref.node = texture(neutralBake()) as unknown as TextureNode);
  const sharp = (ref as unknown as V4).toVar();
  const map = node.sample(uv(1));
  // How many texels one pixel spans (the mip level the hardware would pick), never finer than the map itself.
  const t = uv(1).mul(vec2(map.size(int(0)) as unknown as V2));
  const lod = max(log2(max(length(dFdx(t)), length(dFdy(t)))), 0).add(1);
  const smooth = textureBicubicLevel(map, lod) as unknown as V4;
  return mix(sharp, smooth, polish).toVar() as unknown as V4;
}

export interface SurfaceUniforms {
  uKind: { value: number };
  uSurfGain: { value: number };
}

/** True when a model's geometry carries the bake finish's UVs. */
export const isBaked = (geo: THREE.BufferGeometry) => !!geo.getAttribute('uv1');

/**
 * Paint a baked model's material: `kind` is its surface, or 'vertex' when its geometry carries a kind per vertex
 * (`aKind`: merged fixed-colour parts). `model` names the baked map (its .glb's name).
 */
export function applyCharSurface(mat: THREE.Material, kind: SurfaceKind | 'vertex', model: string) {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return;
  const per = kind === 'vertex';
  (mat as BakedMaterial).charBake = bakeFor(model, mat);
  const uniforms: SurfaceUniforms = { uKind: { value: per ? 0 : kindIndex(kind) }, uSurfGain: { value: 1 } };
  mat.userData.charSurface = uniforms;
  addPatch(mat, {
    key: `csurf:${per ? 'vertex' : 'uniform'}`,
    slot: 'surface',
    uniforms: { ...uniforms, uSurfLib: { value: surfaceLibrary() } } as unknown as Record<string, { value: unknown }>,
    nodes(u) {
      const k = (per ? (attribute('aKind', 'float') as F) : u.f('uKind')).add(0.5).toInt();
      const row = (i: number) => SURFACE_TABLE[i].element(k) as unknown as V4;
      const r0 = row(0), r1 = row(1), r2 = row(2);
      const gain = u.f('uSurfGain');
      // Polished metal has no layer (-1): no grain at all, and its baked map is read smoothly (bake()).
      const polish = float(1).sub(step(0, r0.x));
      // (Sampled once, by whichever hook the builder reaches first.)
      let libN: V4 | null = null, bakeN: V4 | null = null, grainN: F | null = null, wear: F = float(0);
      const lib = () => (libN ??= u.tex('uSurfLib').sample(uv(0).mul(r0.y)).depth(max(r0.x, 0).add(0.5).toInt()).toVar() as unknown as V4);
      const bake = () => (bakeN ??= bakedMap(polish));
      // The layer's painted value round its mean (none on polished metal).
      const grain = () => (grainN ??= lib().x.sub(0.5).mul(float(1).sub(polish)).toVar());
      return {
        color(c0) {
          const c = c0.toVar();
          const b = bake();
          // The painted value round the part's colour, warm in its lights and cool in its darks.
          const v = grain().mul(2).mul(r0.z).mul(gain).toVar();
          c.mulAssign(clamp(v.add(1), 0.3, 1.9));
          c.mulAssign(vec3(1).add(vec3(1, 0.35, -0.6).mul(v.mul(r2.x))));
          // Worn convex edges: lighter (bare metal, scuffed leather), first where the grain stands proud.
          const edge = clamp(b.w.sub(EDGE_BASE).mul(4), 0, 1);
          wear = smoothstep(0.05, 0.85, edge.mul(grain().mul(0.9).add(1))).mul(r1.x).mul(gain).toVar();
          c.assign(mix(c, c.mul(r1.y.mul(2.2).add(1)).add(r1.y.mul(0.06)), wear));
          // The baked painted value (occlusion, the island's tone, the painted light), painted in.
          c.mulAssign(mix(float(1), painted(b), r1.z.mul(gain)));
          // Baked-on detail (stitching) in thread colour, shaded by the same occlusion.
          const thread = clamp(float(EDGE_BASE).sub(b.w).mul(4), 0, 1).mul(gain);
          c.assign(mix(c, vec3(THREAD.r, THREAD.g, THREAD.b).mul(min(painted(b), 1).sqrt()), smoothstep(0.15, 0.6, thread)));
          return c;
        },
        roughness: (r) => clamp(r.add(r1.w).sub(wear.mul(0.18)).sub(grain().mul(0.12)), 0.05, 1),
        normal() {
          // The baked normal, with the material's relief laid over it (both in the model's one tangent frame).
          const bxy = bake().xy.mul(2).sub(1).mul(float(1).sub(polish));
          const bz = sqrt(max(float(1).sub(dot(bxy, bxy)), 0));
          const dxy = lib().yz.mul(2).sub(1).mul(r0.w).mul(gain);
          const ts = normalize(vec3(bxy.add(dxy), bz));
          return normalize((TBNViewMatrix as unknown as { mul(v: V3): V3 }).mul(ts));
        },
        ao: (a) => a.mul(clamp(painted(bake()), 0, 1).pow(0.8)) as F,
      };
    },
  });
}

/** Change a painted material's surface (gear learns its palette's after cloning). */
export function setCharSurface(mat: THREE.Material, kind: SurfaceKind) {
  const u = mat.userData.charSurface as SurfaceUniforms | undefined;
  if (u) u.uKind.value = kindIndex(kind);
}

/** Scale every baked material's painting under `root` (item icons paint a little softer). */
export function setSurfaceGain(root: THREE.Object3D, gain: number) {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const u = (o.material as THREE.Material).userData.charSurface as SurfaceUniforms | undefined;
    if (u) u.uSurfGain.value = gain;
  });
}
