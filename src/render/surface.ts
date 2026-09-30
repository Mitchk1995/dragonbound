import * as THREE from 'three';
import { charTexture, groundTexture, noiseTexture, surfaceTexture, SURFACES, type SurfaceKind } from './textures';
import { paintAtlas, PAINTS, PAINT_TINT } from './paint';

// ─── Composable shader patches ──────────────────────────────────────────────

type Shader = THREE.WebGLProgramParametersWithUniforms;

export interface ShaderPatch {
  /** Identifies the generated program: patches with equal keys must produce equal GLSL. */
  key: string;
  /** Patches in the same slot replace each other (defaults to the key). */
  slot?: string;
  apply(shader: Shader): void;
}

const patches = new WeakMap<THREE.Material, ShaderPatch[]>();

/**
 * Add a shader patch to a material. Several patches (surface detail, see-through occlusion…)
 * stack: they all run in one onBeforeCompile and share one program cache key. Adding a patch
 * in a slot the material already has replaces it (e.g. new uniforms for the same program).
 * Material.clone() does not carry patches over; patch the clone.
 */
export function addPatch(mat: THREE.Material, patch: ShaderPatch) {
  let list = patches.get(mat);
  if (!list) {
    const l: ShaderPatch[] = (list = []);
    patches.set(mat, l);
    mat.onBeforeCompile = (shader) => {
      for (const p of l) p.apply(shader);
    };
    mat.customProgramCacheKey = () => l.map((p) => p.key).join('|');
  }
  const slot = patch.slot ?? patch.key;
  const i = list.findIndex((p) => (p.slot ?? p.key) === slot);
  if (i >= 0) list[i] = patch;
  else list.push(patch);
  mat.needsUpdate = true;
}

export const patchKeys = (mat: THREE.Material) => (patches.get(mat) ?? []).map((p) => p.key);

// ─── Surface detail: triplanar albedo + bump ────────────────────────────────

/**
 * Object space follows the mesh (the pattern moves with it);
 * world space lines up across instances and props (walls, rocks, trees).
 */
export type SurfaceSpace = 'object' | 'world';

const VERT_WORLD = `
  {
    vec4 sw = vec4(transformed, 1.0);
    mat3 sm = mat3(modelMatrix);
    #ifdef USE_INSTANCING
      sw = instanceMatrix * sw;
      sm = sm * mat3(instanceMatrix);
    #endif
    vSurfPos = (modelMatrix * sw).xyz;
    vSurfNrm = sm * objectNormal;
    vSurfAx = vec3(viewMatrix[0]);
    vSurfAy = vec3(viewMatrix[1]);
    vSurfAz = vec3(viewMatrix[2]);
  }`;

const VERT_OBJECT = `
  vSurfPos = transformed;
  vSurfNrm = objectNormal;
  vSurfAx = normalMatrix * vec3(1.0, 0.0, 0.0);
  vSurfAy = normalMatrix * vec3(0.0, 1.0, 0.0);
  vSurfAz = normalMatrix * vec3(0.0, 0.0, 1.0);`;

const VARYINGS = `
  varying vec3 vSurfPos;
  varying vec3 vSurfNrm;
  varying vec3 vSurfAx;
  varying vec3 vSurfAy;
  varying vec3 vSurfAz;`;

/**
 * Bump from the height gradient measured in texture space (finite differences), carried to view
 * space along the projection axes. Unlike screen-space derivative bump it has no 2×2-pixel
 * blockiness or dashed moiré at grazing angles.
 */
const FRAG_BUMP = `
  const float SURF_E = 1.5 / 256.0;
  vec3 surfBump(vec3 n, vec3 grad, float strength) {
    vec3 g = grad.x * vSurfAx + grad.y * vSurfAy + grad.z * vSurfAz;
    g -= dot(g, n) * n;
    return normalize(n - g * strength);
  }`;

function commonInject(shader: Shader, space: SurfaceSpace, fragDecl: string) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VARYINGS}`)
    .replace('#include <project_vertex>', `#include <project_vertex>\n${space === 'world' ? VERT_WORLD : VERT_OBJECT}`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${VARYINGS}\n${FRAG_BUMP}\n${fragDecl}`);
}

/**
 * Albedo, roughness and (when `bump`) bump from `float surfSample(out vec3 grad)`: a height in
 * 0..1 and its gradient along the projection axes, evaluated after the colour chunks.
 */
function heightInject(shader: Shader, bump = true) {
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec3 surfGrad;
      float surfH = surfSample(surfGrad);
      diffuseColor.rgb *= clamp(1.0 + (surfH - 0.5) * 2.0 * uSurfAlbedo, 0.0, 2.0);`,
    )
    .replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + (0.5 - surfH) * 0.3 * uSurfAlbedo, 0.05, 1.0);`,
    );
  if (bump) {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      normal = surfBump(normal, surfGrad, uSurfBump * 0.12 / uSurfScale);`,
    );
  }
}

/**
 * Apply a procedural surface to a MeshStandardMaterial (other material types are left alone).
 * A kind with no bump samples albedo only; one with neither leaves the material untouched.
 */
export function applySurface(mat: THREE.Material, kind: SurfaceKind, space: SurfaceSpace = 'object', scaleMul = 1) {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return;
  const p = SURFACES[kind];
  if (p.albedo === 0 && p.bump === 0) return;
  const bump = p.bump > 0;
  const uniforms = {
    uSurfTex: { value: surfaceTexture(kind) },
    uSurfScale: { value: p.scale * scaleMul },
    uSurfAlbedo: { value: p.albedo },
    uSurfBump: { value: p.bump },
  };
  // Flat: one fetch per plane. Bumped: two more per plane for the gradient.
  const plane = bump
    ? `vec3 surfPlane(vec2 uv) {
        float h = texture2D(uSurfTex, uv).r;
        return vec3(h, texture2D(uSurfTex, uv + vec2(SURF_E, 0.0)).r - h, texture2D(uSurfTex, uv + vec2(0.0, SURF_E)).r - h);
      }`
    : 'vec3 surfPlane(vec2 uv) { return vec3(texture2D(uSurfTex, uv).r, 0.0, 0.0); }';
  addPatch(mat, {
    key: `surface:${space}${bump ? '' : ':flat'}`,
    slot: 'surface',
    apply(shader) {
      Object.assign(shader.uniforms, uniforms);
      commonInject(
        shader,
        space,
        `uniform sampler2D uSurfTex;
        uniform float uSurfScale;
        uniform float uSurfAlbedo;
        uniform float uSurfBump;
        ${plane}
        float surfSample(out vec3 grad) {
          vec3 w = pow(abs(normalize(vSurfNrm)), vec3(4.0));
          w /= (w.x + w.y + w.z);
          vec3 p = vSurfPos * uSurfScale;
          vec3 px = surfPlane(p.yz), py = surfPlane(p.xz + 0.37), pz = surfPlane(p.xy + 0.71);
          grad = (vec3(0.0, px.y, px.z) * w.x + vec3(py.y, 0.0, py.z) * w.y + vec3(pz.y, pz.z, 0.0) * w.z) * (uSurfScale / SURF_E);
          return px.x * w.x + py.x * w.y + pz.x * w.z;
        }`,
      );
      heightInject(shader, bump);
    },
  });
}

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
    apply(shader) {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec4 uGradeRow;\nvarying float vGrade;')
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>\n${space === 'root' ? 'vGrade = dot(uGradeRow, modelMatrix * vec4(transformed, 1.0));' : 'vGrade = transformed.y;'}`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uGradeLow;\nuniform float uGradeFrom;\nuniform float uGradeTo;\nvarying float vGrade;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(uGradeLow, 1.0, smoothstep(uGradeFrom, uGradeTo, vGrade));');
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

// ─── Characters, creatures and gear: painted albedo ─────────────────────────

/**
 * How a character material is painted (colour only: no bump, normals untouched).
 * - `w`: weights of the character atlas channels (mottle, vertical brushing, cloth folds,
 *   scales); the texture swings the base colour by about ±0.8 × weight.
 * - `edge`: lightens (or, negative, darkens) a thin band round every flat face and the whole of
 *   thin bevel faces: the painted worn edge of stylized plate, stone and bone.
 * - `grad`: each face lighter at its top and darker at its foot; upward faces take the light,
 *   downward faces the shade.
 * - `moss`: tints up-facing, lighter patches moss green (stone).
 * - `scale`: pattern size multiplier (scales are finer than leather blotches).
 */
export interface CharPaint {
  w: [number, number, number, number];
  edge: number;
  grad: number;
  moss?: number;
  scale?: number;
}

/** The recipes, large-scale and low-to-medium contrast: readable from the gameplay camera, never noisy. */
export const CHAR_PAINTS = {
  metal: { w: [0.04, 0.1, 0, 0], edge: 0.2, grad: 0.2 },
  trim: { w: [0, 0.06, 0, 0], edge: 0.22, grad: 0.14 },
  darkMetal: { w: [0.03, 0.08, 0, 0], edge: 0.3, grad: 0.12 },
  leather: { w: [0.2, 0, 0, 0], edge: -0.12, grad: 0.08 },
  cloth: { w: [0.05, 0, 0.34, 0], edge: 0.05, grad: 0.14 },
  skin: { w: [0.05, 0, 0, 0], edge: 0, grad: 0.04 },
  hair: { w: [0, 0.12, 0, 0], edge: 0.1, grad: 0.12, scale: 1.6 },
  hide: { w: [0.16, 0, 0, 0], edge: 0.04, grad: 0.06 },
  soft: { w: [0.1, 0, 0, 0], edge: 0.04, grad: 0.06 },
  wood: { w: [0.05, 0.24, 0, 0], edge: 0.08, grad: 0.08 },
  bone: { w: [0.2, 0, 0, 0], edge: 0.1, grad: 0.24 },
  stone: { w: [0.3, 0, 0, 0], edge: 0.18, grad: 0.12, moss: 0.8 },
  scales: { w: [0.06, 0, 0, 0.34], edge: 0.1, grad: 0.1, scale: 1.6 },
  softScales: { w: [0.04, 0, 0, 0.2], edge: 0.08, grad: 0.08, scale: 1.6 },
  membrane: { w: [0.16, 0, 0.08, 0], edge: 0.1, grad: 0.1 },
} satisfies Record<string, CharPaint>;

export type CharPaintKind = keyof typeof CHAR_PAINTS;

/** Pattern tile, in model units, for a model of scale 1 (hero-sized). */
const CHAR_TILE = 1.2;
/** Width of the painted edge band, in model units, at scale 1. */
const CHAR_EDGE = 0.03;

/**
 * Give a model's geometry what the painted shader reads, once at load time:
 * - `aRest`: each vertex in the model root's frame at rest, so patterns run on unbroken across
 *   rig nodes and merged parts (no restart at every joint) yet move rigidly with each limb,
 *   and RestN, its flat face normal in that frame;
 * - `aFace`: its place on its flat face (u, v from the face's corner, face width, height), with
 *   v up the face on side faces and every face oriented the same way (no flipped streaks).
 * Returns a non-indexed copy; the input is left alone.
 */
export function prepareCharGeometry(src: THREE.BufferGeometry, rest: THREE.Matrix4): THREE.BufferGeometry {
  const geo = src.index ? src.toNonIndexed() : src.clone();
  const pos = geo.attributes.position;
  const n = pos.count, tris = Math.floor(n / 3);
  const P = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(rest);
    P[i * 3] = v.x;
    P[i * 3 + 1] = v.y;
    P[i * 3 + 2] = v.z;
  }
  // Group triangles into flat faces: same plane and sharing a corner.
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const normals: THREE.Vector3[] = [];
  const keys: string[] = [];
  const parent = Int32Array.from({ length: tris }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const firstAt = new Map<string, number>();
  const q = (x: number) => Math.round(x * 2000);
  for (let t = 0; t < tris; t++) {
    a.fromArray(P, t * 9);
    b.fromArray(P, t * 9 + 3);
    c.fromArray(P, t * 9 + 6);
    const nn = b.clone().sub(a).cross(c.clone().sub(a));
    const len = nn.length();
    if (len < 1e-10) {
      normals.push(new THREE.Vector3(0, 1, 0));
      keys.push(`deg${t}`);
      continue;
    }
    nn.divideScalar(len);
    normals.push(nn);
    const key = `${Math.round(nn.x * 200)},${Math.round(nn.y * 200)},${Math.round(nn.z * 200)},${Math.round(nn.dot(a) * 400)}`;
    keys.push(key);
    for (let k = 0; k < 3; k++) {
      const pk = `${key}|${q(P[t * 9 + k * 3])},${q(P[t * 9 + k * 3 + 1])},${q(P[t * 9 + k * 3 + 2])}`;
      const other = firstAt.get(pk);
      if (other === undefined) firstAt.set(pk, t);
      else parent[find(t)] = find(other);
    }
  }
  const groups = new Map<number, number[]>();
  for (let t = 0; t < tris; t++) {
    const r = find(t);
    const g = groups.get(r) ?? [];
    g.push(t);
    groups.set(r, g);
  }
  const face = new Float32Array(n * 4), fn = new Float32Array(n * 3);
  const U = new THREE.Vector3(), V = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3(1, 0, 0);
  for (const [r, list] of groups) {
    const nn = normals[r];
    if (Math.abs(nn.y) < 0.7) {
      V.copy(up).addScaledVector(nn, -nn.y).normalize();
      U.crossVectors(V, nn);
    } else {
      U.copy(right).addScaledVector(nn, -nn.x).normalize();
      V.crossVectors(nn, U);
    }
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const t of list) for (let k = 0; k < 3; k++) {
      v.fromArray(P, (t * 3 + k) * 3);
      const pu = v.dot(U), pv = v.dot(V);
      u0 = Math.min(u0, pu);
      u1 = Math.max(u1, pu);
      v0 = Math.min(v0, pv);
      v1 = Math.max(v1, pv);
    }
    for (const t of list) for (let k = 0; k < 3; k++) {
      const i = t * 3 + k;
      v.fromArray(P, i * 3);
      face.set([v.dot(U) - u0, v.dot(V) - v0, u1 - u0, v1 - v0], i * 4);
      nn.toArray(fn, i * 3);
    }
  }
  geo.setAttribute('aRest', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('aFace', new THREE.BufferAttribute(face, 4));
  geo.setAttribute('aRestN', new THREE.BufferAttribute(fn, 3));
  return geo;
}

const paintVec = (p: CharPaint) => ({ w: new THREE.Vector4(...p.w), x: new THREE.Vector4(p.edge, p.grad, p.moss ?? 0, p.scale ?? 1) });

/** Per-vertex recipe attributes for merged parts that mix several recipes in one material. */
export function paintAttributes(geo: THREE.BufferGeometry, p: CharPaint | null) {
  const n = geo.attributes.position.count;
  const w = new Float32Array(n * 4), x = new Float32Array(n * 4);
  if (p) {
    const { w: pw, x: px } = paintVec(p);
    for (let i = 0; i < n; i++) {
      pw.toArray(w, i * 4);
      px.toArray(x, i * 4);
    }
  }
  geo.setAttribute('aPaintW', new THREE.BufferAttribute(w, 4));
  geo.setAttribute('aPaintX', new THREE.BufferAttribute(x, 4));
}

interface CharUniforms {
  uCharTex: { value: THREE.Texture };
  uCharScale: { value: number };
  uCharEdgeW: { value: number };
  uCharGain: { value: number };
  uPaintW: { value: THREE.Vector4 };
  uPaintX: { value: THREE.Vector4 };
}

/**
 * Paint a character/creature/gear material. `paint` is its recipe, or 'vertex' when the
 * geometry carries per-vertex recipes (merged fixed-colour parts). `size` scales the pattern and
 * edge band with the model (1 = hero-sized). Needs geometry from prepareCharGeometry. One
 * texture fetch per pixel (the shared character atlas), box-projected on the face's dominant
 * rest-frame axis with V up on side faces.
 */
export function applyCharPaint(mat: THREE.Material, paint: CharPaint | 'vertex', size = 1) {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return;
  const per = paint === 'vertex';
  const init = paintVec(per ? { w: [0, 0, 0, 0], edge: 0, grad: 0 } : paint);
  const uniforms: CharUniforms = {
    uCharTex: { value: charTexture() },
    uCharScale: { value: 1 / (CHAR_TILE * size) },
    uCharEdgeW: { value: CHAR_EDGE * size },
    uCharGain: { value: 1 },
    uPaintW: { value: init.w },
    uPaintX: { value: init.x },
  };
  mat.userData.charPaint = uniforms;
  const W = per ? 'vPaintW' : 'uPaintW', X = per ? 'vPaintX' : 'uPaintX';
  addPatch(mat, {
    key: `cpaint:${per ? 'vertex' : 'uniform'}`,
    slot: 'surface',
    apply(shader) {
      Object.assign(shader.uniforms, uniforms);
      const vary = `varying vec3 vRest;\nvarying vec3 vRestN;\nvarying vec4 vFace;\n${per ? 'varying vec4 vPaintW;\nvarying vec4 vPaintX;' : ''}`;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nattribute vec3 aRest;\nattribute vec3 aRestN;\nattribute vec4 aFace;\n${per ? 'attribute vec4 aPaintW;\nattribute vec4 aPaintX;' : ''}\n${vary}`)
        .replace('#include <project_vertex>', `#include <project_vertex>\nvRest = aRest;\nvRestN = aRestN;\nvFace = aFace;\n${per ? 'vPaintW = aPaintW;\nvPaintX = aPaintX;' : ''}`);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          ${vary}
          uniform sampler2D uCharTex;
          uniform float uCharScale;
          uniform float uCharEdgeW;
          uniform float uCharGain;
          uniform vec4 uPaintW;
          uniform vec4 uPaintX;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            // Flat face normal in the rest frame (an attribute: derivative normals break up into
            // speckle on faces seen edge-on).
            vec3 rn = normalize(vRestN + vec3(0.0, 1e-6, 0.0));
            vec3 an = abs(rn);
            vec4 pw = ${W}, px = ${X};
            vec3 q = vRest * (uCharScale * px.w);
            vec2 cuv = an.y >= max(an.x, an.z) ? q.xz : (an.x > an.z ? q.zy : q.xy);
            vec4 ct = texture2D(uCharTex, cuv) - 0.5;
            float cv = dot(ct, pw) * 2.0;
            // Painted worn edge round each flat face; thin bevel faces are all edge.
            float faceOk = step(1e-6, vFace.z * vFace.w);
            float fe = min(min(vFace.x, vFace.z - vFace.x), min(vFace.y, vFace.w - vFace.y));
            float thin = min(vFace.z, vFace.w);
            float fw = min(uCharEdgeW, 0.3 * thin);
            float edge = faceOk * max(1.0 - smoothstep(fw * 0.35, fw, fe), 1.0 - smoothstep(uCharEdgeW * 1.2, uCharEdgeW * 1.8, thin));
            // Light from above: side faces lighter at the top, up faces lit, down faces shaded.
            float side = 1.0 - smoothstep(0.55, 0.8, an.y);
            float gy = faceOk * (vFace.y / max(vFace.w, 1e-6) - 0.5);
            float grad = mix(sign(rn.y) * 0.5, gy, side);
            diffuseColor.rgb *= clamp(1.0 + (cv + px.x * edge + px.y * grad) * uCharGain, 0.35, 1.8);
            if (px.z > 0.0) {
              float moss = smoothstep(0.1, 0.24, ct.r + rn.y * 0.3 - 0.12) * px.z * uCharGain;
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.22, 0.05) * (0.8 + ct.r), moss * 0.6);
            }
          }`,
        );
    },
  });
}

/** Change a painted material's recipe (gear learns its palette after cloning). */
export function setCharPaint(mat: THREE.Material, paint: CharPaint) {
  const u = mat.userData.charPaint as CharUniforms | undefined;
  if (!u) return;
  const v = paintVec(paint);
  u.uPaintW.value.copy(v.w);
  u.uPaintX.value.copy(v.x);
}

/** Scale every painted material's contrast under `root` (item icons paint a little softer). */
export function setPaintGain(root: THREE.Object3D, gain: number) {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const u = (o.material as THREE.Material).userData.charPaint as CharUniforms | undefined;
    if (u) u.uCharGain.value = gain;
  });
}

/**
 * Painted colour drifts on the walkable floor rock (flat, low, rock-splatted ground only), from
 * slow noise fetches: in the lair a fine, low-contrast ash tone (a slightly greyer, lighter film
 * on the ruddy rock; the soot around the roost and the seams is painted into the terrain's
 * vertex colour), in the mine ochre mineral stains and cool damp patches. Nothing elsewhere.
 */
function floorVariation(kind: 'lair' | 'mine' | null) {
  if (!kind) return '';
  const tint = kind === 'lair'
    ? `float nf = texture2D(uMixTex, vSurfPos.xz * 0.19 + vec2(0.37, 0.11)).r;
       float ash = smoothstep(0.38, 0.8, nf * 0.65 + n1 * 0.35) * floorW;
       vec3 ashCol = vec3(dot(diffuseColor.rgb, vec3(0.3, 0.5, 0.2))) * vec3(1.14, 1.06, 1.0);
       diffuseColor.rgb = mix(diffuseColor.rgb, ashCol, ash * 0.42);
       diffuseColor.rgb *= 1.0 + (n2 - 0.5) * 0.2 * floorW;`
    : `float stain = smoothstep(0.6, 0.66, n1) * floorW;
       float damp = smoothstep(0.32, 0.26, n2) * floorW;
       diffuseColor.rgb *= mix(vec3(1.0), vec3(1.2, 0.98, 0.74), stain);
       diffuseColor.rgb *= mix(vec3(1.0), vec3(0.8, 0.86, 0.96), damp);`;
  return `{
    float rockW = vSplat.w / max(0.001, dot(vSplat, vec4(1.0)));
    float floorW = rockW * (1.0 - smoothstep(0.2, 0.6, vSurfPos.y)) * smoothstep(0.8, 0.95, normalize(vSurfNrm).y);
    float n1 = texture2D(uMixTex, vSurfPos.xz * 0.045 + vec2(0.61, 0.27)).r;
    float n2 = texture2D(uMixTex, vSurfPos.xz * 0.08 + vec2(0.23, 0.83)).r;
    ${tint}
  }`;
}

/**
 * Ground: a four-channel painted atlas (dirt, grass, flagstone, smooth floor rock) projected
 * top-down in world space and blended per vertex by the `aSplat` attribute. Colour only (no
 * bump). Anti-tiling: the atlas is sampled at two scales (the second rotated 37°) and the two are
 * blended by a low-frequency noise mask, so no 4-unit repeat is visible (small flagstones give way
 * to big slabs, and back). Steep faces take the painted rock strata (V = up, so bands stay level).
 */
/** `cliff`: colour steep faces blend to (slope-based texturing: mesa tops keep their grass). */
export function applyGround(mat: THREE.MeshStandardMaterial, lava = 0, topShade = 1, cliff: number | null = null, topRange: [number, number] = [0.8, 3.4]) {
  const uniforms = {
    uLava: { value: lava },
    uTopShade: { value: topShade },
    uTopRange: { value: new THREE.Vector2(...topRange) },
    uCliff: { value: new THREE.Color(cliff ?? 0x6a5e52) },
    uGroundTex: { value: groundTexture() },
    uCliffTex: { value: paintAtlas(PAINTS.rock.atlas) },
    uPaintAmt: { value: 0.28 },
    uMixTex: { value: noiseTexture() },
    // Painted tonal variation only (no bump). The value (surfH) still drives the cliff tint and
    // the lava crevice glow below.
    uSurfScale: { value: 0.25 },
    uSurfAlbedo: { value: 0.42 },
    uSurfBump: { value: 0 },
  };
  addPatch(mat, {
    key: `ground3${lava > 0 ? ':lava' : ''}${topShade < 1 ? ':shade' : ''}${cliff !== null ? ':cliff' : ''}`,
    apply(shader) {
      Object.assign(shader.uniforms, uniforms);
      commonInject(
        shader,
        'world',
        `uniform sampler2D uGroundTex;
        uniform sampler2D uCliffTex;
        uniform sampler2D uMixTex;
        uniform float uSurfScale;
        uniform float uSurfAlbedo;
        uniform float uSurfBump;
        uniform float uLava;
        uniform float uPaintAmt;
        varying vec4 vSplat;
        // 37° rotation (column-major) for the second, larger-scale sample.
        const mat2 GROT = mat2(0.7986, 0.6018, -0.6018, 0.7986);
        const float GSCALE2 = 0.348;
        float surfSample(out vec3 grad) {
          grad = vec3(0.0);
          vec4 k = vSplat / max(0.001, dot(vSplat, vec4(1.0)));
          vec3 w = pow(abs(normalize(vSurfNrm)), vec3(6.0));
          w /= (w.x + w.y + w.z);
          // Top: the splatted atlas at two scales, blended by a slow noise mask.
          vec2 p = vSurfPos.xz;
          vec4 t1 = texture2D(uGroundTex, p * uSurfScale);
          vec4 t2 = texture2D(uGroundTex, GROT * p * (uSurfScale * GSCALE2) + vec2(0.31, 0.57));
          float m = smoothstep(0.36, 0.64, texture2D(uMixTex, p * 0.019 + vec2(0.13, 0.71)).r);
          vec4 t = mix(t1, t2, m);
          // Paving is laid square to the world and never cross-faded (two overlaid layouts read
          // as cracked mud): one unrotated sample with an 8-unit tile.
          if (k.b > 0.001) t.b = texture2D(uGroundTex, p * (uSurfScale * 0.5)).b;
          float h = dot(t, k);
          // Most ground is flat: skip the side projections there.
          if (w.y > 0.985) return h;
          // Steep faces (cliffs, shore banks): painted rock strata on the vertical planes.
          float s = uSurfScale * 0.8;
          float rx = texture2D(uCliffTex, vSurfPos.zy * s).g, rz = texture2D(uCliffTex, vSurfPos.xy * s).g;
          return h * w.y + rx * w.x + rz * w.z;
        }`,
      );
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aSplat;\nvarying vec4 vSplat;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvSplat = aSplat;');
      heightInject(shader, false);
      // Painterly: warm lights, cool darks.
      shader.fragmentShader = shader.fragmentShader.replace(
        'diffuseColor.rgb *= clamp(1.0 + (surfH - 0.5) * 2.0 * uSurfAlbedo, 0.0, 2.0);',
        `diffuseColor.rgb *= clamp(1.0 + (surfH - 0.5) * 2.0 * uSurfAlbedo, 0.0, 2.0);
        { float paintV = surfH; diffuseColor.rgb *= ${PAINT_TINT}; }
        ${floorVariation(lava > 0 ? 'lair' : topShade < 1 ? 'mine' : null)}`,
      );
      if (cliff !== null) {
        // Steep faces take the cliff rock colour whatever the vertex colour (tops stay grassy).
        shader.fragmentShader = shader.fragmentShader
          .replace('uniform float uLava;', 'uniform float uLava;\nuniform vec3 uCliff;')
          .replace(
            '#include <roughnessmap_fragment>',
            '#include <roughnessmap_fragment>\n{ float steep = smoothstep(0.42, 0.78, 1.0 - abs(normalize(vSurfNrm).y)); diffuseColor.rgb = mix(diffuseColor.rgb, uCliff * (0.75 + surfH * 0.5), steep); }',
          );
      }
      if (topShade < 1) {
        // Cave rock: painted strata (level bands of rock, each its own tone, a dark crease under
        // each band) that wander gently, so the faceted rock reads as layered stone rather than
        // one flat-shaded sheet; the higher the rock, the deeper in shadow (walls rise into darkness).
        shader.fragmentShader = shader.fragmentShader
          .replace('uniform float uLava;', 'uniform float uLava;\nuniform float uTopShade;\nuniform vec2 uTopRange;')
          .replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
            {
              float sb = (vSurfPos.y + (texture2D(uMixTex, vSurfPos.xz * 0.06 + vec2(0.4, 0.2)).r - 0.5) * 1.1) / 0.5;
              float id = floor(sb), fb = sb - id;
              float onRock = smoothstep(0.5, 1.1, vSurfPos.y);
              float tone = fract(sin(id * 12.9898 + 4.1) * 43758.5453) - 0.5;
              float crease = 1.0 - smoothstep(0.0, 0.14, fb);
              diffuseColor.rgb *= 1.0 + onRock * (tone * 0.22 + fb * 0.08 - crease * 0.34);
              diffuseColor.rgb *= mix(1.0, uTopShade, smoothstep(uTopRange.x, uTopRange.y, vSurfPos.y));
            }`,
          );
      }
      if (lava > 0) {
        // Lava pools in the floor rock's deepest fissures, pulsing slowly. Emissive, so it glows
        // regardless of lighting (and feeds bloom).
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            float rockW = vSplat.w / max(0.001, dot(vSplat, vec4(1.0)));
            float crev = smoothstep(0.34, 0.16, surfH) * rockW;
            float pulse = 0.75 + 0.25 * sin(vSurfPos.x * 0.7 + vSurfPos.z * 0.5);
            totalEmissiveRadiance += vec3(1.0, 0.32, 0.06) * crev * pulse * 2.2 * uLava;
          }`,
        );
      }
    },
  });
}

// ─── Props ──────────────────────────────────────────────────────────────────

/**
 * The detail a code-built prop part gets from its colour: low-saturation grey (masonry, rock) is
 * stone; everything else (wood, cloth, metal, bone) stays clean flat colour.
 */
export function propSurface(c: THREE.Color): SurfaceKind | null {
  // Judge the colour as authored (sRGB): in linear space warm greys look saturated and brown.
  const hsl = c.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
  return hsl.s < 0.12 && hsl.l > 0.2 && hsl.l < 0.8 ? 'stone' : null;
}
