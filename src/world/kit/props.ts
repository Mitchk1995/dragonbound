import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Mesh3 } from './mesh';
import { U } from './scale';

/**
 * The kit's furniture and props modelled in Blender (tools/blender/kit_props.py, exported to
 * public/models/kit_props.glb): each one continuous, watertight shape, as a furniture maker or a
 * smith would make it, and the things that really are separate (a chest's iron bands, a bed's
 * bedding) separate shapes resting on it. Each face's material names its surface and the way the
 * wood's grain runs (`oak.x`); the pieces that use them say which surfaces those are
 * (elementsRoom.ts). Loaded once, with the kit's surfaces, before any building is drawn.
 */

interface Prop {
  /** All its faces, by material, in kit units. */
  parts: Map<string, Mesh3>;
  /** The prop's own shape (without the separate things resting on it), all materials together. */
  shape: Mesh3;
}
const props = new Map<string, Prop>();
let loading: Promise<void> | null = null;

/** Appends a mesh's triangles, placed by `world`, in kit units. */
function append(into: Mesh3, g: THREE.BufferGeometry, world: THREE.Matrix4) {
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), base = into.count;
  const nm = new THREE.Matrix3().getNormalMatrix(world), v = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(world).divideScalar(U);
    n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
    into.vert(v.x, v.y, v.z, n.x, n.y, n.z);
  }
  const idx = g.index;
  for (let i = 0; i < (idx ? idx.count : pos.count); i++) into.idx.push(base + (idx ? idx.getX(i) : i));
}

/** Reads the props from the exported file's bytes (the game fetches it; the tests read it from disk). */
export async function parseKitProps(data: ArrayBuffer): Promise<void> {
  const gltf = await new GLTFLoader().parseAsync(data, '');
  gltf.scene.updateMatrixWorld(true);
  props.clear();
  // (A node of several materials is loaded as a group of one mesh per material, which are not nodes of their own.)
  const isNode = (o: THREE.Object3D) => (gltf.parser.associations.get(o) as { nodes?: number } | undefined)?.nodes !== undefined;
  for (const root of gltf.scene.children) {
    // (Each prop stands apart in the file; it is taken from where it stands, about its own foot.)
    const prop: Prop = { parts: new Map(), shape: new Mesh3() }, from = root.matrixWorld.clone().invert(), at = new THREE.Matrix4();
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const name = (o.material as THREE.Material).name;
      let m = prop.parts.get(name);
      if (!m) prop.parts.set(name, (m = new Mesh3()));
      at.multiplyMatrices(from, o.matrixWorld);
      append(m, o.geometry, at);
      if (o === root || (o.parent === root && !isNode(o))) append(prop.shape, o.geometry, at);
    });
    props.set(root.name, prop);
  }
}

/** Loads the props (once). */
export function loadKitProps(): Promise<void> {
  loading ??= fetch('./models/kit_props.glb')
    .then((res) => {
      if (!res.ok) throw new Error(`kit props: ${res.status}`);
      return res.arrayBuffer();
    })
    .then(parseKitProps)
    .catch((err) => {
      // (Not kept: the next building to be drawn tries again.)
      loading = null;
      throw err;
    });
  return loading;
}

function get(name: string): Prop {
  const p = props.get(name);
  if (!p) throw new Error(props.size ? `building kit: no prop "${name}"` : 'building kit: props are not loaded (loadKitProps)');
  return p;
}

/** A prop's faces of one material, in kit units. */
export function prop(name: string, material: string): Mesh3 {
  const m = get(name).parts.get(material);
  if (!m) throw new Error(`building kit: prop "${name}" has no ${material}`);
  return m;
}

/** A prop's own shape, every material together (for checking it is one continuous shape). */
export const propShape = (name: string): Mesh3 => get(name).shape;

/** The props loaded. */
export const propNames = (): string[] => [...props.keys()];
