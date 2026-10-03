import * as THREE from 'three';
import { abs, attribute, cameraViewMatrix, clamp, cross, dFdx, dFdy, dot, float, fwidth, If, length, mat3, materialColor, max, min, mix, normalize, positionView, positionWorld, pow, select, sign, sin, smoothstep, sqrt, step, vec2, vec3, vec4 } from 'three/tsl';
import { charTexture, forgeTexture, groundTexture, noiseTexture, surfaceTexture, SURFACES, type SurfaceKind } from './textures';
import { paintTint } from './paint';
import { rockAtlas, rockFaceN, rockPaint, ROCK_TILE } from './rock';
import { addPatch, objectPosition, packAttributes, rot2, surfaceFrame, type F, type SurfaceFrame, type SurfaceSpace, type V2, type V3, type V4 } from './patch';

export { addPatch, patchKeys, type SurfaceSpace } from './patch';

// ─── Surface detail: triplanar albedo + bump ────────────────────────────────

/**
 * Bump from the height gradient measured in texture space (finite differences), carried to view
 * space along the projection axes. Unlike screen-space derivative bump it has no 2×2-pixel
 * blockiness or dashed moiré at grazing angles.
 */
const SURF_E = 1.5 / 256;
function surfBump(f: SurfaceFrame, n: V3, grad: V3, strength: F): V3 {
  const g0 = f.toView(grad);
  const g = g0.sub(n.mul(dot(g0, n)));
  return normalize(n.sub(g.mul(strength)));
}

/** The albedo and roughness a surface height (0..1) gives (`alb` its strength). */
const heightColor = (c: V3, h: F, alb: F) => c.mul(clamp(h.sub(0.5).mul(2).mul(alb).add(1), 0, 2));
const heightRoughness = (r: F, h: F, alb: F) => clamp(r.add(float(0.5).sub(h).mul(0.3).mul(alb)), 0.05, 1);

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
  addPatch(mat, {
    key: `surface:${space}${bump ? '' : ':flat'}`,
    slot: 'surface',
    uniforms,
    nodes(u, b) {
      let f: SurfaceFrame;
      const tex = u.tex('uSurfTex'), scale = u.f('uSurfScale'), alb = u.f('uSurfAlbedo');
      // Flat: one fetch per plane. Bumped: two more per plane for the gradient.
      const plane = (uv: V2): V3 => {
        const h = tex.sample(uv).r.toVar();
        return bump ? vec3(h, tex.sample(uv.add(vec2(SURF_E, 0))).r.sub(h), tex.sample(uv.add(vec2(0, SURF_E))).r.sub(h)) : vec3(h, 0, 0);
      };
      let h: F = float(0.5), grad: V3 = vec3(0);
      return {
        color(c) {
          f = surfaceFrame(space, b);
          const w0 = pow(abs(normalize(f.nrm)), vec3(4));
          const w = w0.div(w0.x.add(w0.y).add(w0.z)).toVar();
          const q = f.pos.mul(scale).toVar();
          const px = plane(q.yz).toVar(), py = plane(q.xz.add(0.37)).toVar(), pz = plane(q.xy.add(0.71)).toVar();
          grad = vec3(0, px.y, px.z).mul(w.x).add(vec3(py.y, 0, py.z).mul(w.y)).add(vec3(pz.y, pz.z, 0).mul(w.z)).mul(scale.div(SURF_E)).toVar();
          h = px.x.mul(w.x).add(py.x.mul(w.y)).add(pz.x.mul(w.z)).toVar();
          return heightColor(c, h, alb);
        },
        roughness: (r) => heightRoughness(r, h, alb),
        normal: bump ? (n) => surfBump(f, n, grad, u.f('uSurfBump').mul(0.12).div(scale)) : undefined,
      };
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

/**
 * Pack a prepared model geometry's painted-shader attributes (prepareCharGeometry, paintAttributes)
 * into one vertex buffer, once its parts are merged (see packAttributes).
 */
export const packCharAttributes = (geo: THREE.BufferGeometry) => packAttributes(geo, ['aRest', 'aRestN', 'aFace', 'aPart', 'aPaintW', 'aPaintX', 'aPaintY']);

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
  addPatch(mat, {
    key: `cpaint:${per ? 'vertex' : 'uniform'}`,
    slot: 'surface',
    uniforms: uniforms as unknown as Record<string, { value: unknown }>,
    nodes(u) {
      const rest = attribute('aRest', 'vec3') as V3, face = attribute('aFace', 'vec4') as V4;
      const pw = per ? (attribute('aPaintW', 'vec4') as V4) : u.v4('uPaintW');
      const px = per ? (attribute('aPaintX', 'vec4') as V4) : u.v4('uPaintX');
      const py = per ? (attribute('aPaintY', 'vec4') as V4) : u.v4('uPaintY');
      const gain = u.f('uCharGain'), edgeW = u.f('uCharEdgeW');
      let rough: F = float(0);
      return {
        color(c0) {
          const c = c0.toVar();
          // Flat face normal in the rest frame (an attribute: derivative normals break up into
          // speckle on faces seen edge-on).
          const rn = normalize((attribute('aRestN', 'vec3') as V3).add(vec3(0, 1e-6, 0))).toVar();
          const an = abs(rn).toVar();
          const q = rest.mul(u.f('uCharScale').mul(px.w)).toVar();
          const cuv = select(an.y.greaterThanEqual(max(an.x, an.z)), q.xz, select(an.x.greaterThan(an.z), q.zy, q.xy)).toVar();
          const ct = u.tex('uCharTex').sample(cuv).sub(0.5).toVar();
          const cv = dot(ct, pw).mul(2);
          // Painted worn edge round each flat face; thin bevel faces are all edge.
          const faceOk = step(1e-6, face.z.mul(face.w));
          const fe = min(min(face.x, face.z.sub(face.x)), min(face.y, face.w.sub(face.y)));
          const thin = min(face.z, face.w);
          const fw = min(edgeW, thin.mul(0.3));
          const edge = faceOk.mul(max(float(1).sub(smoothstep(fw.mul(0.35), fw, fe)), float(1).sub(smoothstep(edgeW.mul(1.2), edgeW.mul(1.8), thin)))).toVar();
          // Light from above: side faces lighter at the top, up faces lit, down faces shaded.
          const side = float(1).sub(smoothstep(0.55, 0.8, an.y)).toVar();
          const gy = faceOk.mul(face.y.div(max(face.w, 1e-6)).sub(0.5));
          const grad = mix(sign(rn.y).mul(0.5), gy, side);
          c.mulAssign(clamp(cv.add(px.x.mul(edge)).add(px.y.mul(grad)).mul(gain).add(1), 0.35, 1.8));
          const forge = py.x;
          const cpRough = float(0).toVar();
          If(forge.greaterThan(0), () => {
            // Forged metal: hammered dishes and draw-marks, a polished worn lip on every edge,
            // soot settling along each plate's foot and in blotches, a tone per plate.
            const ft = u.tex('uForgeTex').sample(cuv).sub(0.5).toVar();
            const footD = mix(1, face.y, side.mul(faceOk));
            const foot = float(1).sub(smoothstep(0, 0.09, footD)).mul(side).add(step(rn.y, -0.6).mul(0.5));
            const grime = clamp(foot.mul(ft.b.add(0.75)).add(smoothstep(0.05, 0.4, ft.b).mul(0.6)), 0, 1).toVar();
            const part = attribute('aPart', 'float') as F;
            const tone = part.mul(7.13).fract().sub(0.5).mul(0.2);
            const f = ft.r.mul(0.42).add(ft.g.mul(0.14)).add(ft.a.mul(0.05)).add(tone).add(edge.mul(0.32)).sub(grime.mul(0.36));
            c.mulAssign(clamp(f.mul(forge).mul(gain).add(1), 0.35, 1.8));
            c.assign(mix(c, vec3(dot(c, vec3(0.3, 0.55, 0.15))), grime.mul(forge).mul(0.35).mul(gain)));
            cpRough.assign(grime.mul(0.3).sub(edge.mul(0.12)).add(ft.r.mul(0.25)).add(ft.a.mul(0.15)).mul(forge).mul(gain));
          });
          If(px.z.greaterThan(0), () => {
            const moss = smoothstep(0.1, 0.24, ct.r.add(rn.y.mul(0.3)).sub(0.12)).mul(px.z).mul(gain);
            c.assign(mix(c, vec3(0.13, 0.22, 0.05).mul(ct.r.add(0.8)), moss.mul(0.6)));
          });
          rough = cpRough;
          return c;
        },
        roughness: (r) => clamp(r.add(rough), 0.05, 1),
      };
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
function floorVariation(kind: 'lair' | 'mine', c: V3, mixN: (q: V2) => F, splat: V4, pos: V3, nrm: V3) {
  const rockW = splat.w.div(max(dot(splat, vec4(1)), 0.001));
  const floorW = rockW.mul(float(1).sub(smoothstep(0.2, 0.6, pos.y))).mul(smoothstep(0.8, 0.95, normalize(nrm).y)).toVar();
  const n1 = mixN(pos.xz.mul(0.045).add(vec2(0.61, 0.27))).toVar();
  const n2 = mixN(pos.xz.mul(0.08).add(vec2(0.23, 0.83))).toVar();
  if (kind === 'lair') {
    const nf = mixN(pos.xz.mul(0.19).add(vec2(0.37, 0.11)));
    const ash = smoothstep(0.38, 0.8, nf.mul(0.65).add(n1.mul(0.35))).mul(floorW);
    const ashCol = vec3(dot(c, vec3(0.3, 0.5, 0.2))).mul(vec3(1.14, 1.06, 1.0));
    c.assign(mix(c, ashCol, ash.mul(0.42)));
    c.mulAssign(n2.sub(0.5).mul(0.2).mul(floorW).add(1));
  } else {
    const stain = smoothstep(0.6, 0.66, n1).mul(floorW);
    const damp = smoothstep(0.32, 0.26, n2).mul(floorW);
    c.mulAssign(mix(vec3(1), vec3(1.2, 0.98, 0.74), stain));
    c.mulAssign(mix(vec3(1), vec3(0.8, 0.86, 0.96), damp));
  }
}

/** Height of one cave-rock terrace (terrain.ts builds them; the riser shading below keys to it). */
export const CAVE_TERRACE = 1.0;

/**
 * Paving laid as a designed bond on the cell grid: rows a third of a cell deep along X, each stone
 * two thirds long, every other row's joints over the middle of the stones below. Every cell edge falls
 * on a row joint and on a whole or half stone, so wherever a paved area ends (a cell edge) its stones
 * end whole, and a kerb (a third wide, flush on the paving's side) takes its first row exactly.
 * Rounded, bevelled stones, a tone each, soft broad drift: as the painted paving. Like the castle's
 * dressed stone (paint.ts) each stone has real relief, gentler: `grad` takes the slope of its bevelled
 * edge over the ground (MASON's bump, in world space) and `joint` how much of the fragment is joint,
 * both softened far off (`px`, metres to a pixel). Returns the stone's painted value.
 */
function paveLaid(p: V2, px: F, mixN: (q: V2) => F, grad: V2, joint: F): F {
  const rz = p.y.mul(3), r = rz.floor().toVar(), fz = rz.sub(r).toVar();
  const xo = p.x.mul(1.5).add(select(r.mod(2).greaterThan(0.5), float(0.5), float(0))), b = xo.floor().toVar(), fx = xo.sub(b).toVar();
  const dx = min(fx, float(1).sub(fx)).div(1.5).toVar(), dz = min(fz, float(1).sub(fz)).div(3).toVar();
  const rc = 0.05;
  const sg = vec2(select(fx.lessThan(0.5), float(1), float(-1)), select(fz.lessThan(0.5), float(1), float(-1)));
  const corner = dx.lessThan(rc).and(dz.lessThan(rc));
  const cq = vec2(float(rc).sub(dx), float(rc).sub(dz));
  const dir = select(corner, normalize(cq.add(1e-5)).mul(sg), select(dx.lessThan(dz), vec2(sg.x, 0), vec2(0, sg.y)));
  const d = select(corner, float(rc).sub(length(cq)), min(dx, dz)).add(mixN(p.mul(1.7)).sub(0.5).mul(0.012)).toVar();
  const tb = clamp(d.sub(0.014).div(0.035), 0, 1), near = float(1).sub(smoothstep(0.02, 0.07, px)).toVar();
  grad.assign(dir.mul(float(1).sub(tb).mul(2 * 0.011 / 0.035)).mul(near));
  joint.assign(float(1).sub(smoothstep(px.mul(-0.5).add(0.014), px.mul(0.5).add(0.014), d)).mul(mix(0.5, 1, near)));
  const h = sin(dot(vec2(r, b), vec2(127.1, 311.7))).mul(43758.5453).fract();
  const tone = h.sub(0.5).mul(0.3).add(0.54).add(mixN(p.mul(0.09)).sub(0.5).mul(0.1)).add(mixN(p.mul(0.6).add(0.3)).sub(0.5).mul(0.08));
  const faceV = tone.sub(float(1).sub(smoothstep(0.02, 0.07, d)).mul(0.1)).add(float(1).sub(smoothstep(0, 0.05, fz.div(3))).mul(smoothstep(0.02, 0.04, d)).mul(0.06));
  return faceV.sub(0.12).mul(smoothstep(0.008, 0.026, d)).add(0.12);
}

/** Shared clock for animated ground (the refracted, caustic-lit bed under water); terrain ticks it. */
export const GROUND_TIME = { value: 0 };

/**
 * Ground: a four-channel painted atlas (dirt, grass, flagstone, smooth floor rock) projected
 * top-down in world space and blended per vertex by the `aSplat` attribute. Colour only (no
 * bump). Anti-tiling: the atlas is sampled at two scales (the second rotated 37°) and the two are
 * blended by a low-frequency noise mask, so no 4-unit repeat is visible (small flagstones give way
 * to big slabs, and back). Steep faces (and all raised rock where the relief has no grassy top)
 * take the shared painted rock (rock.ts: strata blocks, cracks, grain), projected triplanar from
 * the flat face so it never stretches on tall faces.
 *
 * `cliff`: colour steep faces blend to (slope-based texturing: mesa tops keep their grass).
 * `cave`: towering cave walls (terraced rock mass: lit risers, chiselled faces).
 * `waterY`: the water surface height when the zone has water: the bed below it wobbles as if
 * seen through moving water, takes dancing caustics and fades to the water's colour with depth.
 * `rockTops`: raised relief is rock on top too (false where cliffs carry grassy mesa tops).
 * `sharp`: the geometry carries per-channel colours (`aCol0..3`): ground types then meet along
 *   crisp, natural edges picked by their own painted patterns (a height blend: grass tufts and
 *   pebbles poke through first, grass creeps into the paving's joints), instead of a soft smear.
 * `moss`: moss in the paving's grout lines (the drowned city).
 * `rockMoss`: how far moss spreads over grassy-topped rock (0 patches on the flattest ledges, 1 lush).
 * `laid`: the paving laid as a designed bond (paveLaid) instead of the atlas's flagstones.
 */
export function applyGround(mat: THREE.MeshStandardMaterial, lava = 0, topShade = 1, cliff: number | null = null, topRange: [number, number] = [0.8, 3.4], cave = false, waterY: number | null = null, waterTint = 0x2e6a70, rockTops = true, sharp = false, moss = false, rockMoss = 0, laid = false) {
  const wet = waterY !== null;
  const uniforms = {
    uTime: GROUND_TIME,
    uWaterY: { value: waterY ?? 0 },
    uWaterTint: { value: new THREE.Color(waterTint) },
    uLava: { value: lava },
    uTopShade: { value: topShade },
    uTopRange: { value: new THREE.Vector2(...topRange) },
    uCliff: { value: new THREE.Color(cliff ?? 0x6a5e52) },
    uRockMoss: { value: rockMoss },
    uGroundTex: { value: groundTexture() },
    uRockTex: { value: rockAtlas(cave ? 'strata' : 'natural') },
    uRockScale: { value: 1 / ROCK_TILE },
    uPaintAmt: { value: 0.28 },
    uMixTex: { value: noiseTexture() },
    // Painted tonal variation only (no bump). The value (surfH) still drives the cliff tint and
    // the lava crevice glow below.
    uSurfScale: { value: 0.25 },
    uSurfAlbedo: { value: 0.42 },
  };
  addPatch(mat, {
    key: `ground4${laid ? ':laid' : ''}${lava > 0 ? ':lava' : ''}${topShade < 1 ? ':shade' : ''}${cliff !== null ? ':cliff' : ''}${cave ? ':cave' : ''}${wet ? ':wet' : ''}${rockTops ? ':tops' : ''}${sharp ? ':sharp' : ''}${moss ? ':moss' : ''}`,
    uniforms,
    nodes(u, b) {
      const pos = positionWorld;
      let nrm: V3 = vec3(0, 1, 0);
      const gTex = u.tex('uGroundTex'), mixT = u.tex('uMixTex'), rockT = u.tex('uRockTex');
      const S = u.f('uSurfScale'), alb = u.f('uSurfAlbedo'), time = u.f('uTime'), waterY = u.f('uWaterY');
      const mixN = (q: V2) => mixT.sample(q).r;
      const splat = attribute('aSplat', 'vec4') as V4;
      // The ground weights after sharpening, the atlas sample and the height (set by the colour).
      let gK: V4 = vec4(0), surfH: F = float(0.5), paveGrad: V2 = vec2(0), paveJoint: F = float(0);
      return {
        color(c) {
          nrm = surfaceFrame('world', b).nrm;
          if (laid) {
            paveGrad = vec2(0).toVar();
            paveJoint = float(0).toVar();
          }
          const k = splat.div(max(dot(splat, vec4(1)), 0.001)).toVar();
          const w0 = pow(abs(normalize(nrm)), vec3(6));
          const w = w0.div(w0.x.add(w0.y).add(w0.z)).toVar();
          // Top: the splatted atlas at two scales, blended by a slow noise mask.
          const p = pos.xz.toVar();
          // (How many metres a pixel spans, taken before any branch.)
          const pavePx = laid ? length(fwidth(p)).toVar() : float(0);
          if (wet) {
            // Under water the bed is seen through moving ripples: its pattern wobbles.
            const sub = smoothstep(waterY.add(0.02), waterY.sub(0.12), pos.y);
            p.addAssign(vec2(mixN(p.mul(0.21).add(vec2(time.mul(0.03), 0))), mixN(p.mul(0.17).add(vec2(0.5, time.mul(0.025))))).sub(0.5).mul(0.3).mul(sub));
          }
          const t1 = gTex.sample(p.mul(S)).toVar();
          const t2 = gTex.sample(rot2(p, 0.7986, 0.6018, -0.6018, 0.7986).mul(S.mul(0.348)).add(vec2(0.31, 0.57))).toVar();
          const m = smoothstep(0.36, 0.64, mixN(p.mul(0.019).add(vec2(0.13, 0.71))));
          const t = mix(t1, t2, m).toVar();
          // Beaten earth: a third sample at another scale and angle, blended in by a finer mask, so
          // no stain repeats on a visible grid across a big yard.
          If(k.x.greaterThan(0.001), () => {
            const m3 = smoothstep(0.3, 0.7, mixN(p.mul(0.083).add(vec2(0.57, 0.21))));
            const t3 = gTex.sample(rot2(p, 0.3256, 0.9455, -0.9455, 0.3256).mul(S.mul(0.61)).add(vec2(0.73, 0.19))).r;
            t.x.assign(mix(mix(t1.r, t2.r, 0.5), t3, m3));
          });
          // Paving is laid square to the world and never cross-faded (two overlaid layouts read
          // as cracked mud): one unrotated sample with an 8-unit tile, or (laid) the designed bond.
          If(k.z.greaterThan(0.001), () => {
            t.z.assign(laid ? paveLaid(p, pavePx, mixN, paveGrad, paveJoint) : gTex.sample(p.mul(S.mul(0.5))).b);
          });
          if (sharp) {
            // Height blend: each ground type rises by its own pattern (grass clumps, pebbles, paving
            // stones stand proud of their joints); within a narrow band of the highest the types mix,
            // below it they drop out. Edges are crisp but follow the paint, never the grid.
            const hk = k.add(t.sub(0.5).mul(1.2).mul(step(0.001, k))).toVar();
            const top = max(max(hk.x, hk.y), max(hk.z, hk.w));
            const kk = max(hk.sub(top.sub(0.03)), 0).toVar();
            k.assign(kk.div(max(dot(kk, vec4(1)), 1e-4)));
          }
          gK = k;
          const h = dot(t, k).toVar();
          surfH = h;
          // Most ground is flat: skip the side projections there; steep faces take a calm drift (the
          // rock pattern itself is painted after the colour).
          If(w.y.lessThanEqual(0.985), () => {
            const s = S.mul(0.8);
            const rx = rockT.sample(pos.zy.mul(s)).a, rz = rockT.sample(pos.xy.mul(s)).a;
            h.assign(h.mul(w.y).add(rx.mul(w.x).add(rz.mul(w.z)).mul(0.6)).add(w.x.add(w.z).mul(0.2)));
          });
          if (sharp) {
            // Each ground type in its own colour, by the sharpened weights.
            const col = (i: number) => attribute(`aCol${i}`, 'vec3') as V3;
            c.assign(vec3(materialColor).mul(col(0).mul(k.x).add(col(1).mul(k.y)).add(col(2).mul(k.z)).add(col(3).mul(k.w))));
          }
          if (moss) {
            // Moss in the paving's joints, in patches: dark green where the mortar is.
            const joint = float(1).sub(smoothstep(0.16, 0.3, t.b));
            const patchM = smoothstep(0.42, 0.62, mixN(pos.xz.mul(0.07).add(vec2(0.7, 0.2))));
            const mossK = joint.mul(k.z).mul(patchM.mul(0.65).add(0.35)).mul(smoothstep(-0.05, 0.05, pos.y.add(0.1)));
            c.assign(mix(c, vec3(0.07, 0.12, 0.05), mossK.mul(0.85)));
          }
          // Painterly: warm lights, cool darks (and, laid, the paving's joints deep and dark).
          c.assign(heightColor(c, h, alb).mul(paintTint(h, u.f('uPaintAmt'))));
          if (laid) c.mulAssign(mix(1, 0.6, paveJoint.mul(k.z)));
          if (lava > 0) floorVariation('lair', c, mixN, splat, pos, nrm);
          else if (topShade < 1) floorVariation('mine', c, mixN, splat, pos, nrm);
          // Rock, in order: the cliff colour on steep faces, the painted rock, cave risers, the climb
          // into darkness, and last the drowned bed's absorption.
          const gn = normalize(nrm).toVar();
          const steep = smoothstep(0.42, 0.78, float(1).sub(abs(gn.y))).toVar();
          // Steep faces take the cliff rock colour whatever the vertex colour (mesa tops stay grassy).
          if (cliff !== null) c.assign(mix(c, u.v3('uCliff').mul(h.mul(0.4).add(0.8)), steep));
          const rockK = max(steep, smoothstep(0.45, 1, pos.y).mul(rockTops ? float(1) : smoothstep(0.45, 0.8, splat.w.div(max(dot(splat, vec4(1)), 0.001))))).toVar();
          If(rockK.greaterThan(0.001), () => {
            const fn = rockFaceN(pos).toVar();
            c.assign(rockPaint(rockT, u.f('uRockScale'), c, pos, fn, rockK));
            if (cave) return;
            // Weathered outdoor rock: dark rain streaks run down the faces (long, thin, broken), broad
            // ochre and cool stains drift across them, and (grassy tops) moss and grass on the ledges.
            const aw = abs(fn).toVar();
            const stx = mixN(vec2(pos.z.mul(0.12).add(0.3), pos.y.mul(0.01)));
            const stz = mixN(vec2(pos.x.mul(0.12).add(0.7), pos.y.mul(0.01)));
            const streak = stx.mul(aw.x).add(stz.mul(aw.z)).div(max(aw.x.add(aw.z), 0.001));
            const faceK = steep.mul(rockK).mul(float(1).sub(smoothstep(0.35, 0.7, aw.y))).toVar();
            c.mulAssign(float(1).sub(smoothstep(0.45, 0.75, streak).mul(faceK).mul(0.32)));
            const drift2 = mixN(pos.xz.mul(0.021).add(vec2(pos.y.mul(0.017), 0.4)));
            c.mulAssign(mix(vec3(0.92, 0.97, 1.06), vec3(1.12, 1.0, 0.8), smoothstep(0.3, 0.75, drift2).mul(faceK).add(float(1).sub(faceK).mul(0.5))));
            // One big weathering gradient up every face: warmer and darker toward the damp foot,
            // cooler and lighter toward the sunlit crown; the faces lifted a little overall so those
            // turned from the sun read as shaded rock, never black.
            const hk = smoothstep(-1, 13, pos.y);
            c.mulAssign(mix(mix(vec3(1), vec3(0.9, 0.86, 0.8), faceK), mix(vec3(1), vec3(1.04, 1.06, 1.12), faceK), hk).mul(faceK.mul(0.12).add(1)));
            if (rockTops) return;
            // Moss laid from straight above in world space: only on faces that face up (the geometry's
            // own normal, not the painted facets, so it never traces the strata), in broad patches with
            // a ragged edge, soil and grit speckled through it. Lush rock (uRockMoss) carries it over
            // most tops and down the rounded shoulders.
            const mossN = mixN(pos.xz.mul(0.19).add(vec2(0.13, 0.77)));
            const mossP = mixN(pos.xz.mul(0.035).add(vec2(0.52, 0.31)));
            const edgeN = mixN(pos.xz.mul(0.6).add(vec2(0.21, 0.44))).toVar();
            const rm = u.f('uRockMoss');
            const mossUp = mix(0.78, 0.5, rm), mossCut = mix(0.6, 0.36, rm);
            const mossK = smoothstep(mossUp, mossUp.add(0.17), gn.y).mul(smoothstep(mossCut, mossCut.add(0.12), mossP.add(edgeN.sub(0.5).mul(0.22)))).mul(rockK);
            const mossC = mix(mix(vec3(0.13, 0.2, 0.07), vec3(0.21, 0.3, 0.1), mossN), vec3(0.24, 0.2, 0.15), smoothstep(0.62, 0.8, edgeN).mul(0.6));
            c.assign(mix(c, mossC, mossK.mul(0.8)));
          });
          if (cave && topShade < 1) {
            // Cave walls' terrace risers: dark in the crease at their foot, catching light on the lip
            // at their top, so each terrace reads as a slab of rock standing on the one below.
            const steepF = smoothstep(0.3, 0.65, float(1).sub(abs(gn.y))).mul(smoothstep(0.5, 1.1, pos.y));
            const tf = pos.y.div(CAVE_TERRACE).fract();
            c.mulAssign(mix(1, mix(0.62, 1.1, smoothstep(0.02, 0.8, tf)), steepF));
          }
          if (topShade < 1) {
            // Rock falls away into darkness as it climbs (eased in caves, so the first ledges stay readable).
            const range = u.v2('uTopRange');
            const climb = smoothstep(range.x, range.y, pos.y);
            c.mulAssign(mix(1, u.f('uTopShade'), cave ? sqrt(climb) : climb));
          }
          if (wet) {
            // The drowned bed: absorbed toward the water colour with depth.
            const dW = waterY.sub(pos.y);
            c.assign(mix(c, c.mul(0.5).add(u.v3('uWaterTint').mul(0.35)), smoothstep(0.02, 0.5, dW)));
          }
          return c;
        },
        roughness: (r) => heightRoughness(r, surfH, alb),
        normal: laid || (cave && topShade < 1) ? (n) => {
          if (cave) {
            // Chiselled risers, calm tops: steep rock takes its flat face normal (hard-edged facets),
            // the ledge tops keep the smooth normal, so the mass reads as cut strata.
            const fn = normalize(cross(dFdx(positionView), dFdy(positionView)));
            const st = smoothstep(0.35, 0.7, float(1).sub(abs(normalize(nrm).y))).mul(smoothstep(0.5, 1.1, pos.y));
            return normalize(mix(n, fn, st.mul(0.85)));
          }
          // The paving stones' bevelled edges bend the normal where the ground lies flat.
          const paveK = smoothstep(0.97, 0.99, normalize(nrm).y).mul(gK.z);
          return normalize(n.sub(mat3(cameraViewMatrix).mul(vec3(paveGrad.x, 0, paveGrad.y)).mul(paveK)));
        } : undefined,
        emissive: wet || lava > 0 ? (e) => {
          let out = e;
          if (lava > 0) {
            // Lava pools in the floor rock's deepest fissures, pulsing slowly. Emissive, so it glows
            // regardless of lighting (and feeds bloom).
            const rockW = splat.w.div(max(dot(splat, vec4(1)), 0.001));
            const crev = smoothstep(0.34, 0.16, surfH).mul(rockW).mul(smoothstep(0.9, 0.97, normalize(nrm).y)).mul(float(1).sub(smoothstep(0.15, 0.5, pos.y)));
            const pulse = sin(pos.x.mul(0.7).add(pos.z.mul(0.5))).mul(0.25).add(0.75);
            out = out.add(vec3(1.0, 0.32, 0.06).mul(crev.mul(pulse).mul(2.2).mul(u.f('uLava'))));
          }
          if (wet) {
            // Caustics dance across the drowned bed (brightest in the shallows): two drifting ridged
            // layers multiplied, a fine web of light, like sun through ripples.
            const d = waterY.sub(pos.y).toVar();
            const sub = smoothstep(0.02, 0.14, d);
            const cp = pos.xz;
            const ca = mixN(cp.mul(0.62).add(vec2(time.mul(0.03), time.mul(0.011))));
            const cb = mixN(cp.mul(0.81).add(vec2(0.37, 0.61)).sub(vec2(time.mul(0.012), time.mul(0.027))));
            const caus = pow(float(1).sub(abs(ca.mul(2).sub(1))).mul(float(1).sub(abs(cb.mul(2).sub(1)))), 5);
            const shallow = float(1).sub(smoothstep(0.05, 0.4, d));
            out = out.add(vec3(0.7, 0.95, 0.88).mul(caus.mul(shallow).mul(sub).mul(0.3)));
          }
          return out;
        } : undefined,
      };
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

