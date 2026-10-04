import * as THREE from 'three';
import { abs, attribute, clamp, dot, float, If, max, min, mix, normalize, select, sign, smoothstep, step, vec3 } from 'three/tsl';
import { charTexture } from './textures';
import { addPatch, packAttributes, type F, type V3, type V4 } from './patch';

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
 * Metal (`metal`, `darkMetal`, `gilt`) takes no pattern at all: smooth, a bright lip on every edge
 * and bevel and the light from above (owner, October 4: never a bumpy texture on any metal); it
 * shines with its polish (polish.ts).
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
  metal: { w: [0, 0, 0, 0], edge: 0.3, grad: 0.16 },
  // Gold trim on robes and hoods (the cultist's, the priest's, the Warden's): cloth, painted as gold.
  trim: { w: [0, 0.06, 0, 0], edge: 0.22, grad: 0.14 },
  // Gilt metal (the dragons' harness fittings).
  gilt: { w: [0, 0, 0, 0], edge: 0.22, grad: 0.14 },
  darkMetal: { w: [0, 0, 0, 0], edge: 0.3, grad: 0.12 },
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

const paintVec = (p: CharPaint) => ({
  w: new THREE.Vector4(...p.w),
  x: new THREE.Vector4(p.edge, p.grad, p.moss ?? 0, p.scale ?? 1),
});

/**
 * Pack a prepared model geometry's painted-shader attributes (prepareCharGeometry, paintAttributes)
 * into one vertex buffer, once its parts are merged (see packAttributes).
 */
export const packCharAttributes = (geo: THREE.BufferGeometry) => packAttributes(geo, ['aRest', 'aRestN', 'aFace', 'aPaintW', 'aPaintX', 'aPolish']);

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
  addPatch(mat, {
    key: `cpaint:${per ? 'vertex' : 'uniform'}`,
    slot: 'surface',
    uniforms: uniforms as unknown as Record<string, { value: unknown }>,
    nodes(u) {
      const rest = attribute('aRest', 'vec3') as V3, face = attribute('aFace', 'vec4') as V4;
      const pw = per ? (attribute('aPaintW', 'vec4') as V4) : u.v4('uPaintW');
      const px = per ? (attribute('aPaintX', 'vec4') as V4) : u.v4('uPaintX');
      const gain = u.f('uCharGain'), edgeW = u.f('uCharEdgeW');
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
          If(px.z.greaterThan(0), () => {
            const moss = smoothstep(0.1, 0.24, ct.r.add(rn.y.mul(0.3)).sub(0.12)).mul(px.z).mul(gain);
            c.assign(mix(c, vec3(0.13, 0.22, 0.05).mul(ct.r.add(0.8)), moss.mul(0.6)));
          });
          return c;
        },
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
}

/** Scale every painted material's contrast under `root` (item icons paint a little softer). */
export function setPaintGain(root: THREE.Object3D, gain: number) {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const u = (o.material as THREE.Material).userData.charPaint as CharUniforms | undefined;
    if (u) u.uCharGain.value = gain;
  });
}
