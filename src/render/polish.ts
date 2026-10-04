import * as THREE from 'three';
import type { NodeBuilder, Renderer } from 'three/webgpu';
import { attribute, mix, pmremTexture, step } from 'three/tsl';
import { equirectEnv, mixRGB, smooth, SOFTBOXES, type Finish } from './env';
import { addPatch, type F, type V2 } from './patch';

/**
 * Characters' and gear's metal is smooth, polished and shiny (owner, October 4: "the weird lumpy stuff has to go
 * completely and just be shiny metal"): no grain, dents or noise in its paint or its shading, nearly a mirror of a
 * bright sky, so a plate reads by the sky and land it reflects and every bevel catches a highlight. A part made of
 * metal has a material of its own (applyPolish); parts of fixed colours merged into one mesh (registry.ts
 * mergeRigidParts) carry their polish per vertex (`aPolish`), so a goblin's iron studs shine without a draw of their
 * own (applyVertexPolish).
 */

/**
 * The sky the metal reflects: a clear sky over a pale haze at the horizon, the land a step darker below it and
 * shading darker still, and the studio's two softboxes (env.ts), small and hot, for highlights.
 */
const SKY = { zenith: [0.78, 0.86, 1.02], haze: [1.0, 0.97, 0.92], skyline: [0.52, 0.49, 0.44], land: [0.16, 0.15, 0.12] };
const SKY_BOXES = [
  { dir: SOFTBOXES[0].dir, radius: 0.2, color: [2.4, 2.25, 2.0] },
  { dir: SOFTBOXES[1].dir, radius: 0.16, color: [1.0, 1.1, 1.3] },
];

/** Linear HDR radiance of the metal's sky along a (unit) direction. */
export function skyRadiance(d: THREE.Vector3): [number, number, number] {
  const c = d.y >= 0 ? mixRGB(SKY.haze, SKY.zenith, smooth(0, 0.7, d.y)) : mixRGB(SKY.skyline, SKY.land, smooth(0, 0.22, -d.y));
  for (const b of SKY_BOXES) {
    const a = Math.acos(Math.max(-1, Math.min(1, d.dot(b.dir))));
    const k = smooth(b.radius, b.radius * 0.6, a);
    for (let i = 0; i < 3; i++) c[i] += b.color[i] * k;
  }
  return [c[0], c[1], c[2]];
}

let sky: THREE.DataTexture | null = null;

/** The metal's sky (built once, shared by every renderer: each prefilters its own). */
export function skyEnv(): THREE.DataTexture {
  return (sky ??= equirectEnv(skyRadiance));
}

/**
 * How each kind of metal is polished: steel and iron nearly a mirror, gold a touch brighter, the blackened underlayer
 * a little softer. Forged tiers set their own polish (items.ts `rough`).
 */
export const POLISH = {
  metal: { metalness: 0.9, roughness: 0.22, envMapIntensity: 1 },
  trim: { metalness: 0.95, roughness: 0.2, envMapIntensity: 1 },
  dark: { metalness: 0.8, roughness: 0.3, envMapIntensity: 1 },
} as const satisfies Record<Finish, object>;

/** Polish a metal part's own material: its finish, and the sky to mirror. */
export function applyPolish(mat: THREE.Material, finish: Finish) {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return;
  Object.assign(mat, POLISH[finish]);
  mat.envMap = skyEnv();
  mat.needsUpdate = true;
}

/** A merged part's polish per vertex (metalness, roughness): none (0, 0) where it is not metal. */
export function polishAttribute(geo: THREE.BufferGeometry, finish: Finish | null) {
  const n = geo.attributes.position.count, a = new Float32Array(n * 2);
  if (finish) for (let i = 0; i < n; i++) a.set([POLISH[finish].metalness, POLISH[finish].roughness], i * 2);
  geo.setAttribute('aPolish', new THREE.BufferAttribute(a, 2));
}

/** Each renderer's prefiltered sky (its own: a prefiltered map belongs to the renderer that made it). */
const prefiltered = new WeakMap<Renderer, ReturnType<typeof pmremTexture>>();
const skyFor = (r: Renderer) => {
  let n = prefiltered.get(r);
  if (!n) prefiltered.set(r, (n = pmremTexture(skyEnv())));
  return n;
};

/**
 * Polish the metal among a merged mesh's vertices (`aPolish`, polishAttribute): their metalness and roughness, and
 * the sky they mirror; the rest of the mesh is lit as before, the sky counting for nothing there.
 */
export function applyVertexPolish(mat: THREE.Material) {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return;
  addPatch(mat, {
    key: 'polish:vertex',
    slot: 'polish',
    nodes(_u, builder: NodeBuilder) {
      const p = attribute('aPolish', 'vec2') as V2;
      const metal = step(0.001, p.x) as F;
      return {
        metalness: (m) => mix(m, p.x, metal) as F,
        roughness: (r) => mix(r, p.y, metal) as F,
        env: () => skyFor(builder.renderer as Renderer).mul(metal),
      };
    },
  });
}
