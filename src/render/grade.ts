import * as THREE from 'three';
import { dot, mix, positionWorld, smoothstep, sqrt, vec4 } from 'three/tsl';
import { addPatch, objectPosition } from './patch';

// ─── Grade: soft vertical shading (cheap ambient occlusion) ─────────────────

/**
 * Darkens toward the base of an object, so flat-coloured models keep their depth. `low` is the
 * brightness at `from`, rising smoothly to full at `to`.
 * - 'root': heights are fractions of the model's height above its root (feet 0, top 1), measured
 *   in the root's frame, so limbs and attached gear share one gradient. Call trackGradeRoot on
 *   each mesh so the root's current transform reaches the shader.
 * - 'local': heights are in the geometry's own units (instanced trees and bushes).
 */
export interface Grade {
  low: number;
  from: number;
  to: number;
}

/** Characters and gear: legs and boots sit in a little shade, chest and head in full light. */
export const MODEL_GRADE: Grade = { low: 0.7, from: 0, to: 0.62 };

type GradeSpace = 'root' | 'local';

export function applyGrade(mat: THREE.Material, grade: Grade, space: GradeSpace) {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return;
  const uniforms = {
    uGradeLow: { value: grade.low },
    uGradeFrom: { value: grade.from },
    uGradeTo: { value: grade.to },
    // Root space: world position → height fraction (row of the root's inverse world matrix / height).
    // (0,0,0,1) until a root is found: a fraction of 1, i.e. no shading.
    uGradeRow: { value: new THREE.Vector4(0, 0, 0, 1) },
  };
  mat.userData.gradeRow = uniforms.uGradeRow.value;
  addPatch(mat, {
    key: `grade:${space}`,
    slot: 'grade',
    uniforms,
    nodes(u, b) {
      const g = space === 'root' ? dot(u.v4('uGradeRow'), vec4(positionWorld, 1)) : objectPosition(b).y;
      return { color: (c) => c.mul(mix(u.f('uGradeLow'), 1, smoothstep(u.f('uGradeFrom'), u.f('uGradeTo'), g))) };
    },
  });
}

/**
 * World-height shade for scenery that climbs cave walls (instanced rock slabs): the higher a
 * fragment sits in the world, the darker (down to `low` at `to`), eased like the cave relief's
 * own falloff, so the slabs and the rock mass behind them fade into the dark together.
 */
export function applyHeightShade(mat: THREE.Material, low: number, from: number, to: number) {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return;
  const uniforms = { uHsLow: { value: low }, uHsRange: { value: new THREE.Vector2(from, to) } };
  addPatch(mat, {
    key: 'hshade',
    uniforms,
    nodes(u) {
      const r = u.v2('uHsRange');
      return { color: (c) => c.mul(mix(1, u.f('uHsLow'), sqrt(smoothstep(r.x, r.y, positionWorld.y)))) };
    },
  });
}

const gradeInv = new THREE.Matrix4();

/**
 * Write the row that maps a world position to a height fraction of `root` (0 at its origin,
 * 1 at `height` up its local Y axis) into `out`.
 */
export function gradeRow(root: THREE.Object3D, height: number, out: THREE.Vector4) {
  const e = gradeInv.copy(root.matrixWorld).invert().elements;
  return out.set(e[1], e[5], e[9], e[13]).divideScalar(height);
}

/**
 * Keep a root-graded mesh's gradient attached to the model it is part of: the nearest ancestor
 * tagged with `userData.gradeHeight` (model roots; gear finds the hero it is worn by). Meshes
 * with no such ancestor (a lone weapon in an icon) stay unshaded.
 */
export function trackGradeRoot(mesh: THREE.Mesh) {
  mesh.onBeforeRender = (_r, _s, _c, _g, material) => {
    const row = material.userData.gradeRow as THREE.Vector4 | undefined;
    if (!row) return;
    let root: THREE.Object3D | null = mesh.parent;
    while (root && root.userData.gradeHeight === undefined) root = root.parent;
    if (root) gradeRow(root, root.userData.gradeHeight, row);
    else row.set(0, 0, 0, 1);
  };
}
