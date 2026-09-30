import * as THREE from 'three';
import { groundTexture, surfaceTexture, SURFACES, type SurfaceKind } from './textures';

// ─── Composable shader patches ──────────────────────────────────────────────

type Shader = THREE.WebGLProgramParametersWithUniforms;

export interface ShaderPatch {
  /** Identifies the generated program: patches with equal keys must produce equal GLSL. */
  key: string;
  apply(shader: Shader): void;
}

const patches = new WeakMap<THREE.Material, ShaderPatch[]>();

/**
 * Add a shader patch to a material. Several patches (surface detail, see-through occlusion…)
 * stack: they all run in one onBeforeCompile and share one program cache key. Adding a patch
 * with a key the material already has replaces it (e.g. new uniforms for the same program).
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
  const i = list.findIndex((p) => p.key === patch.key);
  if (i >= 0) list[i] = patch;
  else list.push(patch);
  mat.needsUpdate = true;
}

export const patchKeys = (mat: THREE.Material) => (patches.get(mat) ?? []).map((p) => p.key);

// ─── Surface detail: triplanar albedo + bump ────────────────────────────────

/**
 * Object space follows the mesh (characters, gear: the pattern moves with the limb);
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
 * Albedo, roughness and bump from `float surfSample(out vec3 grad)`: a height in 0..1 and its
 * gradient along the projection axes, evaluated after the colour chunks.
 */
function heightInject(shader: Shader) {
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
    )
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      normal = surfBump(normal, surfGrad, uSurfBump * 0.12 / uSurfScale);`,
    );
}

/** Apply a procedural surface to a MeshStandardMaterial (other material types are left alone). */
export function applySurface(mat: THREE.Material, kind: SurfaceKind, space: SurfaceSpace = 'object', scaleMul = 1) {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return;
  const p = SURFACES[kind];
  const uniforms = {
    uSurfTex: { value: surfaceTexture(kind) },
    uSurfScale: { value: p.scale * scaleMul },
    uSurfAlbedo: { value: p.albedo },
    uSurfBump: { value: p.bump },
  };
  mat.userData.surface = kind;
  addPatch(mat, {
    key: `surface:${space}`,
    apply(shader) {
      Object.assign(shader.uniforms, uniforms);
      commonInject(
        shader,
        space,
        `uniform sampler2D uSurfTex;
        uniform float uSurfScale;
        uniform float uSurfAlbedo;
        uniform float uSurfBump;
        vec3 surfPlane(vec2 uv) {
          float h = texture2D(uSurfTex, uv).r;
          return vec3(h, texture2D(uSurfTex, uv + vec2(SURF_E, 0.0)).r - h, texture2D(uSurfTex, uv + vec2(0.0, SURF_E)).r - h);
        }
        float surfSample(out vec3 grad) {
          vec3 w = pow(abs(normalize(vSurfNrm)), vec3(4.0));
          w /= (w.x + w.y + w.z);
          vec3 p = vSurfPos * uSurfScale;
          vec3 px = surfPlane(p.yz), py = surfPlane(p.xz + 0.37), pz = surfPlane(p.xy + 0.71);
          grad = (vec3(0.0, px.y, px.z) * w.x + vec3(py.y, 0.0, py.z) * w.y + vec3(pz.y, pz.z, 0.0) * w.z) * (uSurfScale / SURF_E);
          return px.x * w.x + py.x * w.y + pz.x * w.z;
        }`,
      );
      heightInject(shader);
    },
  });
}

/**
 * Ground: a four-channel atlas (dirt, grass, flagstone, cave rock) projected top-down in world
 * space and blended per vertex by the `aSplat` attribute.
 */
export function applyGround(mat: THREE.MeshStandardMaterial, lava = 0) {
  const uniforms = {
    uLava: { value: lava },
    uGroundTex: { value: groundTexture() },
    uSurfScale: { value: 0.25 },
    uSurfAlbedo: { value: 0.42 },
    uSurfBump: { value: 1.1 },
  };
  addPatch(mat, {
    key: lava > 0 ? 'ground:lava' : 'ground',
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
          vec2 uv = vSurfPos.xz * uSurfScale;
          float h = dot(texture2D(uGroundTex, uv), k);
          float hx = dot(texture2D(uGroundTex, uv + vec2(SURF_E, 0.0)), k);
          float hz = dot(texture2D(uGroundTex, uv + vec2(0.0, SURF_E)), k);
          grad = vec3(hx - h, 0.0, hz - h) * (uSurfScale / SURF_E);
          return h;
        }`,
      );
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aSplat;\nvarying vec4 vSplat;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvSplat = aSplat;');
      heightInject(shader);
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

// ─── Picking a surface ──────────────────────────────────────────────────────

const ROLE_SURFACE: Record<string, SurfaceKind | null> = {
  skin: 'skin', hair: 'hair', cloth: 'cloth', cloth2: 'cloth', leather: 'leather',
  metal: 'metal', trim: 'metal', dark: 'leather', glow: null,
};

/** The fallback surface for a model's unnamed (non-role) materials. */
const MODEL_SURFACE: Record<string, SurfaceKind> = {
  cinderwing: 'scales', drakeling: 'scales', whelp: 'scales', kobold: 'scales',
  goblin: 'leather', golem: 'stone', cultist: 'cloth', warden: 'cloth', quartermaster: 'cloth', hero: 'cloth',
};

function isSkinTone(c: THREE.Color) {
  const hsl = c.getHSL({ h: 0, s: 0, l: 0 });
  return hsl.h > 0.04 && hsl.h < 0.1 && hsl.s > 0.4 && hsl.l > 0.65 && hsl.l < 0.85;
}

/** Surface for a colour with no other information: grey → stone, brown → wood, dark bluish grey → metal, saturated → cloth. */
export function guessSurface(c: THREE.Color): SurfaceKind {
  const hsl = c.getHSL({ h: 0, s: 0, l: 0 });
  if (hsl.l > 0.85) return 'generic';
  if (hsl.s < 0.12) return hsl.h > 0.55 && hsl.h < 0.75 && hsl.l < 0.35 ? 'metal' : 'stone';
  if (hsl.h > 0.03 && hsl.h < 0.14 && hsl.l < 0.45) return 'wood';
  // Strongly coloured props are banners, awnings and tents.
  if (hsl.s > 0.35) return 'cloth';
  return 'generic';
}

/**
 * Pick and apply a surface for a cloned model material: gear files are metal/leather by role,
 * characters by role or by the model's default, emissive bits stay plain.
 */
export function surfaceForModelMaterial(model: string, mat: THREE.Material) {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return;
  if (mat.emissive.getHex() !== 0 && mat.emissiveIntensity > 0) return;
  const role = /^ROLE_(\w+?)(\.\d{3})?$/.exec(mat.name)?.[1];
  let kind: SurfaceKind | null;
  if (role) {
    kind = ROLE_SURFACE[role] ?? null;
    if (role === 'dark' && model.startsWith('gear_')) kind = 'metal';
  } else if (isSkinTone(mat.color)) {
    kind = 'skin';
  } else if (mat.color.getHSL({ h: 0, s: 0, l: 0 }).l > 0.8) {
    kind = 'generic';
  } else if (model.startsWith('gear_u_')) {
    kind = mat.metalness > 0.5 || mat.color.getHSL({ h: 0, s: 0, l: 0 }).s < 0.2 ? 'metal' : 'leather';
  } else {
    kind = MODEL_SURFACE[model] ?? (model.startsWith('gear_') ? 'metal' : 'generic');
  }
  if (kind) applySurface(mat, kind, 'object');
}
