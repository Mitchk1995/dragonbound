import * as THREE from 'three';
import { groundTexture, surfaceTexture, SURFACES, type SurfaceKind } from './textures';

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

/**
 * Ground: a four-channel atlas (dirt, grass, flagstone, cave rock) projected top-down in world
 * space and blended per vertex by the `aSplat` attribute.
 */
/** `cliff`: colour steep faces blend to (slope-based texturing: mesa tops keep their grass). */
export function applyGround(mat: THREE.MeshStandardMaterial, lava = 0, topShade = 1, cliff: number | null = null) {
  const uniforms = {
    uLava: { value: lava },
    uTopShade: { value: topShade },
    uCliff: { value: new THREE.Color(cliff ?? 0x6a5e52) },
    uGroundTex: { value: groundTexture() },
    // Calm: broad tonal variation and a hint of relief. The height (surfH) still drives the
    // cliff tint and the lava crevice glow below.
    uSurfScale: { value: 0.25 },
    uSurfAlbedo: { value: 0.28 },
    uSurfBump: { value: 0.2 },
  };
  addPatch(mat, {
    key: `ground${lava > 0 ? ':lava' : ''}${topShade < 1 ? ':shade' : ''}${cliff !== null ? ':cliff' : ''}`,
    apply(shader) {
      Object.assign(shader.uniforms, uniforms);
      commonInject(
        shader,
        'world',
        `uniform sampler2D uGroundTex;
        uniform float uSurfScale;
        uniform float uSurfAlbedo;
        uniform float uSurfBump;
        uniform float uLava;
        varying vec4 vSplat;
        float surfSample(out vec3 grad) {
          vec4 k = vSplat / max(0.001, dot(vSplat, vec4(1.0)));
          vec3 w = pow(abs(normalize(vSurfNrm)), vec3(4.0));
          w /= (w.x + w.y + w.z);
          // Top: the splatted atlas, projected down.
          vec2 uv = vSurfPos.xz * uSurfScale;
          float h = dot(texture2D(uGroundTex, uv), k);
          float hx = dot(texture2D(uGroundTex, uv + vec2(SURF_E, 0.0)), k);
          float hz = dot(texture2D(uGroundTex, uv + vec2(0.0, SURF_E)), k);
          vec3 gTop = vec3(hx - h, 0.0, hz - h);
          // Most ground is flat: skip the side projections there (6 fewer texture fetches).
          if (w.y > 0.985) {
            grad = gTop * (uSurfScale / SURF_E);
            return h;
          }
          // Steep faces (cliffs, shore banks): the rock channel on the vertical planes, no stretching.
          vec2 ux = vSurfPos.zy * uSurfScale, uz = vSurfPos.xy * uSurfScale;
          float rx = texture2D(uGroundTex, ux).a, rz = texture2D(uGroundTex, uz).a;
          vec3 gX = vec3(0.0, texture2D(uGroundTex, ux + vec2(0.0, SURF_E)).a - rx, texture2D(uGroundTex, ux + vec2(SURF_E, 0.0)).a - rx);
          vec3 gZ = vec3(texture2D(uGroundTex, uz + vec2(SURF_E, 0.0)).a - rz, texture2D(uGroundTex, uz + vec2(0.0, SURF_E)).a - rz, 0.0);
          grad = (gTop * w.y + gX * w.x + gZ * w.z) * (uSurfScale / SURF_E);
          return h * w.y + rx * w.x + rz * w.z;
        }`,
      );
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aSplat;\nvarying vec4 vSplat;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvSplat = aSplat;');
      heightInject(shader);
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
        // Cave rock: the higher the rock, the deeper in shadow (tunnel walls fall away into darkness).
        shader.fragmentShader = shader.fragmentShader
          .replace('uniform float uLava;', 'uniform float uLava;\nuniform float uTopShade;')
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\ndiffuseColor.rgb *= mix(1.0, uTopShade, smoothstep(0.8, 3.4, vSurfPos.y));');
      }
      if (lava > 0) {
        // Lava pools in the rock channel's deepest crevices, pulsing slowly. Emissive, so it glows
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
