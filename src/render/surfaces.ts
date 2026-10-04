import type * as THREE from 'three';

/**
 * Water as the screen-space effects see it (see post.ts). While they are on, the scene pass leaves
 * each surface's facing, colour, gloss and motion in buffers beside the picture; see-through things
 * (glass, smoke, sparks, falling water) leave those to whatever lies behind them, but open water
 * stands in them as the surface it is, and writes its depth, so a reflection leaves the water's own
 * face (not the bed under it) and the smoothing follows it. Off, the water draws as it always did.
 */
const water = new Map<THREE.Material, number>();
let on = false;

/**
 * Mark a water material as a surface for the effects; returns it. `shine` scales its screen-space
 * reflection (0 for water with a mirror of its own, which already shows what stands over it).
 */
export function effectsWater<M extends THREE.Material>(mat: M, shine = 1): M {
  water.set(mat, shine);
  mat.addEventListener('dispose', () => water.delete(mat));
  if (on) {
    mat.depthWrite = true;
    mat.needsUpdate = true;
  }
  return mat;
}

/** Whether a material is water the effects treat as a surface. */
export const isEffectsWater = (mat: THREE.Material) => water.has(mat);

/** How strongly a water material takes the screen-space reflections (0 for anything else). */
export const waterShine = (mat: THREE.Material) => water.get(mat) ?? 0;

/** The water writes its depth exactly while the effects' buffers are drawn. */
export function setEffectsBuffers(draw: boolean) {
  if (draw === on) return;
  on = draw;
  for (const m of water.keys()) {
    m.depthWrite = draw;
    m.needsUpdate = true;
  }
}
