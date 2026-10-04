import * as THREE from 'three';
import { abs, cameraViewMatrix, cameraWorldMatrix, clamp, dot, float, floor, fract, materialReference, mat3, max, mix, normalize, normalWorldGeometry, positionLocal, positionWorld, pow, sin, smoothstep, sqrt, TBNViewMatrix, vec2, vec3 } from 'three/tsl';
import { VALUE_SCALE } from './charBake';
import { addPatch, type F, type V2, type V3, type V4 } from './patch';
import { rockBake, rockLayer, type RockName } from './rockModels';

/**
 * The kit rocks' paint (rockModels.ts): every rock is painted from its baked map and the sourced painted layers, the
 * way a professional paints an instanced rock kit:
 * - its colour is the zone's rock tone (the instance colour), carrying the painted rock layer (value and relief) laid
 *   on from the world's three axes, so the grain runs at one size over every rock however it is turned or scaled;
 * - the baked map (tools/blender/rock_bake.py) gives the rock's carved form: its normal (the dense rock's chips,
 *   beds and cracks on the game mesh), its painted value (occlusion in the cracks, light worn edges, lit tops and
 *   shaded undersides) and its mask: moss where the rock faces up (grown as far as the zone allows, `moss`) or, on an
 *   ore rock, its veins, painted in the ore's colour (glinting, or glowing for emberite) and gone dull once mined.
 * One program for each kind of rock paint (mossy, bare, ore), whatever the rock: its baked map is read off each
 * material, never bound into its program.
 */

/** The mask is stored over MASK_BASE (rock_bake.py); the painted value at bake.py's VALUE_SCALE, as the characters'. */
export const MASK_BASE = 0.5;

/** How a set of rocks is painted. */
export interface RockLook {
  /** How far moss grows over what faces up (0 none, 1 everywhere the bake allows). */
  moss: number;
  /** The moss's colour (linear). */
  mossColor: THREE.Color;
  /** How much the painted rock layer swings the colour (1 as painted). */
  detail?: number;
}

/** An ore rock's veins. */
export interface OreLook {
  /** The ore's colour in its veins (sRGB hex). */
  vein: number;
  /** Glints flashing on the veins (sRGB hex), or 0 for none. */
  glint: number;
  /** How bright the veins glow of themselves (emberite). */
  glow: number;
  /** The veins' roughness (metal ores catch the light). */
  rough: number;
}

const ROCK_TILE = 2.6;        // metres per repeat of the rock layer
const MOSS_TILE = 1.3;        // and of the moss layer

type RockMaterial = THREE.MeshStandardMaterial & { rockBake?: THREE.Texture };

/** A painted layer's relief at a sample: its normal's x and y across the texture (x along it, y along its V). */
const relief = (t: V4): V2 => t.yz.mul(2).sub(1).mul(vec2(1, -1)) as unknown as V2;

/** Shared look of the paint for both kinds (plain rock with moss, ore rock with veins). */
interface Uniforms extends Record<string, { value: unknown }> {
  uRkLayer: { value: THREE.Texture };
  uRkMossLayer: { value: THREE.Texture };
  uRkMoss: { value: number };
  uRkMossCol: { value: THREE.Color };
  uRkDetail: { value: number };
  uRkVein: { value: THREE.Color };
  uRkGlint: { value: THREE.Color };
  uRkGlow: { value: number };
  uRkVeinRough: { value: number };
  /** 1 while the ore is there, 0 once mined. */
  uRkOre: { value: number };
  /** The ore rock's clock (its glints flash on it). */
  uRkTime: { value: number };
}

/** What a rock's mask paints: moss, nothing (a zone with no moss: its rock skips the moss altogether), or ore veins. */
type Paint = 'moss' | 'bare' | 'ore';

function paint(mat: THREE.Material, model: RockName, uniforms: Uniforms, kind: Paint) {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return;
  (mat as RockMaterial).rockBake = rockBake(model);
  mat.flatShading = false;
  mat.userData.rockKit = uniforms;
  const ore = kind === 'ore', mossy = kind === 'moss';
  addPatch(mat, {
    key: kind === 'moss' ? 'rockkit' : `rockkit:${kind}`,
    slot: 'surface',
    uniforms,
    nodes(u) {
      // (The geometry's own normal in the world, scaled and turned with its instance: a stretched slab's top still
      // faces up.)
      const p = positionWorld;
      const n = normalWorldGeometry;
      let bakeN: V4 | null = null, rockN: { v: F; d: V3 } | null = null, mossN: V4 | null = null;
      const bake = () => (bakeN ??= (materialReference('rockBake', 'texture') as unknown as V4).toVar());
      // The rock layer from the world's three axes: its value and its relief as a nudge to the world normal.
      const rock = () => {
        if (rockN) return rockN;
        const w0 = pow(abs(n), vec3(4)).add(1e-4);
        const w = w0.div(w0.x.add(w0.y).add(w0.z)).toVar();
        const q = p.div(ROCK_TILE);
        const tex = u.tex('uRkLayer');
        const tx = tex.sample(q.zy).toVar(), ty = tex.sample(q.xz).toVar(), tz = tex.sample(q.xy).toVar();
        const v = tx.x.mul(w.x).add(ty.x.mul(w.y)).add(tz.x.mul(w.z)).toVar();
        // (A layer's relief is green up its image; the texture runs down it, so its second axis turns over.)
        const dx = relief(tx), dy = relief(ty), dz = relief(tz);
        const d = vec3(0, dx.y, dx.x).mul(w.x).add(vec3(dy.x, 0, dy.y).mul(w.y)).add(vec3(dz.x, dz.y, 0).mul(w.z)).toVar();
        return (rockN = { v: v as unknown as F, d: d as unknown as V3 });
      };
      const moss = () => (mossN ??= u.tex('uRkMossLayer').sample(p.xz.div(MOSS_TILE)).toVar() as unknown as V4);
      const mask = () => clamp(bake().w.sub(MASK_BASE).div(1 - MASK_BASE), 0, 1);
      const value = () => bake().z.div(VALUE_SCALE);
      // Where moss grows: the bake's mask, on what faces up in the world, as far as the zone allows.
      const mossAmt = () => clamp(smoothstep(0.12, 0.5, mask()).mul(smoothstep(0.25, 0.7, n.y)).mul(u.f('uRkMoss')).mul(1.6), 0, 1);
      const veinAmt = () => smoothstep(0.22, 0.6, mask());
      // Glints: tiny bright points scattered over the veins, each flashing on its own beat.
      const glints = () => {
        const cell = floor(positionLocal.mul(24));
        const h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
        const beat = pow(sin(u.f('uRkTime').mul(2.4).add(h.mul(40))).mul(0.5).add(0.5), float(10));
        return smoothstep(0.94, 0.97, h).mul(beat).mul(veinAmt()).mul(u.f('uRkOre'));
      };
      return {
        color(c0) {
          const r = rock();
          const dv = r.v.sub(0.5).mul(2).mul(u.f('uRkDetail')).toVar();
          const c = c0.mul(clamp(dv.add(1), 0.3, 1.9)).mul(vec3(1).add(vec3(1, 0.35, -0.6).mul(dv.mul(0.12)))).toVar();
          const val = value().toVar();
          c.mulAssign(val);
          if (ore) {
            const ve = veinAmt().toVar();
            const vein = u.v3('uRkVein').mul(clamp(dv.mul(0.7).add(1), 0.45, 1.6)).mul(pow(max(val, 0.01), float(0.6)));
            // Mined out: the veins go dark and empty.
            c.assign(mix(c, vein, ve.mul(u.f('uRkOre'))));
            c.assign(mix(c, c.mul(0.5), ve.mul(float(1).sub(u.f('uRkOre')))));
          } else if (mossy) {
            const m = moss().x.sub(0.5).mul(2).toVar();
            const mc = u.v3('uRkMossCol').mul(clamp(m.mul(0.85).add(1), 0.3, 1.8)).mul(vec3(1).add(vec3(0.5, 0.35, -0.3).mul(m.mul(0.3)))).mul(sqrt(max(val, 0.01)));
            c.assign(mix(c, mc, mossAmt()));
          }
          return c;
        },
        roughness(r0) {
          if (ore) return mix(r0, u.f('uRkVeinRough'), veinAmt().mul(u.f('uRkOre')));
          return mossy ? mix(r0, float(0.97), mossAmt()) : r0;
        },
        normal() {
          // The baked normal (the game mesh's own tangent frame, from its UVs), then the painted layer's relief
          // nudging it in the world (moss lays its own over it), back into view space.
          // (Green turns over: Blender bakes it up the texture, and the frame read off the UVs runs its V down it.)
          const bxy = bake().xy.mul(2).sub(1).mul(vec2(1, -1));
          const bz = sqrt(max(float(1).sub(dot(bxy, bxy)), 0));
          const nv = normalize((TBNViewMatrix as unknown as { mul(v: V3): V3 }).mul(vec3(bxy, bz)));
          const nw = normalize(mat3(cameraWorldMatrix).mul(nv)).toVar();
          let detail = rock().d.mul(0.55);
          if (mossy) {
            const md = relief(moss());
            detail = mix(detail, vec3(md.x, 0, md.y).mul(0.8), mossAmt()) as unknown as V3;
          }
          return normalize(mat3(cameraViewMatrix).mul(normalize(nw.add(detail))));
        },
        ao: (a) => a.mul(pow(clamp(value(), 0, 1), float(0.8))) as F,
        emissive: ore ? (e) => e.add(u.v3('uRkVein').mul(veinAmt().mul(u.f('uRkOre')).mul(u.f('uRkGlow')))).add(u.v3('uRkGlint').mul(glints().mul(3))) : undefined,
      };
    },
  });
}

function uniforms(look: Partial<RockLook>, ore?: OreLook): Uniforms {
  return {
    uRkLayer: { value: rockLayer('rock') },
    uRkMossLayer: { value: rockLayer('moss') },
    uRkMoss: { value: look.moss ?? 0 },
    uRkMossCol: { value: (look.mossColor ?? new THREE.Color(0x5a7a34)).clone() },
    uRkDetail: { value: look.detail ?? 1 },
    uRkVein: { value: new THREE.Color(ore?.vein ?? 0) },
    uRkGlint: { value: new THREE.Color(ore?.glint ?? 0) },
    uRkGlow: { value: ore?.glow ?? 0 },
    uRkVeinRough: { value: ore?.rough ?? 0.9 },
    uRkOre: { value: 1 },
    uRkTime: { value: 0 },
  };
}

/** Paint a material as kit rock `model` (its own baked map), with moss as the look allows. */
export function applyKitRock(mat: THREE.Material, model: RockName, look: Partial<RockLook> = {}) {
  paint(mat, model, uniforms(look), (look.moss ?? 0) > 0 ? 'moss' : 'bare');
}

/** Paint a material as ore rock `model` with its veins; returns the controls its prop drives. */
export function applyOreRock(mat: THREE.Material, model: RockName, ore: OreLook) {
  const u = uniforms({ detail: 0.9 }, ore);
  paint(mat, model, u, 'ore');
  return {
    /** Mined out (false) or there (true). */
    setOre: (on: boolean) => (u.uRkOre.value = on ? 1 : 0),
    tick: (t: number) => (u.uRkTime.value = t),
  };
}
