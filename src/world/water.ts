import * as THREE from 'three';
import { WebGPUCoordinateSystem } from 'three';
import type { Node, Renderer } from 'three/webgpu';
import { abs, attribute, cameraViewMatrix, cos, diffuseColor, dot, float, If, length, mat3, max, min, mix, normalize, normalView, positionGeometry, positionView, positionWorld, pow, reflect, saturate, sin, smoothstep, transpose, vec2, vec3, vec4 } from 'three/tsl';
import { addPatch, rot2, type F, type V2, type V3, type V4 } from '../render/patch';
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

/** A mirror a pool can show (see planarReflection). */
export interface PoolMirror {
  texture: THREE.Texture;
  texMat: THREE.Matrix4;
  on: { value: number };
}

/** Towards the sun the water's glints show: low ahead of the play camera. */
export const SUN_GLINT = vec3(0.25, 0.5, -0.83).normalize();

/**
 * Where a world position lands in a mirror's picture (its `texMat`, see planarReflection), nudged by
 * `off` (in the picture's own units, up the picture positive).
 */
export function mirrorUV(texMat: Node<'mat4'>, world: V3, off: V2): V2 {
  const rc = texMat.mul(vec4(world, 1)) as V4;
  return rc.xy.div(rc.w).add(off);
}

/**
 * Still pool water: a depth tint from pale at the rim to deep at the centre over a dark floor, two
 * drifting octaves of ripple normals, rings spreading from every impact point with broken white
 * foam round it, a thin lace of foam where the water meets the kerb, caustic light dancing in the
 * shallows, a Fresnel mix toward the reflected sky (or, with `mirror`, the mirrored statue over
 * it) and sun glints on the ripples. `r` is the pool's radius in its own space (the tint's scale);
 * `impacts` are where water falls into it.
 */
export function poolWater(time: { value: number }, r: number, impacts: Impact[] = [], mirror: PoolMirror | null = null) {
  const imps = impacts.slice(0, MAX_IMPACTS);
  const uniforms: Record<string, { value: unknown }> = {
    uPoolT: time,
    uNoise: { value: noiseTexture() },
    uPoolR: { value: r },
    uShallow: { value: new THREE.Color(0x3f9a9e) },
    uDeep: { value: new THREE.Color(0x0e4450) },
    uImp: { value: Array.from({ length: MAX_IMPACTS }, (_, i) => new THREE.Vector3(...(imps[i] ?? [0, 0, 0]))) },
    uReflMat: { value: mirror?.texMat ?? new THREE.Matrix4() },
    uReflOn: mirror?.on ?? { value: 0 },
    ...WATER_SKY,
  };
  if (mirror) uniforms.uRefl = { value: mirror.texture };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0, transparent: true, depthWrite: false });
  addPatch(mat, {
    key: mirror ? 'pool4-mirror' : 'pool4',
    uniforms,
    nodes(u) {
      const t = u.f('uPoolT');
      const poolN = (p: V2) => u.tex('uNoise').sample(p).r;
      const poolG = (p: V2) => {
        const c = poolN(p).toVar();
        return vec2(poolN(p.add(vec2(0.01, 0))).sub(c), poolN(p.add(vec2(0, 0.01))).sub(c)).div(0.01);
      };
      const W = positionWorld, L = positionGeometry.xz;
      const imp = u.v3a('uImp');
      // Set by the colour, read by the emission.
      let tint: V3 = vec3(0), foam: F = float(0), envC: V3 = vec3(0), rw: V3 = vec3(0), rr: F = float(0);
      return {
        color() {
          // Deep at the heart of the pool, turquoise toward the kerb where the floor shows through.
          rr = saturate(length(L).div(u.f('uPoolR'))).toVar();
          tint = mix(u.v3('uDeep').mul(0.8), u.v3('uShallow').mul(1.08), smoothstep(0.2, 0.98, rr))
            .mul(poolN(W.xz.mul(0.11).add(vec2(t.mul(0.004), 0))).mul(0.3).add(0.85)).toVar();
          // Broken white foam round each impact, churning.
          foam = float(0).toVar();
          for (let i = 0; i < MAX_IMPACTS; i++) {
            const im = imp.element(i);
            const s = im.z;
            const d = length(L.sub(im.xy));
            const lace = smoothstep(0.38, 0.66, poolN(L.mul(0.85).add(vec2(t.mul(0.21), t.mul(-0.17))).add(i * 0.37)).mul(0.6).add(poolN(L.mul(2.1).sub(vec2(t.mul(0.33), t.mul(0.26)))).mul(0.5)));
            If(s.greaterThan(0), () => {
              foam.assign(max(foam, float(1).sub(smoothstep(s.mul(0.15), s.mul(0.8), d)).mul(mix(lace, 1, float(1).sub(smoothstep(0, s.mul(0.3), d))))));
            });
          }
          // A thin broken line of foam where the water laps the kerb.
          const rimLace = smoothstep(0.42, 0.64, poolN(L.mul(1.7).add(vec2(t.mul(0.09), t.mul(-0.07)))));
          foam.assign(max(foam, smoothstep(0.955, 0.995, rr).mul(rimLace).mul(0.8)));
          // Fresnel (Schlick, water's 0.04 at normal incidence) between the depth tint and the sky the
          // rippled surface reflects; sun glints where the ripples catch it. The reflection sees a
          // calmer surface than the lighting (the ripples soften what it shows, as roughness blurs it):
          // sky as a smooth gradient, never blotches.
          const vdir = positionView.negate().normalize();
          const flatV = normalize(mat3(cameraViewMatrix).mul(vec3(0, 1, 0))).toVar();
          const calm = normalize(mix(flatV, normalView, 0.35)).toVar();
          const ndv = saturate(dot(vdir, calm)).toVar();
          const fres = pow(float(1).sub(ndv), 5).mul(0.96).add(0.04).toVar();
          rw = transpose(mat3(cameraViewMatrix)).mul(reflect(vdir.negate(), calm)).toVar();
          const sky = mix(u.v3('uSkyLow'), u.v3('uSkyHigh'), smoothstep(-0.1, 0.9, rw.y)).mul(poolN(rw.xz.div(max(rw.y, 0.25)).mul(0.05).add(W.xz.mul(0.02))).mul(0.1).add(0.95));
          envC = sky.mul(fres.mul(1.3).add(0.03)).toVar();
          const col = tint.toVar();
          if (mirror) {
            // The statue mirrored over the pool, wavering with the ripples; the sky round it. A soft,
            // coherent image: sampled through the calm surface (only a gentle waver, never torn by the
            // impact rings), blurred over a disc of taps into a soft glow, and only as strong as the
            // angle allows: gone when looked down on from the play camera (the pool then shows its sky
            // and teal) and at the most grazing looks, clearest at a low oblique view. Tinted by the water.
            const ruv = mirrorUV(u.m4('uReflMat'), W, calm.xy.sub(flatV.xy).mul(0.012)).toVar();
            let mir: V4 = vec4(0);
            for (let j = 0; j < 7; j++) {
              const a = j * 2.39996, k = j === 0 ? 0 : 0.012 + 0.004 * j;
              mir = mir.add(u.tex('uRefl').sample(ruv.add(vec2(Math.cos(a) * k, Math.sin(a) * k))));
            }
            const m = mir.div(7).toVar();
            const glance = float(1).sub(ndv);
            const cover = smoothstep(0.15, 0.85, m.a).mul(u.f('uReflOn')).mul(0.55).mul(smoothstep(0.45, 0.78, glance)).mul(float(1).sub(smoothstep(0.93, 1, glance))).toVar();
            envC.assign(mix(envC, mix(m.rgb, m.rgb.mul(tint).mul(2.2), 0.35).mul(fres.mul(0.3).add(0.85)), cover));
            col.mulAssign(float(1).sub(cover.mul(0.5)));
          }
          col.mulAssign(float(1).sub(fres).mul(0.7));
          diffuseColor.a.assign(saturate(fres.mul(0.5).add(0.8).add(foam.mul(0.4))));
          return mix(col, vec3(0.88, 0.94, 0.95), foam.mul(0.85));
        },
        normal(n) {
          // Two drifting octaves of ripple, then rings spreading from each impact: h = sin(9d - 6t)·e^-d.
          let g = poolG(W.xz.mul(0.21).add(vec2(t.mul(0.035), t.mul(0.022)))).mul(0.026)
            .add(poolG(W.xz.mul(0.63).sub(vec2(t.mul(0.06), t.mul(-0.045)))).mul(0.012));
          for (let i = 0; i < MAX_IMPACTS; i++) {
            const im = imp.element(i);
            const s = max(im.z, 1e-3);
            const dv = L.sub(im.xy);
            const d = max(length(dv), 1e-3);
            const ph = d.mul(9).div(s).sub(t.mul(6));
            g = g.add(dv.div(d).mul(d.negate().div(s).exp()).mul(cos(ph).mul(9).sub(sin(ph))).mul(smoothstep(0.05, 0.25, d)).mul(0.022).mul(im.z.greaterThan(0).select(float(1), float(0))));
          }
          const gv = mat3(cameraViewMatrix).mul(vec3(g.x, 0, g.y)).toVar();
          return normalize(n.sub(gv).add(n.mul(dot(gv, n))));
        },
        emissive(e) {
          // Caustic light over the shallow floor near the kerb.
          const ca = poolN(W.xz.mul(0.55).add(vec2(t.mul(0.035), t.mul(0.013))));
          const cb = poolN(W.xz.mul(0.73).add(vec2(0.37, 0.61)).sub(vec2(t.mul(0.015), t.mul(0.03))));
          const caus = pow(float(1).sub(abs(ca.mul(2).sub(1))).mul(float(1).sub(abs(cb.mul(2).sub(1)))), 4);
          const sd = max(dot(normalize(rw), SUN_GLINT), 0).toVar();
          const twinkle = smoothstep(0.42, 0.62, poolN(W.xz.mul(1.13).add(vec2(t.mul(0.11), t.mul(-0.07)))).mul(poolN(rot2(W.xz, 0.8, 0.6, -0.6, 0.8).mul(1.71).sub(vec2(t.mul(0.05), t.mul(0.09))))));
          return e.add(tint.mul(0.18)).add(envC)
            .add(vec3(0.45, 0.9, 0.85).mul(caus.mul(smoothstep(0.45, 0.95, rr)).mul(0.18)))
            .add(vec3(1.0, 0.96, 0.86).mul(min(pow(sd, 350).mul(twinkle).mul(0.45).add(pow(sd, 24).mul(0.06)), 0.5)))
            .add(vec3(0.25, 0.3, 0.32).mul(foam));
        },
      };
    },
  });
  mat.userData.decal = true;
  mat.userData.noOcclude = true;
  return mat;
}

/**
 * Falling water: streaks stretched along the fall (1:8) pouring down at two speeds, edges broken up
 * by noise, a bright lip at the top, white aeration growing toward the foot and a slight sideways
 * wobble. UV v runs 1 at the top to 0 at the foot; `len` and `width` are the fall's size in world
 * units (so streaks keep their scale on any sheet); with `fade` it thins away toward its foot (a
 * fall into the void). Never casts a shadow.
 */
export function fallingWaterMaterial(time: { value: number }, seed: number, len: number, width: number, fade = false) {
  const uniforms = {
    uFallT: time,
    uNoise: { value: noiseTexture() },
    uFallLen: { value: len },
    uFallW: { value: width },
    uFallSeed: { value: (seed * 0.6180339) % 1 },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, transparent: true, depthWrite: false, side: THREE.DoubleSide, emissive: 0x1e4a52 });
  addPatch(mat, {
    key: fade ? 'fall2-fade' : 'fall2',
    uniforms,
    nodes(u) {
      const t = u.f('uFallT'), seedU = u.f('uFallSeed'), lenU = u.f('uFallLen');
      const uv = attribute('uv', 'vec2') as V2;
      const fallUv = vec2(uv.x, float(1).sub(uv.y));
      const fallN = (p: V2) => u.tex('uNoise').sample(p).r;
      return {
        position: (p) => vec3(p.x.add(sin(t.mul(5).add(fallUv.y.mul(lenU).mul(1.7)).add(seedU.mul(40))).mul(0.03).mul(fallUv.y)), p.y, p.z),
        color() {
          const fy = fallUv.y.mul(lenU).toVar(), fx = fallUv.x.mul(u.f('uFallW')).toVar();
          const s1 = fallN(vec2(fx.mul(1.6).add(seedU), fy.mul(0.2).sub(t.mul(0.9))));
          const s2 = fallN(vec2(fx.mul(3.1).sub(seedU), fy.mul(0.39).sub(t.mul(1.75)))).toVar();
          const streak = smoothstep(0.42, 0.8, s1.mul(0.55).add(s2.mul(0.55))).toVar();
          const aer = smoothstep(0.3, 1, fallUv.y).toVar();
          const lip = float(1).sub(smoothstep(0, min(0.15, float(0.35).div(max(lenU, 0.1))), fallUv.y)).toVar();
          const en = fallN(vec2(fy.mul(0.45).sub(t.mul(1.3)), seedU.add(fx.mul(0.6))));
          const ex = abs(fallUv.x.mul(2).sub(1));
          const edge = float(1).sub(smoothstep(float(0.45).sub(en.mul(0.3)), float(1).sub(en.mul(0.2)), ex));
          const white = saturate(streak.mul(0.65).add(aer.mul(s2.mul(0.4).add(0.45))).add(lip.mul(0.6)));
          let a = streak.mul(0.35).add(0.5).add(aer.mul(0.3)).add(lip.mul(0.3)).mul(edge).clamp(0, 0.95);
          if (fade) a = a.mul(float(1).sub(smoothstep(0.45, 1, fallUv.y)));
          diffuseColor.a.assign(a);
          return mix(vec3(0.16, 0.42, 0.5), vec3(0.88, 0.96, 0.98), white);
        },
        emissive: (e) => e.mul(diffuseColor.r.mul(2).add(1)),
      };
    },
  });
  mat.userData.decal = true;
  mat.userData.noOcclude = true;
  return mat;
}

/**
 * Two crossed ribbons along a curve of points (a jet or a stream from a jaw): one flat across the
 * curve's horizontal side, one turned a quarter about it, so the stream has body from any side.
 * `w0` and `w1` are its width at the start and the end. UV v is 1 at the start, 0 at the end. A
 * broad fall (a sheet wider than it is thick) takes the flat ribbon alone (`sheets` 1).
 */
export function crossedRibbons(pts: THREE.Vector3[], w0: number, w1: number, sheets = 2) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = lens[lens.length - 1];
  const up = new THREE.Vector3(0, 1, 0), t = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let sheet = 0; sheet < sheets; sheet++) {
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

/** A light, with its shadow if it casts one. */
type Shadowed = THREE.Light & { shadow?: THREE.LightShadow };

/**
 * A mirror of the scene about a water plane, rendered into a reduced-resolution HDR target just
 * before the water draws (three.js Reflector's oblique-clip method, so nothing under the surface
 * is mirrored). Only for perspective cameras; the water hides itself while the mirror renders.
 * `level` is the plane's height (or reads it each frame, for water that stands on a prop); with
 * `layer` the mirror draws only the objects on that layer (and every light), a cheap reflection of
 * one close subject such as a fountain's statue; `coarse` divides the screen's resolution for it
 * (rippled water hides a coarser mirror). A `lazy` mirror of still things (a moat's walls) is drawn
 * again only when the camera has moved, and while it moves on every other frame.
 */
export function planarReflection(level: number | (() => number), layer?: number, coarse = 2, lazy = false) {
  let y = typeof level === 'number' ? level : 0;
  let lights: Shadowed[] | null = null;
  const rt = new THREE.RenderTarget(1, 1, { type: THREE.HalfFloatType });
  const texMat = new THREE.Matrix4(), vcam = new THREE.PerspectiveCamera();
  const normal = new THREE.Vector3(0, 1, 0), onPlane = new THREE.Vector3(0, y, 0);
  const camPos = new THREE.Vector3(), view = new THREE.Vector3(), look = new THREE.Vector3(), target = new THREE.Vector3();
  const rot = new THREE.Matrix4(), plane = new THREE.Plane(), clip = new THREE.Vector4(), qv = new THREE.Vector4();
  const size = new THREE.Vector2(), clearC = new THREE.Color();
  const on = { value: 0 };
  let busy = false, drawnFor: THREE.Camera | null = null, waited = 0;
  const drawnAt = new THREE.Matrix4(), drawnProj = new THREE.Matrix4();
  // (`frame`: the renderer drawing the frame, as an object's onBeforeRender receives it.)
  const render = (frame: unknown, scene: THREE.Scene, camera: THREE.Camera, self: THREE.Object3D) => {
    const renderer = frame as Renderer;
    if (lazy && on.value && drawnFor === camera && !busy) {
      renderer.getDrawingBufferSize(size);
      const a = drawnAt.elements, b = camera.matrixWorld.elements;
      const still = drawnAt.equals(camera.matrixWorld) && drawnProj.equals(camera.projectionMatrix);
      // (A step of the following camera, not a cut to somewhere else.)
      const near = drawnProj.equals(camera.projectionMatrix) && Math.hypot(a[12] - b[12], a[13] - b[13], a[14] - b[14]) < 0.3 && [0, 1, 2, 4, 5, 6, 8, 9, 10].every((k) => Math.abs(a[k] - b[k]) < 0.01);
      const fits = rt.width === Math.max(64, Math.round(size.x / coarse)) && rt.height === Math.max(64, Math.round(size.y / coarse));
      if (fits && (still || (near && waited < 1))) {
        if (!still) waited++;
        return;
      }
    }
    on.value = 0;
    if (busy || !(camera as THREE.PerspectiveCamera).isPerspectiveCamera) return;
    if (typeof level !== 'number') y = level();
    // (The scene's lights: their shadows were drawn for this frame already, and every light shines in a layer mirror.)
    if (!lights) {
      const found: Shadowed[] = [];
      scene.traverse((o) => {
        if (!(o as THREE.Light).isLight) return;
        found.push(o as Shadowed);
        if (layer !== undefined) o.layers.enable(layer);
      });
      lights = found;
    }
    if (layer !== undefined) vcam.layers.set(layer);
    camPos.setFromMatrixPosition(camera.matrixWorld);
    view.subVectors(onPlane.set(camPos.x, y, camPos.z), camPos);
    if (view.dot(normal) > 0) return;
    view.reflect(normal).negate().add(onPlane);
    rot.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rot).add(camPos);
    target.subVectors(onPlane, look).reflect(normal).negate().add(onPlane);
    vcam.coordinateSystem = camera.coordinateSystem;
    vcam.position.copy(view);
    vcam.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
    vcam.lookAt(target);
    vcam.far = (camera as THREE.PerspectiveCamera).far;
    vcam.updateMatrixWorld();
    vcam.projectionMatrix.copy(camera.projectionMatrix);
    texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse);
    // Oblique near plane on the water surface: nothing below it reaches the mirror.
    plane.setFromNormalAndCoplanarPoint(normal, onPlane).applyMatrix4(vcam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = vcam.projectionMatrix.elements;
    qv.set((Math.sign(clip.x) + pm[8]) / pm[0], (Math.sign(clip.y) + pm[9]) / pm[5], -1, (1 + pm[10]) / pm[14]);
    // (Depth runs 0..1 in WebGPU's clip space and -1..1 in WebGL's.)
    const gpu = renderer.coordinateSystem === WebGPUCoordinateSystem;
    clip.multiplyScalar((gpu ? 1 : 2) / clip.dot(qv));
    pm[2] = clip.x;
    pm[6] = clip.y;
    pm[10] = clip.z + (gpu ? 0 : 1) - 0.003;
    pm[14] = clip.w;
    vcam.projectionMatrixInverse.copy(vcam.projectionMatrix).invert();
    renderer.getDrawingBufferSize(size);
    const W = Math.max(64, Math.round(size.x / coarse)), H = Math.max(64, Math.round(size.y / coarse));
    if (rt.width !== W || rt.height !== H) rt.setSize(W, H);
    busy = true;
    self.visible = false;
    const prevTarget = renderer.getRenderTarget(), prevXr = renderer.xr.enabled;
    const shadows = lights.map((l) => l.shadow?.autoUpdate);
    // No background in the mirror: its alpha then marks where something was reflected, and the
    // painted sky gradient fills the rest.
    const bg = scene.background, prevAlpha = renderer.getClearAlpha();
    renderer.getClearColor(clearC);
    scene.background = null;
    renderer.setClearColor(clearC, 0);
    renderer.xr.enabled = false;
    for (const l of lights) if (l.shadow) l.shadow.autoUpdate = false;
    renderer.setRenderTarget(rt);
    // (The scene's matrices were brought up to date by the frame this mirror draws in.)
    const prevAuto = scene.matrixWorldAutoUpdate;
    scene.matrixWorldAutoUpdate = false;
    renderer.render(scene, vcam);
    scene.matrixWorldAutoUpdate = prevAuto;
    scene.background = bg;
    renderer.setClearColor(clearC, prevAlpha);
    renderer.xr.enabled = prevXr;
    lights.forEach((l, i) => {
      if (l.shadow) l.shadow.autoUpdate = shadows[i] ?? true;
    });
    renderer.setRenderTarget(prevTarget);
    self.visible = true;
    busy = false;
    on.value = 1;
    drawnFor = camera;
    drawnAt.copy(camera.matrixWorld);
    drawnProj.copy(camera.projectionMatrix);
    waited = 0;
  };
  return { texture: rt.texture, texMat, on, render, dispose: () => rt.dispose() };
}
