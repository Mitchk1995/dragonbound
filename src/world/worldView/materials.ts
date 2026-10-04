import * as THREE from 'three';
import { applyGrade, applySurface, type Grade } from '../../render/surface';
import { applyPaint, isPaintKind, type PaintKind } from '../../render/paint';
import type { SurfaceKind } from '../../render/textures';
import { grownTrees, GROWN, treeSet, type GrownKind, type GrownLook, type TreeKind, type TreeSet, type TreeStyle } from '../trees';
import { makeOccludable } from './occlusion';

// ─── Shared wind ────────────────────────────────────────────────────────────

/** Shared wind clock (advanced by WorldView.tick). */
export const WIND = { uWindT: { value: 0 } };

/** World instancing tile size in cells (see instancer). */
const CHUNK = 24;

// ─── Scenery materials ──────────────────────────────────────────────────────

/**
 * The material every instanced scenery set uses: flat shaded, painted albedo (or an old surface),
 * an optional shade toward the foot, cut away around the hero when `occlude`.
 */
export function sceneryMaterial(instanceColors: boolean, color: number, occlude: boolean, surface?: SurfaceKind | PaintKind, grade?: Grade, setup?: (m: THREE.MeshStandardMaterial) => void) {
  const mat = new THREE.MeshStandardMaterial({ color: instanceColors ? 0xffffff : color, flatShading: true, roughness: 0.9 });
  // Painted albedo (hand-painted look) wherever a paint exists; the old surfaces otherwise.
  if (surface && isPaintKind(surface)) applyPaint(mat, surface, 'world');
  else if (surface) applySurface(mat, surface, 'world');
  setup?.(mat);
  if (grade) applyGrade(mat, grade, 'local');
  if (occlude) makeOccludable(mat);
  return mat;
}

export function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], cols: THREE.Color[] | null, shadow: boolean) {
  const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((mm, i) => {
    mesh.setMatrixAt(i, mm);
    if (cols) mesh.setColorAt(i, cols[i]);
  });
  mesh.computeBoundingSphere();
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

/** Block canopies carry a painted vertex shade (trees.ts) under the instance colour. */
export const withVertexShade = (m: THREE.MeshStandardMaterial) => {
  m.vertexColors = true;
};

type SceneryArgs = [color: number, occlude: boolean, surface?: SurfaceKind | PaintKind, shadow?: boolean, grade?: Grade, setup?: (m: THREE.MeshStandardMaterial) => void];

/** Material arguments for a grown tree's trunk and canopy: its own bark and leaves (foliage.ts), swaying with the world's wind. */
export const grownArgs = (look: GrownLook): [SceneryArgs, SceneryArgs] => [
  [0xffffff, true, undefined, true, undefined, (m) => look.trunk(m, WIND)],
  [0xffffff, true, undefined, true, undefined, (m) => look.canopy(m, WIND)],
];

/** Material arguments for a block or faceted tree's trunk and canopy (shared by the world and the dev lineup). */
export function treeArgs(ts: TreeSet, k: TreeKind): [SceneryArgs, SceneryArgs] {
  return [
    [k === 'ash' ? 0x2a2420 : 0x4a3020, true, 'bark'],
    [0, true, ts.paint[k], true, ts.grade, ts.shaded && k !== 'ash' ? withVertexShade : undefined],
  ];
}

/**
 * Dev only: trees of one style as plain instanced meshes with the world's own materials (the
 * inspect harness lines the styles up side by side).
 */
export function treeMeshes(style: TreeStyle, kind: TreeKind, mats: THREE.Matrix4[], cols: THREE.Color[], variant = 0) {
  const ts = treeSet(style);
  const [trunk, crown] = treeArgs(ts, kind);
  const mk = (geo: THREE.BufferGeometry, c: THREE.Color[] | null, [color, occlude, surface, shadow = true, grade, setup]: SceneryArgs) =>
    instanced(geo, sceneryMaterial(!!c, color, occlude, surface, grade, setup), mats, c, shadow);
  const vs = ts.canopy[kind], trunks = ts.trunk[kind];
  return [mk(trunks[trunks.length === vs.length ? variant % vs.length : 0], null, trunk), mk(vs[variant % vs.length], cols, crown)];
}

/** Dev only: one variant of a grown kind (trees.ts GROWN) as instanced meshes with the world's own materials. */
export function grownMeshes(kind: GrownKind, mats: THREE.Matrix4[], cols: THREE.Color[], variant = 0) {
  const set = grownTrees(kind), [trunk, crown] = grownArgs(GROWN[kind].look);
  const mk = (geo: THREE.BufferGeometry, c: THREE.Color[] | null, [color, occlude, surface, shadow = true, grade, setup]: SceneryArgs) =>
    instanced(geo, sceneryMaterial(!!c, color, occlude, surface, grade, setup), mats, c, shadow);
  const v = variant % set.canopy.length;
  return [mk(set.trunk[v], null, trunk), mk(set.canopy[v], cols, crown)];
}

/** Instanced scenery added to `group`, bucketed into CHUNK-cell tiles. */
export function instancer(group: THREE.Group) {
  return (geo: THREE.BufferGeometry, mats: THREE.Matrix4[], cols: THREE.Color[] | null, color: number, occlude: boolean, surface?: SurfaceKind | PaintKind, shadow = true, grade?: Grade, setup?: (m: THREE.MeshStandardMaterial) => void) => {
    if (!mats.length) return;
    const mat = sceneryMaterial(!!cols, color, occlude, surface, grade, setup);
    // Bucket instances into CHUNK×CHUNK-cell tiles so off-screen tiles are frustum-culled
    // (one map-wide InstancedMesh is always drawn in full, shadows included).
    const buckets = new Map<string, number[]>();
    const tp = new THREE.Vector3();
    mats.forEach((mm, i) => {
      tp.setFromMatrixPosition(mm);
      const key = `${Math.floor(tp.x / CHUNK)},${Math.floor(tp.z / CHUNK)}`;
      const b = buckets.get(key) ?? [];
      b.push(i);
      buckets.set(key, b);
    });
    const made: THREE.InstancedMesh[] = [];
    for (const ids of buckets.values()) made.push(instanced(geo, mat, ids.map((id) => mats[id]), cols && ids.map((id) => cols[id]), shadow));
    group.add(...made);
    return made;
  };
}
