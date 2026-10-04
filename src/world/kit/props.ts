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

/** Where one separate shape's faces of one material lie in that material's mesh: its vertices and its indices. */
interface Span {
  material: string;
  v0: number;
  v1: number;
  i0: number;
  i1: number;
}

interface Prop {
  /** All its faces, by material, in kit units. */
  parts: Map<string, Mesh3>;
  /** Its separate shapes (its own first, then each thing resting on it), each as where its faces lie in `parts`. */
  shapes: { name: string; spans: Span[] }[];
}
const props = new Map<string, Prop>();
let loading: Promise<void> | null = null;

/** Appends a mesh's triangles, placed by `world`, in kit units; returns where they went. */
function append(into: Mesh3, g: THREE.BufferGeometry, world: THREE.Matrix4, material: string): Span {
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), v0 = into.count, i0 = into.idx.length;
  const nm = new THREE.Matrix3().getNormalMatrix(world), v = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(world).divideScalar(U);
    n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
    into.vert(v.x, v.y, v.z, n.x, n.y, n.z);
  }
  const idx = g.index;
  for (let i = 0; i < (idx ? idx.count : pos.count); i++) into.idx.push(v0 + (idx ? idx.getX(i) : i));
  return { material, v0, v1: into.count, i0, i1: into.idx.length };
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
    const prop: Prop = { parts: new Map(), shapes: [] }, from = root.matrixWorld.clone().invert(), at = new THREE.Matrix4();
    const shapes = new Map<THREE.Object3D, Span[]>();
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const material = (o.material as THREE.Material).name, node = isNode(o) ? o : o.parent!;
      let m = prop.parts.get(material);
      if (!m) prop.parts.set(material, (m = new Mesh3()));
      at.multiplyMatrices(from, o.matrixWorld);
      const span = append(m, o.geometry, at, material);
      const spans = shapes.get(node);
      if (spans) spans.push(span);
      else shapes.set(node, [span]);
    });
    for (const [node, spans] of shapes) prop.shapes.push({ name: node.name, spans });
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

/**
 * A prop's separate shapes, its own first, then each thing resting on it, each with all its
 * materials together (for checking that each is one continuous shape; made when asked for).
 */
export function propShapes(name: string): { name: string; mesh: Mesh3 }[] {
  const p = get(name);
  return p.shapes.map(({ name: shape, spans }) => {
    const mesh = new Mesh3();
    for (const { material, v0, v1, i0, i1 } of spans) {
      const from = p.parts.get(material)!, base = mesh.count, P = from.pos, N = from.nor;
      for (let v = v0; v < v1; v++) mesh.vert(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
      for (let i = i0; i < i1; i++) mesh.idx.push(from.idx[i] - v0 + base);
    }
    return { name: shape, mesh };
  });
}

/** The props loaded. */
export const propNames = (): string[] => [...props.keys()];
