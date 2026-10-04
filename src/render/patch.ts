import * as THREE from 'three';
import { MeshBasicNodeMaterial, MeshLambertNodeMaterial, MeshPhysicalNodeMaterial, MeshStandardNodeMaterial, type Node, type NodeBuilder, type Renderer, type TextureNode } from 'three/webgpu';
import { cameraViewMatrix, float, Fn, negateOnBackSide, normalViewGeometry, diffuseColor, instancedBufferAttribute, mat3, mat4, materialEmissive, materialReference, materialRoughness, modelNormalMatrix, modelWorldMatrix, normalGeometry, normalLocal, OnBeforeFrameUpdate, positionGeometry, positionLocal, positionWorld, texture, varying, vec2, vec3 } from 'three/tsl';

/**
 * Composable material patches in the node shading language (TSL).
 *
 * The game builds plain three.js materials (MeshStandardMaterial and friends) everywhere. A patch
 * adds node code at fixed points of such a material's program: the vertex position before it is
 * skinned or instanced, a discard at the start of the fragment, the surface colour (after the colour
 * map, the vertex colours and the instance colour), its alpha, roughness, normal (view space) and
 * emission, and the outgoing light. Several patches stack, in the order they were added; adding a
 * patch in a slot the material already has replaces it.
 *
 * The renderer turns each plain material into its node twin when it builds its program; the twins
 * installed here (installPatchedMaterials) run the patches. Materials whose patches share keys and
 * textures share one program, so a patch's per-material values (numbers, vectors, colours,
 * matrices) are read off the material while it draws (`u`). Textures are bound into the program:
 * their ids join the program key, so a material with other textures gets a program of its own.
 */

export type F = Node<'float'>;
export type V2 = Node<'vec2'>;
export type V3 = Node<'vec3'>;
export type V4 = Node<'vec4'>;
export type Tex = TextureNode;

/** Where each patch hook runs. Every hook gets the value so far and returns the new one. */
export interface PatchHooks {
  /** The position in the geometry's own space, before skinning and instancing. */
  position?(p: V3): V3;
  /** At the start of the fragment: emit discards (If(…, () => Discard())). */
  discard?(): void;
  /** The surface colour (rgb). */
  color?(c: V3): V3;
  /** The surface alpha, after the alpha test. */
  alpha?(a: F): F;
  roughness?(r: F): F;
  /** The shading normal, in view space. */
  normal?(n: V3): V3;
  emissive?(e: V3): V3;
  /** The outgoing light (rgb), after lighting and emission, before the fog. */
  output?(l: V3): V3;
}

/** Reads a patch value (see ShaderPatch.uniforms) as a node of the type it is used as. */
export interface UniformReader {
  f(name: string): F;
  v2(name: string): V2;
  v3(name: string): V3;
  v4(name: string): V4;
  m4(name: string): Node<'mat4'>;
  /** An array of Vector3, read element by element. */
  v3a(name: string): { element(i: number): V3 };
  tex(name: string): Tex;
}

export interface ShaderPatch {
  /** Identifies the generated program: patches with equal keys (and textures) must produce equal code. */
  key: string;
  /** Patches in the same slot replace each other (defaults to the key). */
  slot?: string;
  /**
   * The patch's values, read in its nodes through `u`. The objects are kept (not copied), so a
   * `.value` changed later reaches the material. Names are shared by all of a material's patches.
   */
  uniforms?: Record<string, { value: unknown }>;
  /** Build the patch's nodes for one program (called once per build; the hooks share its closure). */
  nodes(u: UniformReader, builder: NodeBuilder): PatchHooks;
}

interface Patched {
  nodePatches?: ShaderPatch[];
  patchUniforms?: Record<string, { value: unknown }>;
  patchRefresh?: Node;
}

/**
 * A node a patched material carries as a property, so the renderer refreshes its per-draw values
 * (`u`, read off the material) every time it draws it: a material without node properties counts as
 * static and keeps the values of its first draw.
 */
const PATCH_REFRESH = float(0);

const patches = new WeakMap<THREE.Material, ShaderPatch[]>();

/** What a material's patches make of its program key: each key and the ids of its textures. */
function programKey(list: ShaderPatch[]) {
  return list.map((p) => {
    const tex = Object.values(p.uniforms ?? {}).flatMap((v) => (v.value instanceof THREE.Texture ? [v.value.uuid] : []));
    return tex.length ? `${p.key}[${tex.join(',')}]` : p.key;
  }).join('|');
}

/**
 * Add a shader patch to a material. Several patches stack, in the order added. Adding a patch in a
 * slot the material already has replaces it (e.g. other values for the same program).
 * Material.clone() does not carry patches over; patch the clone.
 */
export function addPatch(mat: THREE.Material, patch: ShaderPatch) {
  let list = patches.get(mat);
  const m = mat as THREE.Material & Patched;
  if (!list) {
    const l: ShaderPatch[] = (list = []);
    patches.set(mat, l);
    m.nodePatches = l;
    m.patchRefresh = PATCH_REFRESH;
    mat.customProgramCacheKey = () => programKey(l);
  }
  const slot = patch.slot ?? patch.key;
  const i = list.findIndex((p) => (p.slot ?? p.key) === slot);
  if (i >= 0) list[i] = patch;
  else list.push(patch);
  m.patchUniforms = Object.assign({}, ...list.map((p) => p.uniforms ?? {}));
  mat.needsUpdate = true;
}

export const patchKeys = (mat: THREE.Material) => (patches.get(mat) ?? []).map((p) => p.key);

/**
 * The hooks a material's patches build for one program (`mat` the material being built, or its node
 * twin, which carries the same patches), in the order they run.
 */
export function patchHooks(mat: THREE.Material, builder: NodeBuilder): PatchHooks[] {
  const m = mat as THREE.Material & Patched;
  const u = uniformReader(m.patchUniforms ?? {});
  return (m.nodePatches ?? []).map((p) => p.nodes(u, builder));
}

/** Reads `patchUniforms[name]` off the material being drawn (a texture is bound to the program). */
function uniformReader(uniforms: Record<string, { value: unknown }>): UniformReader {
  const made = new Map<string, unknown>();
  const get = (name: string, type: string) => {
    let n = made.get(name);
    if (n) return n;
    const u = uniforms[name];
    if (!u) throw new Error(`patch uniform ${name} is not defined`);
    n = type === 'texture' ? texture(u.value as THREE.Texture) : materialReference(`patchUniforms.${name}.value`, type);
    made.set(name, n);
    return n;
  };
  return {
    f: (name) => get(name, 'float') as F,
    v2: (name) => get(name, 'vec2') as V2,
    v3: (name) => get(name, uniforms[name]?.value instanceof THREE.Color ? 'color' : 'vec3') as V3,
    v4: (name) => get(name, 'vec4') as V4,
    m4: (name) => get(name, 'mat4') as Node<'mat4'>,
    v3a: (name) => get(name, 'vec3') as { element(i: number): V3 },
    tex: (name) => get(name, 'texture') as Tex,
  };
}

// ─── Instancing and the surface's frame ─────────────────────────────────────

const matrixBuffers = new WeakMap<THREE.BufferAttribute, THREE.InstancedInterleavedBuffer>();

/**
 * The drawn instance's matrix for an instanced mesh, or null for any other object. For patches that
 * need it before instancing (an instance's own sway phase); the renderer's own instancing reads the
 * same matrices from its own buffer.
 */
export function instanceMatrixNode(builder: NodeBuilder): Node<'mat4'> | null {
  const c = instanceColumns(builder);
  return c && mat4(c[0], c[1], c[2], c[3]);
}

/** Where the drawn instance stands in its mesh (its matrix's translation), or the origin. */
export function instanceOrigin(builder: NodeBuilder): V3 {
  const c = instanceColumns(builder);
  return c ? c[3].xyz : vec3(0);
}

/**
 * The drawn instance's matrix columns (see instanceMatrixNode): per-instance vertex attributes over
 * the matrices' own array. (A uniform buffer over the same array confused the renderer's own
 * instancing in the shadow pass: those shadows lost their instance's place.)
 */
function instanceColumns(builder: NodeBuilder): V4[] | null {
  const obj = builder.object as THREE.InstancedMesh;
  if (!obj?.isInstancedMesh) return null;
  const m = obj.instanceMatrix;
  let ib = matrixBuffers.get(m);
  if (!ib) matrixBuffers.set(m, (ib = new THREE.InstancedInterleavedBuffer(m.array, 16, 1)));
  // (The buffer shares the matrices' array: it is uploaded again whenever they change.)
  const buf = ib;
  OnBeforeFrameUpdate(() => {
    if (buf.version !== m.version) buf.version = m.version;
  });
  return [0, 1, 2, 3].map((k) => instancedBufferAttribute(buf, 'vec4', 16, k * 4) as V4);
}

/**
 * Pack a geometry's named attributes (those it has, not yet packed) into one interleaved vertex
 * buffer: a pipeline takes at most eight vertex buffers, and a painted, instanced or skinned mesh
 * with an attribute each would need more.
 */
export function packAttributes(geo: THREE.BufferGeometry, names: string[]) {
  const attrs = names.flatMap((name) => {
    const a = geo.getAttribute(name);
    return a && !(a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute && !(a as THREE.InstancedBufferAttribute).isInstancedBufferAttribute ? [{ name, a }] : [];
  });
  if (attrs.length < 2) return;
  const stride = attrs.reduce((n, { a }) => n + a.itemSize, 0), count = attrs[0].a.count;
  const data = new Float32Array(count * stride);
  let off = 0;
  for (const { a } of attrs) {
    for (let i = 0; i < count; i++) for (let c = 0; c < a.itemSize; c++) data[i * stride + off + c] = a.getComponent(i, c);
    off += a.itemSize;
  }
  const buf = new THREE.InterleavedBuffer(data, stride);
  off = 0;
  for (const { name, a } of attrs) {
    geo.setAttribute(name, new THREE.InterleavedBufferAttribute(buf, a.itemSize, off));
    off += a.itemSize;
  }
}

/**
 * Object space follows the mesh (the pattern moves with it); world space lines up across instances
 * and props (walls, rocks, trees).
 */
export type SurfaceSpace = 'object' | 'world';

export interface SurfaceFrame {
  /** Where the fragment lies (world space, or the geometry's own space before instancing). */
  pos: V3;
  /** Its geometry normal in the same space (not normalised). */
  nrm: V3;
  /** Carries a direction in that space into view space (for bump gradients). */
  toView(g: V3): V3;
}

/** The position and normal a surface pattern is laid in, for `space`. */
export function surfaceFrame(space: SurfaceSpace, builder: NodeBuilder): SurfaceFrame {
  const inst = instanceMatrixNode(builder);
  if (space === 'world') {
    // (The instance's and the model's own linear parts, as the pattern's projection axes see them.)
    const nrm = inst ? varying(mat3(modelWorldMatrix).mul(mat3(inst).mul(normalGeometry))) : varying(mat3(modelWorldMatrix).mul(normalLocal));
    return { pos: positionWorld, nrm, toView: (g) => mat3(cameraViewMatrix).mul(g) };
  }
  return {
    pos: inst ? positionGeometry : positionLocal,
    nrm: inst ? normalGeometry : varying(normalLocal),
    toView: (g) => mat3(cameraViewMatrix).mul(modelNormalMatrix.mul(g)),
  };
}

/**
 * A material's own property `name`, read while it draws: node materials that share one program (one
 * node graph) each show their own values.
 */
export const own = {
  f: (name: string) => materialReference(name, 'float') as unknown as F,
  v2: (name: string) => materialReference(name, 'vec2') as unknown as V2,
  v3: (name: string) => materialReference(name, 'vec3') as unknown as V3,
  color: (name: string) => materialReference(name, 'color') as unknown as V3,
};

/** A turn of the plane: the column-major 2 × 2 matrix (a, b | c, d) times p. */
export const rot2 = (p: V2, a: number, b: number, c: number, d: number): V2 => vec2(p.x.mul(a).add(p.y.mul(c)), p.x.mul(b).add(p.y.mul(d)));

/** Where the fragment lies in the geometry's own space, before instancing. */
export function objectPosition(builder: NodeBuilder): V3 {
  return (builder.object as THREE.InstancedMesh)?.isInstancedMesh ? positionGeometry : positionLocal;
}

// ─── The patched node materials ─────────────────────────────────────────────

type NodeMaterialClass = typeof MeshBasicNodeMaterial;
type Hook = 'position' | 'color' | 'alpha' | 'roughness' | 'normal' | 'emissive' | 'output';

/** A node material class that runs its plain material's patches (see the hooks above). */
function patchedClass(Base: NodeMaterialClass) {
  // (The renderer copies the plain material's own properties onto a fresh one before each build.)
  return class extends Base {
    private hooks: PatchHooks[] = [];

    override setup(builder: NodeBuilder) {
      this.hooks = patchHooks(this as unknown as THREE.Material, builder);
      super.setup(builder);
    }

    private run<T>(hook: Hook, v: T): T {
      for (const h of this.hooks) {
        const f = h[hook] as ((x: T) => T) | undefined;
        if (f) v = f(v);
      }
      return v;
    }

    private has(hook: keyof PatchHooks) {
      return this.hooks.some((h) => h[hook]);
    }

    override setupPosition(builder: NodeBuilder) {
      if (this.has('position')) positionLocal.assign(this.run('position', positionLocal as V3));
      return super.setupPosition(builder);
    }

    override setupDiffuseColor(builder: NodeBuilder) {
      for (const h of this.hooks) h.discard?.();
      super.setupDiffuseColor(builder);
      if (this.has('color')) diffuseColor.rgb.assign(this.run('color', diffuseColor.rgb.toVar() as V3));
      if (this.has('alpha')) diffuseColor.a.assign(this.run('alpha', diffuseColor.a as F));
    }

    override setupVariants(builder: NodeBuilder) {
      const self = this as unknown as { roughnessNode: F | null };
      if (this.has('roughness')) self.roughnessNode = this.run('roughness', self.roughnessNode ?? (materialRoughness as F));
      super.setupVariants(builder);
    }

    override setupNormal() {
      if (!this.has('normal')) return super.setupNormal();
      // The hooks start from the geometry's normal (flat, or smooth and turned to face the eye on a
      // back face), as the material's own would be without a normal map.
      return this.run('normal', Fn((builder: NodeBuilder) => ((builder as NodeBuilder & { isFlatShading(): boolean }).isFlatShading() ? normalViewGeometry : negateOnBackSide(normalViewGeometry)))().toVar() as V3);
    }

    override setupLighting(builder: NodeBuilder) {
      const self = this as unknown as { emissiveNode: V3 | null };
      if (this.has('emissive')) self.emissiveNode = this.run('emissive', self.emissiveNode ?? (materialEmissive as V3));
      const out = super.setupLighting(builder) as V3;
      return this.has('output') ? this.run('output', out) : out;
    }
  };
}

const PATCHED: [string, NodeMaterialClass][] = [
  ['MeshStandardMaterial', patchedClass(MeshStandardNodeMaterial as unknown as NodeMaterialClass)],
  ['MeshPhysicalMaterial', patchedClass(MeshPhysicalNodeMaterial as unknown as NodeMaterialClass)],
  ['MeshLambertMaterial', patchedClass(MeshLambertNodeMaterial as unknown as NodeMaterialClass)],
  ['MeshBasicMaterial', patchedClass(MeshBasicNodeMaterial)],
];

/** Let a renderer run patches: its node twins of the plain material types become the patched ones. */
export function installPatchedMaterials(renderer: Renderer) {
  for (const [type, cls] of PATCHED) renderer.library.materialNodes.set(type, cls as never);
}
