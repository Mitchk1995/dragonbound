import * as THREE from 'three';
import { noiseTexture } from '../render/textures';

/**
 * Water for props: the still water of a basin or a step pool, and falling water (a jet, a stream
 * from a statue's jaws, a waterfall sheet). Terrain water (rivers, ponds) is drawn by the terrain.
 */

/**
 * The sky colours still water reflects, shared by every pool (WorldView sets them from the zone's
 * theme when it builds the world, as it does the wind clock).
 */
export const WATER_SKY = {
  uSkyHigh: { value: new THREE.Color(0x7474a2) },
  uSkyLow: { value: new THREE.Color(0x342c50) },
};

/** Point the shared pool reflections at a zone's sky (`hemi`: the sky light, `bg`: the horizon). */
export function setWaterSky(hemi: number, bg: number) {
  WATER_SKY.uSkyHigh.value.set(hemi).multiplyScalar(0.75);
  WATER_SKY.uSkyLow.value.set(bg).lerp(new THREE.Color(hemi), 0.25);
}

/** Where something strikes a pool: centre (x, z) in the pool mesh's own space, and a strength. */
export type Impact = [number, number, number];

const MAX_IMPACTS = 6;

/**
 * Still pool water: a depth tint from pale at the rim to deep at the centre over a dark floor, two
 * drifting octaves of ripple normals, rings spreading from every impact point with broken white
 * foam round it, a Fresnel mix toward the reflected sky and sun glints on the ripples. `r` is the
 * pool's radius in its own space (the tint's scale); `impacts` are where water falls into it.
 */
export function poolWater(time: { value: number }, r: number, impacts: Impact[] = []) {
  const imps = impacts.slice(0, MAX_IMPACTS);
  const uniforms = {
    uPoolT: time,
    uNoise: { value: noiseTexture() },
    uPoolR: { value: r },
    uShallow: { value: new THREE.Color(0x3f8fa8) },
    uDeep: { value: new THREE.Color(0x123a52) },
    uImp: { value: Array.from({ length: MAX_IMPACTS }, (_, i) => new THREE.Vector3(...(imps[i] ?? [0, 0, 0]))) },
    ...WATER_SKY,
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0, transparent: true, depthWrite: false });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPoolW;\nvarying vec2 vPoolL;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvPoolW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvPoolL = position.xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vPoolW;
        varying vec2 vPoolL;
        uniform float uPoolT;
        uniform float uPoolR;
        uniform sampler2D uNoise;
        uniform vec3 uShallow;
        uniform vec3 uDeep;
        uniform vec3 uSkyHigh;
        uniform vec3 uSkyLow;
        uniform vec3 uImp[${MAX_IMPACTS}];
        float poolN(vec2 p) { return texture2D(uNoise, p).r; }
        vec2 poolG(vec2 p) { float c = poolN(p); return vec2(poolN(p + vec2(0.01, 0.0)) - c, poolN(p + vec2(0.0, 0.01)) - c) / 0.01; }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Deep at the heart of the pool, paler toward the kerb where the floor shows through.
        float poolRr = clamp(length(vPoolL) / uPoolR, 0.0, 1.0);
        vec3 poolTint = mix(uDeep, uShallow, smoothstep(0.25, 1.0, poolRr) * 0.85);
        poolTint *= 0.9 + 0.2 * poolN(vPoolW.xz * 0.11 + vec2(uPoolT * 0.004, 0.0));
        // Broken white foam round each impact, churning.
        float poolFoam = 0.0;
        for (int i = 0; i < ${MAX_IMPACTS}; i++) {
          float s = uImp[i].z;
          if (s <= 0.0) continue;
          float d = length(vPoolL - uImp[i].xy);
          float lace = smoothstep(0.38, 0.66, poolN(vPoolL * 0.85 + vec2(uPoolT * 0.21, -uPoolT * 0.17) + float(i) * 0.37) * 0.6 + poolN(vPoolL * 2.1 - vec2(uPoolT * 0.33, uPoolT * 0.26)) * 0.5);
          poolFoam = max(poolFoam, (1.0 - smoothstep(0.15 * s, 0.8 * s, d)) * mix(lace, 1.0, 1.0 - smoothstep(0.0, 0.3 * s, d)));
        }
        diffuseColor.rgb = poolTint;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // Two drifting octaves of ripple, then rings spreading from each impact: h = sin(9d - 6t)·e^-d.
          vec2 g = poolG(vPoolW.xz * 0.21 + vec2(uPoolT * 0.035, uPoolT * 0.022)) * 0.010
                 + poolG(vPoolW.xz * 0.63 - vec2(uPoolT * 0.06, -uPoolT * 0.045)) * 0.006;
          for (int i = 0; i < ${MAX_IMPACTS}; i++) {
            float s = uImp[i].z;
            if (s <= 0.0) continue;
            vec2 dv = vPoolL - uImp[i].xy;
            float d = max(length(dv), 1e-3);
            float ph = 9.0 * d / s - 6.0 * uPoolT;
            g += dv / d * exp(-d / s) * (9.0 * cos(ph) - sin(ph)) * 0.022 * smoothstep(0.05, 0.25, d);
          }
          vec3 gv = (viewMatrix * vec4(g.x, 0.0, g.y, 0.0)).xyz;
          normal = normalize(normal - gv + dot(gv, normal) * normal);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          // Fresnel (Schlick, water's 0.04 at normal incidence) between the depth tint and the sky
          // the rippled surface reflects; sun glints where the ripples catch it.
          vec3 vdir = normalize(vViewPosition);
          float ndv = clamp(dot(vdir, normal), 0.0, 1.0);
          float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
          vec3 rw = (vec4(reflect(-vdir, normal), 0.0) * viewMatrix).xyz;
          vec3 sky = mix(uSkyLow, uSkyHigh, smoothstep(-0.1, 0.9, rw.y));
          sky *= 0.85 + 0.3 * poolN(rw.xz / max(0.25, rw.y) * 0.08 + vPoolW.xz * 0.02);
          diffuseColor.rgb *= (1.0 - fres) * 0.7;
          totalEmissiveRadiance += poolTint * 0.18 + sky * (fres * 1.3 + 0.03);
          vec3 sunDir = normalize(vec3(0.25, 0.5, -0.83));
          float sd = max(dot(normalize(rw), sunDir), 0.0);
          float twinkle = smoothstep(0.42, 0.62, poolN(vPoolW.xz * 1.13 + vec2(uPoolT * 0.11, -uPoolT * 0.07)) * poolN(mat2(0.8, 0.6, -0.6, 0.8) * vPoolW.xz * 1.71 - vec2(uPoolT * 0.05, uPoolT * 0.09)));
          totalEmissiveRadiance += vec3(1.0, 0.96, 0.86) * (pow(sd, 350.0) * twinkle * 1.6 + pow(sd, 24.0) * 0.08);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.94, 0.95), poolFoam * 0.85);
          totalEmissiveRadiance += vec3(0.25, 0.3, 0.32) * poolFoam;
          diffuseColor.a = clamp(0.8 + fres * 0.5 + poolFoam * 0.4, 0.0, 1.0);
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'pool2';
  mat.userData.decal = true;
  mat.userData.noOcclude = true;
  return mat;
}

/**
 * Falling water: streaks stretched along the fall (1:8) pouring down at two speeds, edges broken up
 * by noise, a bright lip at the top, white aeration growing toward the foot and a slight sideways
 * wobble. UV v runs 1 at the top to 0 at the foot; `len` and `width` are the fall's size in world
 * units (so streaks keep their scale on any sheet). Never casts a shadow.
 */
export function fallingWaterMaterial(time: { value: number }, seed: number, len: number, width: number) {
  const uniforms = {
    uFallT: time,
    uNoise: { value: noiseTexture() },
    uFallLen: { value: len },
    uFallW: { value: width },
    uFallSeed: { value: (seed * 0.6180339) % 1 },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, transparent: true, depthWrite: false, side: THREE.DoubleSide, emissive: 0x1e4a52 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFallUv;\nuniform float uFallT;\nuniform float uFallSeed;\nuniform float uFallLen;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvFallUv = vec2(uv.x, 1.0 - uv.y);')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed.x += sin(uFallT * 5.0 + vFallUv.y * uFallLen * 1.7 + uFallSeed * 40.0) * 0.03 * vFallUv.y;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vFallUv;
        uniform float uFallT;
        uniform float uFallLen;
        uniform float uFallW;
        uniform float uFallSeed;
        uniform sampler2D uNoise;
        float fallN(vec2 p) { return texture2D(uNoise, p).r; }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float fy = vFallUv.y * uFallLen, fx = vFallUv.x * uFallW;
          float s1 = fallN(vec2(fx * 1.6 + uFallSeed, fy * 0.2 - uFallT * 0.9));
          float s2 = fallN(vec2(fx * 3.1 - uFallSeed, fy * 0.39 - uFallT * 1.75));
          float streak = smoothstep(0.42, 0.8, s1 * 0.55 + s2 * 0.55);
          float aer = smoothstep(0.3, 1.0, vFallUv.y);
          float lip = 1.0 - smoothstep(0.0, min(0.15, 0.35 / max(uFallLen, 0.1)), vFallUv.y);
          float en = fallN(vec2(fy * 0.45 - uFallT * 1.3, uFallSeed + fx * 0.6));
          float ex = abs(vFallUv.x * 2.0 - 1.0);
          float edge = 1.0 - smoothstep(0.45 - 0.3 * en, 1.0 - 0.2 * en, ex);
          float white = clamp(streak * 0.65 + aer * (0.45 + 0.4 * s2) + lip * 0.6, 0.0, 1.0);
          diffuseColor.rgb = mix(vec3(0.16, 0.42, 0.5), vec3(0.88, 0.96, 0.98), white);
          diffuseColor.a = clamp((0.5 + 0.35 * streak + 0.3 * aer + 0.3 * lip) * edge, 0.0, 0.95);
        }`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 1.0 + 2.0 * diffuseColor.r;');
  };
  mat.customProgramCacheKey = () => 'fall2';
  mat.userData.decal = true;
  mat.userData.noOcclude = true;
  return mat;
}

/**
 * Two crossed ribbons along a curve of points (a jet or a stream from a jaw): one flat across the
 * curve's horizontal side, one turned a quarter about it, so the stream has body from any side.
 * `w0` and `w1` are its width at the start and the end. UV v is 1 at the start, 0 at the end.
 */
export function crossedRibbons(pts: THREE.Vector3[], w0: number, w1: number) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = lens[lens.length - 1];
  const up = new THREE.Vector3(0, 1, 0), t = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  for (const sheet of [0, 1]) {
    const base = pos.length / 3;
    pts.forEach((p, i) => {
      t.subVectors(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]).normalize();
      a.crossVectors(t, up);
      if (a.lengthSq() < 1e-6) a.set(1, 0, 0);
      a.normalize();
      const side = sheet ? b.crossVectors(t, a).normalize() : a;
      const f = lens[i] / total, hw = (w0 + (w1 - w0) * f) / 2;
      pos.push(p.x - side.x * hw, p.y - side.y * hw, p.z - side.z * hw, p.x + side.x * hw, p.y + side.y * hw, p.z + side.z * hw);
      uv.push(0, 1 - f, 1, 1 - f);
      if (i) idx.push(base + i * 2 - 2, base + i * 2 - 1, base + i * 2, base + i * 2 - 1, base + i * 2 + 1, base + i * 2);
    });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, len: total };
}

/** A ballistic arc from `a` to `b` peaking `rise` above the higher end, in `n` steps. */
export function arc(a: THREE.Vector3, b: THREE.Vector3, rise: number, n = 16) {
  // y(s) = A s² + B s + a.y through b.y at s = 1 with its top at max(a.y, b.y) + rise.
  const top = Math.max(a.y, b.y) + rise, d = b.y - a.y, h = top - a.y;
  // h = -B² / 4A and A + B = d: B = 2(h + sqrt(h² - h d)), A = d - B.
  const B = 2 * (h + Math.sqrt(Math.max(0, h * h - h * d))), A = d - B;
  return Array.from({ length: n + 1 }, (_, i) => {
    const s = i / n;
    return new THREE.Vector3(a.x + (b.x - a.x) * s, a.y + A * s * s + B * s, a.z + (b.z - a.z) * s);
  });
}

/** A falling stream: projectile from `a` leaving at horizontal speed so it lands at `b`, `lift` up first. */
export function pour(a: THREE.Vector3, b: THREE.Vector3, lift: number, n = 24) {
  const g = 9.8, drop = a.y - b.y;
  const t = (lift + Math.sqrt(lift * lift + 2 * g * drop)) / g;
  return Array.from({ length: n + 1 }, (_, i) => {
    // Denser near the foot, where the stream bends most.
    const s = Math.sqrt(i / n) * t;
    return new THREE.Vector3(a.x + ((b.x - a.x) * s) / t, a.y + lift * s - 0.5 * g * s * s, a.z + ((b.z - a.z) * s) / t);
  });
}

let mistTex: THREE.DataTexture | null = null;
/** A soft round puff (white, alpha falling off to the rim) for spray and mist sprites. */
export function mistTexture() {
  if (mistTex) return mistTex;
  const N = 64, data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2) / (N / 2), i = (y * N + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255;
    data[i + 3] = Math.round(255 * Math.max(0, 1 - d) ** 2);
  }
  mistTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  mistTex.magFilter = mistTex.minFilter = THREE.LinearFilter;
  mistTex.needsUpdate = true;
  return mistTex;
}
