import * as THREE from 'three';
import { charTexture, forgeTexture, groundTexture, noiseTexture, surfaceTexture, SURFACES, type SurfaceKind } from './textures';
import { PAINT_TINT } from './paint';
import { ROCK_GLSL, rockAtlas, ROCK_TILE } from './rock';

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
    apply(shader) {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vHsY;')
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          #ifdef USE_INSTANCING
            vHsY = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).y;
          #else
            vHsY = (modelMatrix * vec4(transformed, 1.0)).y;
          #endif`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uHsLow;\nuniform vec2 uHsRange;\nvarying float vHsY;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(1.0, uHsLow, sqrt(smoothstep(uHsRange.x, uHsRange.y, vHsY)));');
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
 * - `forge`: forged metal (0..1, from the forge atlas): hammered dishes and fine draw-marks,
 *   a bright worn lip on every edge and bevel, soot and grime settling along the foot of each
 *   plate (where it meets the plate below) and in blotches, and a tone of its own per plate;
 *   the sheen varies with it (grime dull, worn edges polished).
 */
export interface CharPaint {
  w: [number, number, number, number];
  edge: number;
  grad: number;
  moss?: number;
  scale?: number;
  forge?: number;
}

/** The recipes, large-scale and low-to-medium contrast: readable from the gameplay camera, never noisy. */
export const CHAR_PAINTS = {
  metal: { w: [0.03, 0.05, 0, 0], edge: 0.3, grad: 0.16, forge: 1 },
  trim: { w: [0, 0.06, 0, 0], edge: 0.22, grad: 0.14 },
  darkMetal: { w: [0.03, 0.05, 0, 0], edge: 0.3, grad: 0.12, forge: 0.8 },
  leather: { w: [0.2, 0, 0, 0], edge: -0.12, grad: 0.08 },
  cloth: { w: [0.05, 0, 0.34, 0], edge: 0.05, grad: 0.14 },
  skin: { w: [0.05, 0, 0, 0], edge: 0, grad: 0.04 },
  hair: { w: [0, 0.12, 0, 0], edge: 0.1, grad: 0.12, scale: 1.6 },
  hide: { w: [0.16, 0, 0, 0], edge: 0.04, grad: 0.06 },
  soft: { w: [0.1, 0, 0, 0], edge: 0.04, grad: 0.06 },
  wood: { w: [0.05, 0.24, 0, 0], edge: 0.08, grad: 0.08 },
  bone: { w: [0.2, 0, 0, 0], edge: 0.1, grad: 0.24 },
  // The legendary set's big bone plates: broadly mottled, pale worn edges, shadowed at the foot (no grain: it streaks).
  wyrmbone: { w: [0.3, 0.03, 0, 0], edge: 0.18, grad: 0.25, scale: 1.3 },
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
  // A random tone per authored part (each plate is its own part until parts merge), keyed to
  // where it sits, so every copy of a model paints each plate the same.
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    cx += P[i * 3];
    cy += P[i * 3 + 1];
    cz += P[i * 3 + 2];
  }
  const k = n ? Math.sin((cx / n) * 127.1 + (cy / n) * 311.7 + (cz / n) * 74.7) * 43758.5453 : 0;
  geo.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(k - Math.floor(k)), 1));
  return geo;
}

const paintVec = (p: CharPaint) => ({
  w: new THREE.Vector4(...p.w),
  x: new THREE.Vector4(p.edge, p.grad, p.moss ?? 0, p.scale ?? 1),
  y: new THREE.Vector4(p.forge ?? 0, 0, 0, 0),
});

/** Per-vertex recipe attributes for merged parts that mix several recipes in one material. */
export function paintAttributes(geo: THREE.BufferGeometry, p: CharPaint | null) {
  const n = geo.attributes.position.count;
  const w = new Float32Array(n * 4), x = new Float32Array(n * 4), y = new Float32Array(n * 4);
  if (p) {
    const { w: pw, x: px, y: py } = paintVec(p);
    for (let i = 0; i < n; i++) {
      pw.toArray(w, i * 4);
      px.toArray(x, i * 4);
      py.toArray(y, i * 4);
    }
  }
  geo.setAttribute('aPaintW', new THREE.BufferAttribute(w, 4));
  geo.setAttribute('aPaintX', new THREE.BufferAttribute(x, 4));
  geo.setAttribute('aPaintY', new THREE.BufferAttribute(y, 4));
}

interface CharUniforms {
  uCharTex: { value: THREE.Texture };
  uForgeTex: { value: THREE.Texture };
  uPaintY: { value: THREE.Vector4 };
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
    uForgeTex: { value: forgeTexture() },
    uPaintY: { value: init.y },
    uCharScale: { value: 1 / (CHAR_TILE * size) },
    uCharEdgeW: { value: CHAR_EDGE * size },
    uCharGain: { value: 1 },
    uPaintW: { value: init.w },
    uPaintX: { value: init.x },
  };
  mat.userData.charPaint = uniforms;
  const W = per ? 'vPaintW' : 'uPaintW', X = per ? 'vPaintX' : 'uPaintX', Y = per ? 'vPaintY' : 'uPaintY';
  addPatch(mat, {
    key: `cpaint:${per ? 'vertex' : 'uniform'}`,
    slot: 'surface',
    apply(shader) {
      Object.assign(shader.uniforms, uniforms);
      const vary = `varying vec3 vRest;\nvarying vec3 vRestN;\nvarying vec4 vFace;\nvarying float vPart;\n${per ? 'varying vec4 vPaintW;\nvarying vec4 vPaintX;\nvarying vec4 vPaintY;' : ''}`;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nattribute vec3 aRest;\nattribute vec3 aRestN;\nattribute vec4 aFace;\nattribute float aPart;\n${per ? 'attribute vec4 aPaintW;\nattribute vec4 aPaintX;\nattribute vec4 aPaintY;' : ''}\n${vary}`)
        .replace('#include <project_vertex>', `#include <project_vertex>\nvRest = aRest;\nvRestN = aRestN;\nvFace = aFace;\nvPart = aPart;\n${per ? 'vPaintW = aPaintW;\nvPaintX = aPaintX;\nvPaintY = aPaintY;' : ''}`);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          ${vary}
          uniform sampler2D uCharTex;
          uniform sampler2D uForgeTex;
          uniform vec4 uPaintY;
          uniform float uCharScale;
          uniform float uCharEdgeW;
          uniform float uCharGain;
          uniform vec4 uPaintW;
          uniform vec4 uPaintX;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float cpRough = 0.0;
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
            float forge = ${Y}.x;
            if (forge > 0.0) {
              // Forged metal: hammered dishes and draw-marks, a polished worn lip on every edge,
              // soot settling along each plate's foot and in blotches, a tone per plate.
              vec4 ft = texture2D(uForgeTex, cuv) - 0.5;
              float footD = mix(1.0, vFace.y, side * faceOk);
              float foot = (1.0 - smoothstep(0.0, 0.09, footD)) * side + step(rn.y, -0.6) * 0.5;
              float grime = clamp(foot * (0.75 + ft.b) + smoothstep(0.05, 0.4, ft.b) * 0.6, 0.0, 1.0);
              float tone = (fract(vPart * 7.13) - 0.5) * 0.2;
              float f = ft.r * 0.42 + ft.g * 0.14 + ft.a * 0.05 + tone + edge * 0.32 - grime * 0.36;
              diffuseColor.rgb *= clamp(1.0 + f * forge * uCharGain, 0.35, 1.8);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15))), grime * forge * 0.35 * uCharGain);
              cpRough = (grime * 0.3 - edge * 0.12 + ft.r * 0.25 + ft.a * 0.15) * forge * uCharGain;
            }
            if (px.z > 0.0) {
              float moss = smoothstep(0.1, 0.24, ct.r + rn.y * 0.3 - 0.12) * px.z * uCharGain;
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.22, 0.05) * (0.8 + ct.r), moss * 0.6);
            }
          }`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + cpRough, 0.05, 1.0);',
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
  u.uPaintY.value.copy(v.y);
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

/** Height of one cave-rock terrace (terrain.ts builds them; the riser shading below keys to it). */
export const CAVE_TERRACE = 1.0;

/**
 * Cave walls' terrace risers (inside the rock block: needs rockK, gn, vSurfPos): dark in the
 * crease at their foot, catching light on the lip at their top, so each terrace reads as a slab
 * of rock standing on the one below.
 */
const CAVE_RISERS = `
              float steepF = smoothstep(0.3, 0.65, 1.0 - abs(gn.y)) * smoothstep(0.5, 1.1, vSurfPos.y);
              float tf = fract(vSurfPos.y / ${CAVE_TERRACE.toFixed(2)});
              diffuseColor.rgb *= mix(1.0, mix(0.62, 1.1, smoothstep(0.02, 0.8, tf)), steepF);
`;

/**
 * Ground: a four-channel painted atlas (dirt, grass, flagstone, smooth floor rock) projected
 * top-down in world space and blended per vertex by the `aSplat` attribute. Colour only (no
 * bump). Anti-tiling: the atlas is sampled at two scales (the second rotated 37°) and the two are
 * blended by a low-frequency noise mask, so no 4-unit repeat is visible (small flagstones give way
 * to big slabs, and back). Steep faces (and all raised rock where the relief has no grassy top)
 * take the shared painted rock (rock.ts: strata blocks, cracks, grain), projected triplanar from
 * the flat face so it never stretches on tall faces.
 */
/** Shared clock for animated ground (the refracted, caustic-lit bed under water); terrain ticks it. */
export const GROUND_TIME = { value: 0 };

/**
 * `cliff`: colour steep faces blend to (slope-based texturing: mesa tops keep their grass).
 * `cave`: towering cave walls (terraced rock mass: lit risers, chiselled faces).
 * `waterY`: the water surface height when the zone has water: the bed below it wobbles as if
 * seen through moving water, takes dancing caustics and fades to the water's colour with depth.
 * `rockTops`: raised relief is rock on top too (false where cliffs carry grassy mesa tops).
 * `sharp`: the geometry carries per-channel colours (`aCol0..3`): ground types then meet along
 *   crisp, natural edges picked by their own painted patterns (a height blend: grass tufts and
 *   pebbles poke through first, grass creeps into the paving's joints), instead of a soft smear.
 * `moss`: moss in the paving's grout lines (the drowned city).
 */
export function applyGround(mat: THREE.MeshStandardMaterial, lava = 0, topShade = 1, cliff: number | null = null, topRange: [number, number] = [0.8, 3.4], cave = false, waterY: number | null = null, waterTint = 0x2e6a70, rockTops = true, sharp = false, moss = false) {
  const wet = waterY !== null;
  const uniforms = {
    uTime: GROUND_TIME,
    uWaterY: { value: waterY ?? 0 },
    uWaterTint: { value: new THREE.Color(waterTint) },
    uLava: { value: lava },
    uTopShade: { value: topShade },
    uTopRange: { value: new THREE.Vector2(...topRange) },
    uCliff: { value: new THREE.Color(cliff ?? 0x6a5e52) },
    uGroundTex: { value: groundTexture() },
    uRockTex: { value: rockAtlas(cave ? 'strata' : 'natural') },
    uRockScale: { value: 1 / ROCK_TILE },
    uPaintAmt: { value: 0.28 },
    uMixTex: { value: noiseTexture() },
    // Painted tonal variation only (no bump). The value (surfH) still drives the cliff tint and
    // the lava crevice glow below.
    uSurfScale: { value: 0.25 },
    uSurfAlbedo: { value: 0.42 },
    uSurfBump: { value: 0 },
  };
  addPatch(mat, {
    key: `ground4${lava > 0 ? ':lava' : ''}${topShade < 1 ? ':shade' : ''}${cliff !== null ? ':cliff' : ''}${cave ? ':cave' : ''}${wet ? ':wet' : ''}${rockTops ? ':tops' : ''}${sharp ? ':sharp' : ''}${moss ? ':moss' : ''}`,
    apply(shader) {
      Object.assign(shader.uniforms, uniforms);
      commonInject(
        shader,
        'world',
        `uniform sampler2D uGroundTex;
        uniform sampler2D uMixTex;
        uniform float uSurfScale;
        uniform float uSurfAlbedo;
        uniform float uSurfBump;
        uniform float uLava;
        uniform float uPaintAmt;
        uniform float uTime;
        uniform float uWaterY;
        uniform vec3 uWaterTint;
        uniform vec3 uCliff;
        uniform float uTopShade;
        uniform vec2 uTopRange;
        varying vec4 vSplat;
        ${sharp ? 'varying vec3 vCol0;\n        varying vec3 vCol1;\n        varying vec3 vCol2;\n        varying vec3 vCol3;' : ''}
        // The ground weights after sharpening, and the atlas sample (set by surfSample).
        vec4 gK;
        vec4 gT;
        ${ROCK_GLSL}
        // 37° rotation (column-major) for the second, larger-scale sample.
        const mat2 GROT = mat2(0.7986, 0.6018, -0.6018, 0.7986);
        const float GSCALE2 = 0.348;
        const mat2 GROT2 = mat2(0.3256, 0.9455, -0.9455, 0.3256);
        float surfSample(out vec3 grad) {
          grad = vec3(0.0);
          vec4 k = vSplat / max(0.001, dot(vSplat, vec4(1.0)));
          vec3 w = pow(abs(normalize(vSurfNrm)), vec3(6.0));
          w /= (w.x + w.y + w.z);
          // Top: the splatted atlas at two scales, blended by a slow noise mask.
          vec2 p = vSurfPos.xz;
          ${wet ? `// Under water the bed is seen through moving ripples: its pattern wobbles.
          float sub = smoothstep(uWaterY + 0.02, uWaterY - 0.12, vSurfPos.y);
          p += (vec2(texture2D(uMixTex, p * 0.21 + vec2(uTime * 0.03, 0.0)).r, texture2D(uMixTex, p * 0.17 + vec2(0.5, uTime * 0.025)).r) - 0.5) * 0.3 * sub;` : ''}
          vec4 t1 = texture2D(uGroundTex, p * uSurfScale);
          vec4 t2 = texture2D(uGroundTex, GROT * p * (uSurfScale * GSCALE2) + vec2(0.31, 0.57));
          float m = smoothstep(0.36, 0.64, texture2D(uMixTex, p * 0.019 + vec2(0.13, 0.71)).r);
          vec4 t = mix(t1, t2, m);
          // Beaten earth: a third sample at another scale and angle, blended in by a finer mask, so
          // no stain repeats on a visible grid across a big yard.
          if (k.x > 0.001) {
            float m3 = smoothstep(0.3, 0.7, texture2D(uMixTex, p * 0.083 + vec2(0.57, 0.21)).r);
            float t3 = texture2D(uGroundTex, GROT2 * p * (uSurfScale * 0.61) + vec2(0.73, 0.19)).r;
            t.r = mix(mix(t1.r, t2.r, 0.5), t3, m3);
          }
          // Paving is laid square to the world and never cross-faded (two overlaid layouts read
          // as cracked mud): one unrotated sample with an 8-unit tile.
          if (k.b > 0.001) t.b = texture2D(uGroundTex, p * (uSurfScale * 0.5)).b;
          ${sharp ? `// Height blend: each ground type rises by its own pattern (grass clumps, pebbles,
          // paving stones stand proud of their joints); within a narrow band of the highest the
          // types mix, below it they drop out. Edges are crisp but follow the paint, never the grid.
          vec4 hk = k + (t - 0.5) * 1.2 * step(0.001, k);
          float top = max(max(hk.x, hk.y), max(hk.z, hk.w));
          vec4 kk = max(hk - (top - 0.03), 0.0);
          k = kk / max(1e-4, dot(kk, vec4(1.0)));` : ''}
          gK = k;
          gT = t;
          float h = dot(t, k);
          // Most ground is flat: skip the side projections there.
          if (w.y > 0.985) return h;
          // Steep faces: a calm drift here (the rock pattern itself is painted after the colour).
          float s = uSurfScale * 0.8;
          float rx = texture2D(uRockTex, vSurfPos.zy * s).a, rz = texture2D(uRockTex, vSurfPos.xy * s).a;
          return h * w.y + (rx * w.x + rz * w.z) * 0.6 + 0.2 * (w.x + w.z);
        }`,
      );
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nattribute vec4 aSplat;\nvarying vec4 vSplat;${sharp ? '\n' + [0, 1, 2, 3].map((c) => `attribute vec3 aCol${c};\nvarying vec3 vCol${c};`).join('\n') : ''}`)
        .replace('#include <project_vertex>', `#include <project_vertex>\nvSplat = aSplat;${sharp ? '\nvCol0 = aCol0; vCol1 = aCol1; vCol2 = aCol2; vCol3 = aCol3;' : ''}`);
      heightInject(shader, false);
      if (sharp || moss) {
        shader.fragmentShader = shader.fragmentShader.replace(
          'float surfH = surfSample(surfGrad);',
          `float surfH = surfSample(surfGrad);
          ${sharp ? '// Each ground type in its own colour, by the sharpened weights.\n          diffuseColor.rgb = diffuse * (vCol0 * gK.x + vCol1 * gK.y + vCol2 * gK.z + vCol3 * gK.w);' : ''}
          ${moss ? `{
            // Moss in the paving's joints, in patches: dark green where the mortar is.
            float joint = 1.0 - smoothstep(0.16, 0.3, gT.b);
            float patchM = smoothstep(0.42, 0.62, texture2D(uMixTex, vSurfPos.xz * 0.07 + vec2(0.7, 0.2)).r);
            float mossK = joint * gK.z * (0.35 + 0.65 * patchM) * smoothstep(-0.05, 0.05, vSurfPos.y + 0.1);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.12, 0.05), mossK * 0.85);
          }` : ''}`,
        );
      }
      // Painterly: warm lights, cool darks.
      shader.fragmentShader = shader.fragmentShader.replace(
        'diffuseColor.rgb *= clamp(1.0 + (surfH - 0.5) * 2.0 * uSurfAlbedo, 0.0, 2.0);',
        `diffuseColor.rgb *= clamp(1.0 + (surfH - 0.5) * 2.0 * uSurfAlbedo, 0.0, 2.0);
        { float paintV = surfH; diffuseColor.rgb *= ${PAINT_TINT}; }
        ${floorVariation(lava > 0 ? 'lair' : topShade < 1 ? 'mine' : null)}`,
      );
      // Rock, in order: the cliff colour on steep faces, the painted rock, cave risers, the climb
      // into darkness, and last the drowned bed's absorption (one block, so the order is explicit).
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        {
          vec3 gn = normalize(vSurfNrm);
          float steep = smoothstep(0.42, 0.78, 1.0 - abs(gn.y));
          ${cliff !== null ? '// Steep faces take the cliff rock colour whatever the vertex colour (mesa tops stay grassy).\n          diffuseColor.rgb = mix(diffuseColor.rgb, uCliff * (0.8 + surfH * 0.4), steep);' : ''}
          float rockK = max(steep, smoothstep(0.45, 1.0, vSurfPos.y)${rockTops ? '' : ' * smoothstep(0.45, 0.8, vSplat.w / max(0.001, dot(vSplat, vec4(1.0))))'});
          if (rockK > 0.001) {
            vec3 fn = rockFaceN(vSurfPos);
            diffuseColor.rgb = rockPaint(diffuseColor.rgb, vSurfPos, fn, rockK);
            ${cave ? '' : `// Weathered outdoor rock: dark rain streaks run down the faces (long, thin, broken), broad
            // ochre and cool stains drift across them${rockTops ? '' : ', and moss and grass take hold on the ledges'}.
            vec3 aw = abs(fn);
            float stx = texture2D(uMixTex, vec2(vSurfPos.z * 0.12 + 0.3, vSurfPos.y * 0.01)).r;
            float stz = texture2D(uMixTex, vec2(vSurfPos.x * 0.12 + 0.7, vSurfPos.y * 0.01)).r;
            float streak = (stx * aw.x + stz * aw.z) / max(0.001, aw.x + aw.z);
            float face = steep * rockK * (1.0 - smoothstep(0.35, 0.7, aw.y));
            diffuseColor.rgb *= 1.0 - 0.32 * smoothstep(0.45, 0.75, streak) * face;
            float drift2 = texture2D(uMixTex, vSurfPos.xz * 0.021 + vec2(vSurfPos.y * 0.017, 0.4)).r;
            diffuseColor.rgb *= mix(vec3(0.92, 0.97, 1.06), vec3(1.12, 1.0, 0.8), smoothstep(0.3, 0.75, drift2) * face + (1.0 - face) * 0.5);
            ${rockTops ? '' : `float mossN = texture2D(uMixTex, vSurfPos.xz * 0.19 + vec2(0.13, 0.77)).r;
            float moss = smoothstep(0.55, 0.85, fn.y) * smoothstep(0.5, 0.68, mossN + fn.y * 0.1) * rockK;
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.16, 0.25, 0.09), vec3(0.27, 0.36, 0.13), mossN), moss * 0.85);`}`}
          }
          ${cave && topShade < 1 ? CAVE_RISERS : ''}
          ${topShade < 1 ? `// Rock falls away into darkness as it climbs (eased in caves, so the first ledges stay readable).
          float climb = smoothstep(uTopRange.x, uTopRange.y, vSurfPos.y);
          diffuseColor.rgb *= mix(1.0, uTopShade, ${cave ? 'sqrt(climb)' : 'climb'});` : ''}
          ${wet ? `// The drowned bed: absorbed toward the water colour with depth.
          float dW = uWaterY - vSurfPos.y;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.5 + uWaterTint * 0.35, smoothstep(0.02, 0.5, dW));` : ''}
        }`,
      );
      if (wet) {
        // Caustics dance across the drowned bed (brightest in the shallows).
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            float d = uWaterY - vSurfPos.y;
            float sub = smoothstep(0.02, 0.14, d);
            vec2 cp = vSurfPos.xz;
            // Two drifting ridged layers multiplied: a fine web of light, like sun through ripples.
            float ca = texture2D(uMixTex, cp * 0.62 + vec2(uTime * 0.03, uTime * 0.011)).r;
            float cb = texture2D(uMixTex, cp * 0.81 + vec2(0.37, 0.61) - vec2(uTime * 0.012, uTime * 0.027)).r;
            float caus = pow((1.0 - abs(ca * 2.0 - 1.0)) * (1.0 - abs(cb * 2.0 - 1.0)), 5.0);
            float shallow = 1.0 - smoothstep(0.05, 0.4, d);
            totalEmissiveRadiance += vec3(0.7, 0.95, 0.88) * caus * shallow * sub * 0.3;
          }`,
        );
      }
      if (topShade < 1 && cave) {
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <normal_fragment_maps>',
            `#include <normal_fragment_maps>
            {
              // Chiselled risers, calm tops: steep rock takes its flat face normal (hard-edged
              // facets), the ledge tops keep the smooth normal, so the mass reads as cut strata.
              vec3 fn = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
              float st = smoothstep(0.35, 0.7, 1.0 - abs(normalize(vSurfNrm).y)) * smoothstep(0.5, 1.1, vSurfPos.y);
              normal = normalize(mix(normal, fn, st * 0.85));
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
            float crev = smoothstep(0.34, 0.16, surfH) * rockW * smoothstep(0.9, 0.97, normalize(vSurfNrm).y) * (1.0 - smoothstep(0.15, 0.5, vSurfPos.y));
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
