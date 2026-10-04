import type * as THREE from 'three';
import type { NodeBuilder, Renderer } from 'three/webgpu';

/**
 * How long an instanced mesh's per-instance GPU buffers live: until the mesh, or the geometry it is
 * drawn with, is disposed.
 *
 * Those buffers (the patches' copy of the instance matrices, patch.ts, the renderer's instance
 * colours, and its own matrices for a mesh of over a thousand) are node attributes, which three.js
 * 0.186 frees only through a geometry's dispose, and then only those of the first program that drew
 * it: usually its shadow's, which reads none of the patches' buffers. So a shadow caster's buffers
 * outlived it, and a mesh drawn with a shared geometry (which is never disposed) kept all of its own.
 * (An instanced mesh's matrices and colours are its own, as three.js assumes: never shared.)
 */

type Disposable = { addEventListener(type: 'dispose', f: () => void): void; removeEventListener(type: 'dispose', f: () => void): void };
type Attribute = (THREE.BufferAttribute | THREE.InterleavedBufferAttribute) & { isInstancedBufferAttribute?: boolean };
type NodeAttributes = { node?: { attribute?: Attribute | null } | null }[];

interface Kept {
  /** The node attributes of each program built for the mesh (each build fills its list as it finishes). */
  built: Set<NodeAttributes>;
  /** The renderers that built them, which hold the GPU buffers. */
  renderers: Set<Renderer>;
  /** The mesh and geometries whose dispose frees them, and the listener on each. */
  watched: Map<Disposable, () => void>;
}
const kept = new WeakMap<THREE.InstancedMesh, Kept>();

/**
 * Free each instanced mesh's per-instance buffers with it, whichever of `renderer`'s programs (its
 * shadows' among them) made them: the renderer's hook on each new program records what it reads.
 */
export function freeInstanceBuffersWithMeshes(renderer: Renderer) {
  const before = renderer.debug.onNodeBuilderCreated;
  renderer.debug.onNodeBuilderCreated = (builder, owner) => {
    keep(builder);
    before?.(builder, owner);
  };
}

function keep(builder: NodeBuilder) {
  const mesh = builder.object as THREE.InstancedMesh;
  if (!mesh?.isInstancedMesh) return;
  let k = kept.get(mesh);
  if (!k) kept.set(mesh, (k = { built: new Set(), renderers: new Set(), watched: new Map() }));
  k.built.add((builder as NodeBuilder & { bufferAttributes: NodeAttributes }).bufferAttributes);
  k.renderers.add(builder.renderer);
  // (Held weakly: a shared geometry outlives the meshes drawn with it, freed or merely dropped.)
  const ref = new WeakRef(k);
  for (const [target, meshFreed] of [[mesh as Disposable, true], [mesh.geometry as Disposable, false]] as const) {
    if (k.watched.has(target)) continue;
    const onDispose = () => {
      const k = ref.deref();
      if (k) free(k, target, meshFreed);
    };
    target.addEventListener('dispose', onDispose);
    k.watched.set(target, onDispose);
  }
}

/**
 * Destroy the GPU buffers through each renderer that made them. three.js 0.186 has no public way to
 * free a vertex attribute (BufferAttribute.dispose() is not yet heard by its renderer), so this goes
 * through the renderer's own attribute store, as a geometry's dispose does. A mesh drawn again gets
 * fresh buffers.
 */
function free(k: Kept, by: Disposable, meshFreed: boolean) {
  // A disposed geometry may be drawn again by the same mesh: the mesh's dispose still frees them then.
  for (const [target, onDispose] of k.watched) {
    if (!meshFreed && target !== by) continue;
    target.removeEventListener('dispose', onDispose);
    k.watched.delete(target);
  }
  const attributes = new Set<Attribute>(), interleaved = new Set<THREE.InterleavedBuffer>();
  for (const list of k.built) {
    for (const { node } of list) {
      const a = node?.attribute;
      const data = (a as THREE.InterleavedBufferAttribute | undefined)?.isInterleavedBufferAttribute ? (a as THREE.InterleavedBufferAttribute).data : null;
      // (Told by its buffer over an interleaved one: 0.186 leaves a vec4 column's own flag unset.)
      if (!a || !(data ? (data as { isInstancedInterleavedBuffer?: boolean }).isInstancedInterleavedBuffer : a.isInstancedBufferAttribute)) continue;
      attributes.add(a);
      if (data) interleaved.add(data);
    }
  }
  for (const renderer of k.renderers) {
    const store = (renderer as Renderer & { _attributes?: { delete(a: object): unknown } | null })._attributes;
    const backend = renderer.backend as unknown as { delete(o: object): void };
    // (Every column first: each destroys the GPU buffer they share.)
    for (const a of attributes) store?.delete(a);
    for (const data of interleaved) {
      // (Newer three.js keys an interleaved attribute's GPU buffer on its interleaved buffer; 0.186
      // keeps the destroyed buffer recorded there and would draw from it again.)
      store?.delete(data);
      backend.delete(data);
    }
  }
  // A disposed mesh's programs go with it.
  if (meshFreed) k.built.clear();
}
